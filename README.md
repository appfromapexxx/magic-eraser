# Magic Eraser - AI 物件消除工具

![Magic Eraser](https://img.shields.io/badge/AI-Inpainting-blue) ![Python](https://img.shields.io/badge/Backend-Flask-green) ![Frontend](https://img.shields.io/badge/Frontend-Vanilla%20JS-yellow) ![Support](https://img.shields.io/badge/Support-Apple%20Silicon-lightgrey)

這是一個基於 AI 的網頁應用程式，能夠像 Apple Intelligence 的「清除」功能一樣，智彗地移除照片中的物件。

專案整合了 **Segment Anything Model (SAM)** 進行物件選取，以及 **LaMa** 模型進行各種圖像修復，並針對 **Apple Silicon (M1/M2/M3/M4/M5)** 進行了最佳化，支援 MPS (Metal Performance Shaders) 硬體加速。

## ✨ 特點

### 🧠 強大 AI 核心

- **智慧選取 (New!)**：整合 **MobileSAM** 與 **SAM 2** (Segment Anything Model 2)，點擊物件即可自動精準框選，無需手動塗抹。
- **神經網絡修復**：使用 **LaMa (Large Mask Inpainting)** 模型，能夠處理大面積遮擋並生成合理的紋理與結構。
- **自動優化**：遮罩自動膨脹 (Dilation) 處理，確保物件邊緣乾淨消除，無殘留光暈。

### ⚡ 極致效能

- **Apple Silicon 加速**：針對 Mac M 系列晶片 (MPS) 優化。
- **Windows CUDA 支援**：自動偵測 NVIDIA GPU 並啟用 CUDA 加速 (需安裝對應驅動)。
- **高畫質支援**：自動切換高解析度處理模式，並保留原始細節。

### 🎨 現代化介面

- **Cyberpunk 風格**：玻璃擬態與霓虹光暈設計。
- **魔術棒工具**：一鍵選取物件，支援切換「MobileSAM (快速)」與「SAM 2 Tiny (精準)」模型。
- **時光機 (歷史紀錄)**：強大的 Undo/Redo 面板，隨時跳轉回任何步驟（包含已消除的結果）。
- **完全響應式**：支援手機、平板與桌面端操作。

## 🛠 技術架構

### 前端 (Frontend)

- **HTML5 / CSS3**：現代化 Flexbox/Grid 佈局與 CSS Variables。
- **Vanilla JavaScript**：無框架依賴，直接操作 Canvas API。
- **互動設計**：自訂筆刷游標、即時預覽、拖放上傳。

### 後端 (Backend)

- **Python 3.10+** (使用 `uv` 管理)
- **Flask**：提供 RESTful API 並由伺服器直接託管前端頁面。
- **Ultralytics SAM**：執行物件分割模型。
- **PyTorch**：執行 LaMa 修復模型。
- **OpenCV**：影像預處理與遮罩優化。

## 🚀 快速開始

本專案使用 [uv](https://github.com/astral-sh/uv) 進行依賴管理，速度極快且能自動管理 Python 版本。

### 1. 安裝 uv (如果尚未安裝)

**MacOS / Windows:**

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

**Windows:**

```powershell
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
```

### 2. 下載專案並進入目錄

```bash
cd magic-eraser
```

### 3. 啟動伺服器

不需要手動建立虛擬環境，只需執行：

```bash
uv run server.py
```

第一次執行時，系統會自動：

1. 下載並安裝正確的 Python 版本與依賴套件。
2. 下載 LaMa 與 SAM 模型檔案 (第一次下載可能需要幾分鐘)。
3. 啟動伺服器並顯示訪問連結。

### 4. 開始使用

伺服器啟動後，請直接在瀏覽器開啟：
`http://localhost:5001`

（這也意味著您可以在同一區域網路下的手機或平板輸入電腦 IP 來使用！）

## 📱 操作指南

1. **上傳圖片**：拖放或點擊上傳。
2. **選擇工具**：
    - **🖌️ 筆刷**：手動塗抹要消除的區域。
    - **🪄 魔術棒**：點擊畫面上的物件自動選取。可於下方選單切換模型 (MobileSAM / SAM 2)。
3. **執行消除**：點擊「✨ 消除物件」按鈕。
4. **歷史紀錄**：點擊右上角的時鐘圖示打開面板，可隨時復原任何操作。

## ⚠️ 注意事項

- **首次執行**：下載 SAM 與 LaMa 模型需要時間，因為檔案較大 (MobileSAM ~40MB, SAM 2 ~40MB, LaMa ~200MB)。
- **Port**：預設使用 `5001` 埠，若被佔用請修改 `server.py`。
- **部署**：此專案需 Python 後端運行，無法部署至靜態託管服務 (如 GitHub Pages)。

## 🤝 貢獻

歡迎提交 Pull Request 或 Issue！

## 📄 授權

MIT License
