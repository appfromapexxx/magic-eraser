// Elements
const fileInput = document.getElementById('fileInput');
const uploadBtnMain = document.getElementById('uploadBtnMain');
const uploadBtnSecondary = document.getElementById('uploadBtnSecondary');
const saveBtn = document.getElementById('saveBtn');
const undoBtn = document.getElementById('undoBtn');
const removeBtn = document.getElementById('removeBtn');
const brushSizeInput = document.getElementById('brushSize');
const imageCanvas = document.getElementById('imageCanvas');
const maskCanvas = document.getElementById('maskCanvas');
const ctxImage = imageCanvas.getContext('2d', { willReadFrequently: true });
const ctxMask = maskCanvas.getContext('2d', { willReadFrequently: true });
const placeholder = document.getElementById('placeholder');
const canvasWrapper = document.getElementById('canvasWrapper');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const brushCursor = document.getElementById('brushCursor');
const brushToolBtn = document.getElementById('brushToolBtn');
const magicWandBtn = document.getElementById('magicWandBtn');
const historyBtn = document.getElementById('historyBtn');
const closeHistoryBtn = document.getElementById('closeHistoryBtn');
const historyPanel = document.getElementById('historyPanel');
const historyList = document.getElementById('historyList');
const modelSelectorGroup = document.getElementById('modelSelectorGroup');
const samModelSelect = document.getElementById('samModelSelect');

// State
let originalImage = null;
let isDrawing = false;
let currentTool = 'brush'; // 'brush' or 'magic-wand'
let lastX = 0;
let lastY = 0;
// History System
class HistoryManager {
    constructor() {
        this.reset();
    }

    reset() {
        this.stack = [];
        this.currentIndex = -1;
        this.render();
    }

    // Call this ONLY when starting a fresh image
    init(initialImage) {
        this.reset();
        // Initial state is just the image with empty mask
        // Actually, let's delay adding initial state until first action?
        // Or store initial state as "Uploaded Image".
        this.addToHistory("原始圖片", initialImage, null); // null mask means empty
    }

    addToHistory(actionName, imageBitmap, maskData) {
        // If we are not at the end, truncate future
        if (this.currentIndex < this.stack.length - 1) {
            this.stack = this.stack.slice(0, this.currentIndex + 1);
        }

        // Limit stack size? (e.g., 20)
        if (this.stack.length > 20) {
            this.stack.shift();
            this.currentIndex--;
        }

        this.stack.push({
            name: actionName,
            // We need to clone the data to avoid reference issues
            // For Image: storing URL is cheap but async to load. Storing ImageData is heavy.
            // Let's store ImageData for reliability.
            imageData: this.cloneImageData(imageBitmap ? imageBitmap : ctxImage.getImageData(0, 0, imageCanvas.width, imageCanvas.height)),
            maskData: maskData ? maskData : ctxMask.getImageData(0, 0, maskCanvas.width, maskCanvas.height),
            timestamp: new Date()
        });

        this.currentIndex++;
        this.render();
        this.updateButtons();
    }

    cloneImageData(imageData) {
        if (!imageData) return null; // Should not happen for image
        return new ImageData(
            new Uint8ClampedArray(imageData.data),
            imageData.width,
            imageData.height
        );
    }

    undo() {
        if (this.currentIndex > 0) {
            this.jumpTo(this.currentIndex - 1);
        }
    }

    redo() {
        if (this.currentIndex < this.stack.length - 1) {
            this.jumpTo(this.currentIndex + 1);
        }
    }

    jumpTo(index) {
        if (index < 0 || index >= this.stack.length) return;

        this.currentIndex = index;
        const state = this.stack[index];

        // Restore Image
        ctxImage.putImageData(state.imageData, 0, 0);

        // Restore Mask
        ctxMask.putImageData(state.maskData, 0, 0);

        this.render();
        this.updateButtons();
    }

    updateButtons() {
        // Update standard Undo button state based on index
        undoBtn.disabled = this.currentIndex <= 0;
    }

    render() {
        historyList.innerHTML = '';

        if (this.stack.length === 0) {
            historyList.innerHTML = '<li class="history-item empty">尚未有操作紀錄</li>';
            return;
        }

        this.stack.forEach((state, index) => {
            const li = document.createElement('li');
            li.className = `history-item ${index === this.currentIndex ? 'active' : ''}`;

            // Icon based on name?
            let iconCode = '•';
            if (state.name.includes('筆刷')) iconCode = '🖌️';
            if (state.name.includes('魔術棒')) iconCode = '🪄';
            if (state.name.includes('消除')) iconCode = '✨';
            if (state.name.includes('原始')) iconCode = '🖼️';

            li.innerHTML = `<span>${iconCode}</span> ${state.name}`;

            li.onclick = () => this.jumpTo(index);
            historyList.appendChild(li);
        });

        // Auto scroll to bottom
        historyList.scrollTop = historyList.scrollHeight;
    }
}

const history = new HistoryManager();

// Backend API URL
const API_URL = 'http://localhost:5001';

// Initialization
function init() {
    setupEventListeners();
    resizeCanvas(512, 512);

    // Check backend health
    checkBackendHealth();
}

async function checkBackendHealth() {
    try {
        const response = await fetch(`${API_URL}/health`);
        if (response.ok) {
            console.log("後端伺服器已連接");
        } else {
            showBackendError();
        }
    } catch (e) {
        showBackendError();
    }
}

function showBackendError() {
    console.warn("無法連接後端伺服器");
    alert("無法連接後端伺服器！\n\n請確保已啟動 Python 伺服器：\n1. cd /Users/afa/Downloads/rm\n2. uv run server.py");
}

function setupEventListeners() {
    uploadBtnMain.addEventListener('click', () => fileInput.click());
    uploadBtnSecondary.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', handleImageUpload);

    brushSizeInput.addEventListener('input', (e) => {
        brushSize = parseInt(e.target.value);
        updateCursorSize(brushSize);
    });

    // Canvas Drawing Events
    maskCanvas.addEventListener('mousedown', startDrawing);
    maskCanvas.addEventListener('mousemove', draw);
    maskCanvas.addEventListener('mouseup', stopDrawing);
    maskCanvas.addEventListener('mouseout', stopDrawing);
    maskCanvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        maskCanvas.dispatchEvent(mouseEvent);
    });
    maskCanvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        maskCanvas.dispatchEvent(mouseEvent);
    });
    maskCanvas.addEventListener('touchend', () => {
        const mouseEvent = new MouseEvent('mouseup', {});
        maskCanvas.dispatchEvent(mouseEvent);
    });

    undoBtn.addEventListener('click', undoMask);
    removeBtn.addEventListener('click', runInpainting);
    undoBtn.addEventListener('click', undoMask);
    removeBtn.addEventListener('click', runInpainting);
    saveBtn.addEventListener('click', saveResult);

    // Tool Switching
    brushToolBtn.addEventListener('click', () => setTool('brush'));
    magicWandBtn.addEventListener('click', () => setTool('magic-wand'));

    // History Panel
    undoBtn.addEventListener('click', () => history.undo());
    historyBtn.addEventListener('click', () => historyPanel.classList.toggle('open'));
    closeHistoryBtn.addEventListener('click', () => historyPanel.classList.remove('open'));

    // Drag and Drop
    document.body.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    document.body.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    // Valid resize listener
    window.addEventListener('resize', () => {
        if (originalImage) {
            setupCanvas(originalImage);
        }
    });

    // Custom Cursor Logic
    setupCursorEvents();
}

function setupCursorEvents() {
    // Update cursor size initially
    updateCursorSize(brushSize);

    // Track mouse movement on the wrapper to keep cursor visible even if slightly off canvas (optional, but sticking to wrapper is safer)
    // Actually, sticking to maskCanvas is best for logic, but let's use wrapper for smoother entry/exit
    canvasWrapper.addEventListener('mousemove', (e) => {
        if (!originalImage) return;

        // Show cursor
        brushCursor.style.display = 'block';

        // Update position
        brushCursor.style.left = `${e.clientX}px`;
        brushCursor.style.top = `${e.clientY}px`;
    });

    canvasWrapper.addEventListener('mouseleave', () => {
        brushCursor.style.display = 'none';
    });

    // Also hide when valid drag leaves?
    canvasWrapper.addEventListener('mouseenter', () => {
        if (originalImage) brushCursor.style.display = 'block';
    });
}

function updateCursorSize(size) {
    // Calculate display size based on canvas scaling if needed?
    // The brushSize is in canvas pixels. The canvas might be scaled via CSS (max-width/max-height).
    // Let's get the scaling factor.

    if (!originalImage) {
        brushCursor.style.width = `${size}px`;
        brushCursor.style.height = `${size}px`;
        return;
    }

    const rect = maskCanvas.getBoundingClientRect();
    const scaleX = rect.width / maskCanvas.width;

    // The brush size in CSS pixels
    const visualSize = size * scaleX;

    brushCursor.style.width = `${visualSize}px`;
    brushCursor.style.height = `${visualSize}px`;
}

// Image Handling
function handleImageUpload(e) {
    if (e.target.files && e.target.files[0]) {
        handleFile(e.target.files[0]);
    }
}

function handleFile(file) {
    if (!file.type.match('image.*')) {
        alert('請上傳圖片檔案');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            originalImage = img;
            setupCanvas(img);
            // Update cursor scale after setup
            updateCursorSize(brushSize);
            setTool('brush'); // Default to brush
            placeholder.classList.add('hidden');
            placeholder.style.display = 'none'; // Force hide
            enableTools();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function setupCanvas(img) {
    // Determine scale to fit in view
    const maxWidth = window.innerWidth * 0.9;
    // Reserve space for header and toolbar + generous margins
    // Mobile needs less reserve since header is smaller and we want to maximize image
    const isMobile = window.innerWidth < 768;
    const reservedSpace = isMobile ? 200 : 400;
    const maxHeight = window.innerHeight - reservedSpace;

    let width = img.width;
    let height = img.height;

    const aspectRatio = width / height;

    if (width > maxWidth || height > maxHeight) {
        if (width / maxWidth > height / maxHeight) {
            width = maxWidth;
            height = width / aspectRatio;
        } else {
            height = maxHeight;
            width = height * aspectRatio;
        }
    }

    resizeCanvas(width, height);

    // Draw image
    ctxImage.drawImage(img, 0, 0, width, height);

    // Clear mask
    ctxMask.clearRect(0, 0, width, height);

    // Initialize History with "Original Image"
    // We need ImageData from the image. 
    // Since drawImage is done, we can grab it.
    history.init(ctxImage.getImageData(0, 0, width, height));
}

function resizeCanvas(width, height) {
    imageCanvas.width = width;
    imageCanvas.height = height;
    maskCanvas.width = width;
    maskCanvas.height = height;
    canvasWrapper.style.width = `${width}px`;
    canvasWrapper.style.height = `${height}px`;
    // Update cursor size whenever canvas is resized (in case scale changes)
    updateCursorSize(brushSize);
}

function enableTools() {
    saveBtn.disabled = false;
    removeBtn.disabled = false;
    undoBtn.disabled = true;
}

// Drawing Logic
function startDrawing(e) {
    if (!originalImage) return;

    if (currentTool === 'magic-wand') {
        runMagicWand(e);
        return;
    }

    isDrawing = true;
    [lastX, lastY] = getCoordinates(e);

    saveMaskState(); // Save current state BEFORE starting a new stroke? 
    // No, standard undo usually saves the state AFTER the action.
    // But for drawing, we only save once at the end of the stroke (mouseup).
}

function draw(e) {
    if (!isDrawing) return;

    const [x, y] = getCoordinates(e);

    ctxMask.lineJoin = 'round';
    ctxMask.lineCap = 'round';
    ctxMask.globalCompositeOperation = 'source-over';
    ctxMask.strokeStyle = 'rgba(255, 255, 255, 1)'; // White for mask
    ctxMask.lineWidth = brushSize;

    ctxMask.beginPath();
    ctxMask.moveTo(lastX, lastY);
    ctxMask.lineTo(x, y);
    ctxMask.stroke();

    [lastX, lastY] = [x, y];
}

function stopDrawing() {
    if (isDrawing) {
        isDrawing = false;
        // Action completed, save to history
        // BUT only if we actually drew something? 
        // Let's just save it. "Brush Stroke"
        history.addToHistory("筆刷塗抹");
    }
}

function getCoordinates(e) {
    const rect = maskCanvas.getBoundingClientRect();
    const scaleX = maskCanvas.width / rect.width;
    const scaleY = maskCanvas.height / rect.height;
    return [
        (e.clientX - rect.left) * scaleX,
        (e.clientY - rect.top) * scaleY
    ];
}

function undoMask() {
    history.undo();
}

function updateUndoState() {
    history.updateButtons();
}

function setTool(tool) {
    currentTool = tool;

    // Update UI
    // Update UI
    if (tool === 'brush') {
        brushToolBtn.classList.add('active');
        magicWandBtn.classList.remove('active');
        brushCursor.style.display = 'block';
        maskCanvas.style.cursor = 'none'; // Hide default cursor for brush
        modelSelectorGroup.style.display = 'none';
    } else {
        brushToolBtn.classList.remove('active');
        magicWandBtn.classList.add('active');
        brushCursor.style.display = 'none';
        maskCanvas.style.cursor = 'crosshair'; // Show crosshair for magic wand
        modelSelectorGroup.style.display = 'flex';
    }
}

// --- Magic Wand Logic (SAM) ---

async function runMagicWand(e) {
    if (isProcessing) return; // Prevent multiple clicks

    const [x, y] = getCoordinates(e);

    // Show global loading state (or minimal indicator)
    document.body.style.cursor = 'wait';
    maskCanvas.style.cursor = 'wait';
    isProcessing = true;

    try {
        // Need image base64
        const imageBase64 = imageCanvas.toDataURL('image/png');

        // The backend expects coordinates relative to the original image size? 
        // Or the uploaded image size? server.py resizes mask to image.size.
        // We should send the *original* image coordinates.
        // But here we are sending the canvas content (which IS the original image, just scaled by CSS).
        // Yes, imageCanvas.width = img.width from setupCanvas.

        const response = await fetch(`${API_URL}/segment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: imageBase64,
                x: Math.round(x),
                y: Math.round(y),
                model_type: samModelSelect.value
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Segmentation failed');
        }

        const result = await response.json();

        // Draw the result mask onto the mask canvas (Additive)
        const maskImg = new Image();
        maskImg.onload = () => {
            // Draw new mask on top
            ctxMask.globalCompositeOperation = 'source-over';
            ctxMask.drawImage(maskImg, 0, 0, maskCanvas.width, maskCanvas.height);

            // History
            history.addToHistory("魔術棒選取");

            isProcessing = false;
            document.body.style.cursor = 'default';
            // Restore cursor based on tool
            setTool(currentTool);
        };
        maskImg.src = result.mask;

    } catch (e) {
        console.error("Magic Wand failed:", e);
        // Only alert if it's a real error, not just cancelling
        console.warn("Magic Wand process failed");

        isProcessing = false;
        document.body.style.cursor = 'default';
        setTool(currentTool);

        if (e.message.includes('Failed to fetch')) {
            // Probably backend not running or model loading
            alert("魔術棒功能需要後端伺服器。\n請確認 server.py 正在運行。");
        }
    }
}

let isProcessing = false;


// --- Inpainting Logic (Using Python Backend with LaMa) ---

async function runInpainting() {
    if (!originalImage) {
        alert("請先上傳圖片");
        return;
    }

    // Check if mask has any content
    const maskData = ctxMask.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    let hasMask = false;
    for (let i = 0; i < maskData.data.length; i += 4) {
        if (maskData.data[i] > 0 || maskData.data[i + 1] > 0 || maskData.data[i + 2] > 0) {
            hasMask = true;
            break;
        }
    }

    if (!hasMask) {
        alert("請先在圖片上塗抹要消除的區域");
        return;
    }

    loadingOverlay.hidden = false;
    loadingText.textContent = "正在使用 AI 處理中...";
    progressContainer.hidden = true;

    try {
        // Get image and mask as base64
        const imageBase64 = imageCanvas.toDataURL('image/png');
        const maskBase64 = maskCanvas.toDataURL('image/png');

        // Send to backend
        const response = await fetch(`${API_URL}/inpaint`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                image: imageBase64,
                mask: maskBase64
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || '伺服器錯誤');
        }

        const result = await response.json();

        // Load result image
        const resultImg = new Image();
        resultImg.onload = () => {
            // Draw result on canvas
            ctxImage.drawImage(resultImg, 0, 0, imageCanvas.width, imageCanvas.height);

            // Clear mask
            ctxMask.clearRect(0, 0, maskCanvas.width, maskCanvas.height);

            // Add to history
            history.addToHistory("消除物件");

            loadingOverlay.hidden = true;
            console.log("AI 修復完成！");
        };
        resultImg.src = result.result;

    } catch (e) {
        console.error("Inpainting failed:", e);
        loadingOverlay.hidden = true;

        if (e.message.includes('Failed to fetch')) {
            alert("無法連接後端伺服器！\n\n請確保已啟動 Python 伺服器：\n1. 開啟終端機\n2. cd /Users/afa/Downloads/rm\n3. uv run server.py");
        } else {
            alert("處理失敗: " + e.message);
        }
    }
}

function saveResult() {
    if (!originalImage) return;

    const link = document.createElement('a');
    link.download = 'magic-eraser-result.png';
    link.href = imageCanvas.toDataURL();
    link.click();
}

// Start
init();
