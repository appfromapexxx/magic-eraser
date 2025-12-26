"""
Magic Eraser 後端伺服器
使用 LaMa 模型進行圖片修復 (Inpainting)
手動實作 LaMa 模型載入，支援 Mac M1
"""

import os
os.environ['PYTORCH_ENABLE_MPS_FALLBACK'] = '1'

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from PIL import Image
import io
import base64
import torch
import numpy as np
import cv2
from pathlib import Path
import urllib.request
from ultralytics import SAM

app = Flask(__name__)
CORS(app)

# 取得模型路徑
MODEL_DIR = Path.home() / ".cache" / "magic-eraser"
MODEL_PATH = MODEL_DIR / "big-lama.pt"
MODEL_URL = "https://github.com/enesmsahin/simple-lama-inpainting/releases/download/v0.1.0/big-lama.pt"

# 全域變數
model = None
loaded_sam_models = {} # dict to store loaded SAM models
device = None


def download_model():
    """下載 LaMa 模型"""
    if MODEL_PATH.exists():
        print(f"模型已存在: {MODEL_PATH}")
        return
    
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    print(f"正在下載 LaMa 模型... (約 200MB)")
    print(f"下載路徑: {MODEL_PATH}")
    
    urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
    print("模型下載完成！")


def load_model():
    """載入 LaMa 模型"""
    global model, device
    
    download_model()
    
    # 選擇裝置
    if torch.cuda.is_available():
        device = torch.device("cuda")
        print("使用 NVIDIA CUDA 加速")
    elif torch.backends.mps.is_available():
        device = torch.device("mps")
        print("使用 Apple MPS 加速")
    else:
        device = torch.device("cpu")
        print("使用 CPU")
    
    print(f"正在載入 LaMa 模型 (使用 {device})...")
    
    # 載入模型
    try:
        if str(device) == 'cpu':
             model = torch.jit.load(str(MODEL_PATH), map_location='cpu')
        else:
             # 對於 GPU/MPS，先載入到 CPU 再移動，避免某些 CUDA 版本相容問題
             model = torch.jit.load(str(MODEL_PATH), map_location='cpu')
             model = model.to(device)
    except Exception as e:
        print(f"模型載入失敗，嘗試降級到 CPU: {e}")
        device = torch.device("cpu")
        model = torch.jit.load(str(MODEL_PATH), map_location='cpu')

    model.eval()
    
    print("LaMa 模型載入完成！")


def get_sam_model(model_name='mobile_sam.pt'):
    """惰性載入 SAM 模型"""
    global loaded_sam_models
    
    if model_name not in loaded_sam_models:
        print(f"正在載入 SAM 模型: {model_name}...")
        try:
            # Ultralytics supports auto-downloading 'mobile_sam.pt' and 'sam2_t.pt'
            sam = SAM(model_name)
            loaded_sam_models[model_name] = sam
            print(f"{model_name} 模型載入完成")
        except Exception as e:
            print(f"模型 {model_name} 下載/載入失敗: {e}")
            raise e
            
    return loaded_sam_models[model_name]


def inpaint_image(image: Image.Image, mask: Image.Image) -> Image.Image:
    """
    使用 LaMa 模型進行圖片修復
    
    Args:
        image: 原始圖片 (RGB)
        mask: 遮罩圖片 (灰階，白色區域為需要修復的部分)
    
    Returns:
        修復後的圖片
    """
    global model, device
    
    # 轉換為 numpy
    image_np = np.array(image)
    mask_np = np.array(mask)
    original_image_np = image_np.copy()  # 保留原始圖片用於混合
    
    # 確保 mask 是二值化的
    mask_binary = (mask_np > 10).astype(np.uint8) * 255
    
    # 儲存原始大小
    original_h, original_w = image_np.shape[:2]
    
    # LaMa 最佳處理大小是 512x512 的倍數
    # 但對於較大圖片，我們使用較大的處理尺寸以保留細節
    target_size = 512
    if max(original_h, original_w) > 1024:
        target_size = 1024  # 對於大圖使用更高解析度
    
    # 計算 padding 到 target_size 的倍數
    new_h = ((original_h + target_size - 1) // target_size) * target_size
    new_w = ((original_w + target_size - 1) // target_size) * target_size
    
    # 使用 padding 而不是 resize (保留原始解析度)
    padded_image = np.zeros((new_h, new_w, 3), dtype=np.uint8)
    padded_image[:original_h, :original_w] = image_np
    
    padded_mask = np.zeros((new_h, new_w), dtype=np.uint8)
    padded_mask[:original_h, :original_w] = mask_binary
    
    # 準備輸入張量
    image_tensor = torch.from_numpy(padded_image).permute(2, 0, 1).unsqueeze(0).float() / 255.0
    mask_tensor = torch.from_numpy(padded_mask).unsqueeze(0).unsqueeze(0).float() / 255.0
    
    # 移動到裝置
    image_tensor = image_tensor.to(device)
    mask_tensor = mask_tensor.to(device)
    
    # 推論
    with torch.no_grad():
        inpainted = model(image_tensor, mask_tensor)
    
    # 後處理
    result = inpainted[0].permute(1, 2, 0).cpu().numpy()
    result = (result * 255).clip(0, 255).astype(np.uint8)
    
    # 裁剪回原始大小
    result = result[:original_h, :original_w]
    
    # 關鍵改進：只替換遮罩區域內的像素，保留原始圖片其他部分
    # 創建柔和的遮罩邊緣用於混合
    mask_blur = cv2.GaussianBlur(mask_binary, (21, 21), 0)
    mask_float = mask_blur.astype(np.float32) / 255.0
    mask_3ch = np.stack([mask_float, mask_float, mask_float], axis=-1)
    
    # 混合：遮罩區域用 AI 結果，其他用原圖
    final_result = (result * mask_3ch + original_image_np * (1 - mask_3ch)).astype(np.uint8)
    
    return Image.fromarray(final_result)


@app.route('/health', methods=['GET'])
def health_check():
    """健康檢查端點"""
    return jsonify({"status": "ok", "message": "Magic Eraser 後端運行中"})


@app.route('/inpaint', methods=['POST'])
def inpaint():
    """圖片修復端點"""
    try:
        data = request.get_json()
        
        if not data or 'image' not in data or 'mask' not in data:
            return jsonify({"error": "請提供 image 和 mask 參數"}), 400
        
        # 解碼 Base64 圖片
        image_data = base64.b64decode(data['image'].split(',')[-1])
        mask_data = base64.b64decode(data['mask'].split(',')[-1])
        
        # 轉換為 PIL Image
        image = Image.open(io.BytesIO(image_data)).convert('RGB')
        mask = Image.open(io.BytesIO(mask_data)).convert('L')
        
        # 確保遮罩大小與圖片相同
        if mask.size != image.size:
            mask = mask.resize(image.size, Image.Resampling.LANCZOS)
        
        # 執行修復
        print(f"正在處理圖片 ({image.size[0]}x{image.size[1]})...")
        result = inpaint_image(image, mask)
        print("修復完成！")
        
        # 轉換結果為 Base64
        buffered = io.BytesIO()
        result.save(buffered, format="PNG")
        result_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
        
        return jsonify({"result": f"data:image/png;base64,{result_base64}"})
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/segment', methods=['POST'])
def segment():
    """SAM 分割端點"""
    # try: (Removed duplicate)

    try:
        data = request.get_json()
        
        if not data or 'image' not in data or 'x' not in data or 'y' not in data:
            return jsonify({"error": "請提供 image, x, y 參數"}), 400
            
        model_type = data.get('model_type', 'mobile_sam.pt')
        # Map friendly names if needed or direct filename
        # Frontend will send 'mobile_sam.pt' or 'sam2_t.pt'
        
        # 解碼圖片
        image_data = base64.b64decode(data['image'].split(',')[-1])
        image = Image.open(io.BytesIO(image_data)).convert('RGB')
        
        # 取得模型
        sam = get_sam_model(model_type)
        
        # 執行預測
        # MobileSAM 接受 points 參數: [[x, y]]
        # points 參數在 ultralytics 中可能需要調整，這裡使用 predict 方法
        # Ultralytics API: model.predict(source, points=[[x, y]], labels=[1])
        # labels: 1 for foreground, 0 for background
        
        # 注意：ultralytics 的 SAM 介面可能有變動，使用官方標準呼叫方式
        results = sam.predict(image, points=[[data['x'], data['y']]], labels=[1], conf=0.5)
        
        if not results or not results[0].masks:
             return jsonify({"error": "無法識別物件"}), 404
             
        # 取得遮罩 (Binary Mask)
        # results[0].masks.data is a pytorch tensor (N, H, W)
        mask_tensor = results[0].masks.data[0]
        mask_np = mask_tensor.cpu().numpy().astype(np.uint8) * 255
        
        # 確保遮罩大小與原圖一致 (SAM 可能會縮放)
        img_w, img_h = image.size
        # 先 resize 到原圖大小
        mask_resized = cv2.resize(mask_np, (img_w, img_h), interpolation=cv2.INTER_NEAREST)
        
        # 關鍵改進：對遮罩進行膨脹 (Dilation) 以包含邊緣陰影
        # Kernel size 決定膨脹程度，(15, 15) 大約擴展 7-8 像素
        kernel = np.ones((15, 15), np.uint8)
        mask_dilated = cv2.dilate(mask_resized, kernel, iterations=1)
        
        mask_image = Image.fromarray(mask_dilated)
        
        # 轉換為 Base64
        buffered = io.BytesIO()
        mask_image.save(buffered, format="PNG")
        mask_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
        
        return jsonify({"mask": f"data:image/png;base64,{mask_base64}"})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)


if __name__ == '__main__':
    # 載入模型
    load_model()
    
    print("\n" + "="*50)
    print("Magic Eraser 後端伺服器")
    print("="*50)
    print("啟動成功！請開啟瀏覽器訪問: http://localhost:5001")
    print("="*50 + "\n")
    
    app.run(host='0.0.0.0', port=5001, debug=False)
