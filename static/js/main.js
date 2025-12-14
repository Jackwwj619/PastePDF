/**
 * PastePDF - 前端交互逻辑
 * 实现 Canvas 拖拽、缩放、旋转等功能
 */

// ==================== 全局状态 ====================
const state = {
    uploadedFiles: new Map(), // file_id -> {filename, pageCount, pages: [{pageNum, width, height, thumbnail, image}]}
    canvasItems: [], // 画布上的元素 [{id, fileId, pageNum, x, y, width, height, rotation, image, aspectRatio, crop}]
    selectedItems: [], // 选中的元素数组（支持多选）
    dragState: null, // {type: 'move'|'resize', item, startX, startY, handle, originalRect}
    canvas: null,
    ctx: null,
    canvasWidth: 595,
    canvasHeight: 842,
    backgroundColor: '#ffffff',
    showGrid: false,        // 是否显示网格
    scale: 1,               // 画布缩放比例（用于适配屏幕）
    zoomLevel: 1,           // 用户缩放级别（Ctrl+滚轮）
    panOffset: { x: 0, y: 0 }, // 画布平移偏移量
    isPanning: false,       // 是否正在平移
    panStart: { x: 0, y: 0 }, // 平移起始位置
    nextItemId: 1,
    // 裁剪模式状态
    cropMode: false,        // 是否处于裁剪模式
    cropTarget: null,       // 正在裁剪的元素
    cropRect: null,         // 裁剪矩形 {x, y, width, height}（相对于元素的坐标）
    cropDragState: null,    // 裁剪拖拽状态
    originalPageSize: null  // 原始页面尺寸（用于坐标转换）
};

// 缩放控制点位置
const HANDLE_SIZE = 8;
const HANDLES = [
    { name: 'nw', cursor: 'nw-resize', x: 0, y: 0 },
    { name: 'n', cursor: 'n-resize', x: 0.5, y: 0 },
    { name: 'ne', cursor: 'ne-resize', x: 1, y: 0 },
    { name: 'e', cursor: 'e-resize', x: 1, y: 0.5 },
    { name: 'se', cursor: 'se-resize', x: 1, y: 1 },
    { name: 's', cursor: 's-resize', x: 0.5, y: 1 },
    { name: 'sw', cursor: 'sw-resize', x: 0, y: 1 },
    { name: 'w', cursor: 'w-resize', x: 0, y: 0.5 }
];

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
    initCanvas();
    initUpload();
    initToolbar();
    initSettings();
    initContextMenu();
    initKeyboard();
    initCropMode();
});

function initCanvas() {
    state.canvas = document.getElementById('mainCanvas');
    state.ctx = state.canvas.getContext('2d');

    updateCanvasSize();

    // 绑定鼠标事件
    state.canvas.addEventListener('mousedown', handleCanvasMouseDown);
    state.canvas.addEventListener('mousemove', handleCanvasMouseMove);
    state.canvas.addEventListener('mouseup', handleCanvasMouseUp);
    state.canvas.addEventListener('contextmenu', handleCanvasContextMenu);

    // 绑定拖拽事件（从侧边栏拖拽页面到画布）
    state.canvas.addEventListener('dragover', handleCanvasDragOver);
    state.canvas.addEventListener('drop', handleCanvasDrop);

    // 绑定滚轮事件（Ctrl+滚轮缩放）
    state.canvas.addEventListener('wheel', handleCanvasWheel, { passive: false });

    render();
}

function initUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');

    uploadArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);

    // 拖拽上传
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        handleFileSelect({ target: { files: e.dataTransfer.files } });
    });
}

function initToolbar() {
    document.getElementById('clearBtn').addEventListener('click', clearCanvas);
    document.getElementById('exportBtn').addEventListener('click', exportPDF);

    // 对齐按钮事件
    document.getElementById('alignLeftBtn').addEventListener('click', alignLeft);
    document.getElementById('alignCenterHBtn').addEventListener('click', alignCenterH);
    document.getElementById('alignRightBtn').addEventListener('click', alignRight);
    document.getElementById('alignTopBtn').addEventListener('click', alignTop);
    document.getElementById('alignCenterVBtn').addEventListener('click', alignCenterV);
    document.getElementById('alignBottomBtn').addEventListener('click', alignBottom);
    document.getElementById('distributeHBtn').addEventListener('click', distributeH);
    document.getElementById('distributeVBtn').addEventListener('click', distributeV);
    document.getElementById('alignCanvasCenterBtn').addEventListener('click', alignCanvasCenter);
}

function initSettings() {
    const presetSize = document.getElementById('presetSize');
    const canvasWidth = document.getElementById('canvasWidth');
    const canvasHeight = document.getElementById('canvasHeight');
    const orientationBtn = document.getElementById('orientationBtn');
    const bgColor = document.getElementById('bgColor');

    presetSize.addEventListener('change', (e) => {
        const presets = {
            a4: { width: 595, height: 842 },
            a3: { width: 842, height: 1191 },
            letter: { width: 612, height: 792 }
        };

        if (e.target.value !== 'custom') {
            const size = presets[e.target.value];
            canvasWidth.value = size.width;
            canvasHeight.value = size.height;
            updateCanvasSize();
        }
    });

    canvasWidth.addEventListener('change', () => {
        presetSize.value = 'custom';
        updateCanvasSize();
    });

    canvasHeight.addEventListener('change', () => {
        presetSize.value = 'custom';
        updateCanvasSize();
    });

    orientationBtn.addEventListener('click', () => {
        const temp = canvasWidth.value;
        canvasWidth.value = canvasHeight.value;
        canvasHeight.value = temp;
        orientationBtn.textContent = canvasWidth.value > canvasHeight.value ? '横向' : '纵向';
        presetSize.value = 'custom';
        updateCanvasSize();
    });

    bgColor.addEventListener('change', (e) => {
        state.backgroundColor = e.target.value;
        render();
    });

    const gridToggle = document.getElementById('gridToggle');
    gridToggle.addEventListener('change', (e) => {
        state.showGrid = e.target.checked;
        render();
    });
}

function initContextMenu() {
    const contextMenu = document.getElementById('contextMenu');

    document.addEventListener('click', () => {
        contextMenu.style.display = 'none';
    });

    contextMenu.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        if (action && state.selectedItems.length > 0) {
            handleContextMenuAction(action);
        }
        contextMenu.style.display = 'none';
    });
}

function initKeyboard() {
    document.addEventListener('keydown', (e) => {
        if (state.selectedItems.length === 0) return;

        switch (e.key) {
            case 'Delete':
                deleteSelectedItem();
                break;
            case 'r':
            case 'R':
                rotateSelectedItem();
                break;
        }
    });
}

// ==================== 文件上传 ====================
async function handleFileSelect(e) {
    const files = Array.from(e.target.files);

    for (const file of files) {
        const fileName = file.name.toLowerCase();
        const isValidFile = fileName.endsWith('.pdf') ||
                           fileName.endsWith('.jpg') ||
                           fileName.endsWith('.jpeg') ||
                           fileName.endsWith('.png') ||
                           fileName.endsWith('.gif') ||
                           fileName.endsWith('.bmp');

        if (!isValidFile) {
            alert(`${file.name} 不是支持的文件格式（支持 PDF 和图片）`);
            continue;
        }

        await uploadFile(file);
    }

    // 清空 input
    e.target.value = '';
}

async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            // 加载所有页面的缩略图
            const pages = await Promise.all(
                data.pages.map(async (page) => {
                    const img = await loadImage(page.thumbnail);
                    return { ...page, image: img };
                })
            );

            state.uploadedFiles.set(data.file_id, {
                filename: data.filename,
                pageCount: data.page_count,
                pages: pages,
                type: data.type || 'pdf'  // 存储文件类型
            });

            renderFileList();
        } else {
            alert(`上传失败: ${data.error}`);
        }
    } catch (error) {
        alert(`上传失败: ${error.message}`);
    }
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

function renderFileList() {
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '';

    state.uploadedFiles.forEach((fileInfo, fileId) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';

        const header = document.createElement('div');
        header.className = 'file-item-header';

        const name = document.createElement('div');
        name.className = 'file-item-name';
        name.textContent = `${fileInfo.filename} (${fileInfo.pageCount}页)`;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'file-item-delete';
        deleteBtn.textContent = '×';
        deleteBtn.onclick = () => deleteFile(fileId);

        header.appendChild(name);
        header.appendChild(deleteBtn);

        const pages = document.createElement('div');
        pages.className = 'file-item-pages';

        fileInfo.pages.forEach((page, index) => {
            const thumb = document.createElement('div');
            thumb.className = 'page-thumb';
            thumb.draggable = true;

            const img = document.createElement('img');
            img.src = page.thumbnail;

            const label = document.createElement('span');
            label.textContent = `第${index + 1}页`;

            thumb.appendChild(img);
            thumb.appendChild(label);

            // 拖拽到画布
            thumb.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('application/json', JSON.stringify({
                    fileId: fileId,
                    pageNum: index
                }));
            });

            pages.appendChild(thumb);
        });

        fileItem.appendChild(header);
        fileItem.appendChild(pages);
        fileList.appendChild(fileItem);
    });
}

async function deleteFile(fileId) {
    try {
        const response = await fetch(`/api/file/${fileId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            state.uploadedFiles.delete(fileId);

            // 删除画布上使用该文件的元素
            state.canvasItems = state.canvasItems.filter(item => item.fileId !== fileId);

            renderFileList();
            render();
            updateItemCount();
        }
    } catch (error) {
        alert(`删除失败: ${error.message}`);
    }
}

// ==================== 画布操作 ====================
function updateCanvasSize() {
    state.canvasWidth = parseInt(document.getElementById('canvasWidth').value);
    state.canvasHeight = parseInt(document.getElementById('canvasHeight').value);

    // 计算缩放比例以适应屏幕
    const container = document.querySelector('.canvas-section');
    const maxWidth = container.clientWidth - 40;
    const maxHeight = container.clientHeight - 40;

    const scaleX = maxWidth / state.canvasWidth;
    const scaleY = maxHeight / state.canvasHeight;
    const autoScale = Math.min(scaleX, scaleY, 1);

    // 应用自动缩放和用户缩放
    state.scale = autoScale * state.zoomLevel;

    // 获取设备像素比以提高清晰度
    const dpr = window.devicePixelRatio || 1;

    // 设置 Canvas 的实际像素尺寸（考虑设备像素比）
    state.canvas.width = state.canvasWidth * dpr;
    state.canvas.height = state.canvasHeight * dpr;

    // 设置 Canvas 的显示尺寸
    state.canvas.style.width = `${state.canvasWidth * state.scale}px`;
    state.canvas.style.height = `${state.canvasHeight * state.scale}px`;

    // 缩放绘图上下文以匹配设备像素比
    state.ctx.scale(dpr, dpr);

    render();
}

function handleCanvasDragOver(e) {
    e.preventDefault();
}

function handleCanvasDrop(e) {
    e.preventDefault();

    try {
        const data = JSON.parse(e.dataTransfer.getData('application/json'));
        const { fileId, pageNum } = data;

        const fileInfo = state.uploadedFiles.get(fileId);
        if (!fileInfo) return;

        const page = fileInfo.pages[pageNum];

        // 计算放置位置（考虑缩放）
        const rect = state.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / state.scale;
        const y = (e.clientY - rect.top) / state.scale;

        // 添加到画布
        addItemToCanvas(fileId, pageNum, x, y, page.width / 2, page.height / 2, page.image);
    } catch (error) {
        console.error('Drop error:', error);
    }
}

function addItemToCanvas(fileId, pageNum, x, y, width, height, image) {
    const fileInfo = state.uploadedFiles.get(fileId);
    const item = {
        id: state.nextItemId++,
        fileId,
        pageNum,
        x,
        y,
        width,
        height,
        rotation: 0,
        image,
        aspectRatio: width / height,  // 保存原始宽高比
        type: fileInfo ? fileInfo.type : 'pdf'  // 添加文件类型
    };

    state.canvasItems.push(item);
    state.selectedItems = [item];

    render();
    updateItemCount();
}

function handleCanvasMouseDown(e) {
    const rect = state.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / state.scale;
    const y = (e.clientY - rect.top) / state.scale;

    // 裁剪模式下的处理
    if (state.cropMode) {
        handleCropMouseDown(x, y);
        return;
    }

    // 检查是否点击了控制点（只在单选时显示控制点）
    if (state.selectedItems.length === 1) {
        const handle = getHandleAtPoint(state.selectedItems[0], x, y);
        if (handle) {
            state.dragState = {
                type: 'resize',
                item: state.selectedItems[0],
                handle: handle,
                startX: x,
                startY: y,
                originalRect: { ...state.selectedItems[0] },
                shiftKey: e.shiftKey
            };
            return;
        }
    }

    // 检查是否点击了元素
    const item = getItemAtPoint(x, y);
    if (item) {
        // Ctrl+点击：多选/取消选中
        if (e.ctrlKey || e.metaKey) {
            const index = state.selectedItems.indexOf(item);
            if (index !== -1) {
                // 已选中，取消选中
                state.selectedItems.splice(index, 1);
            } else {
                // 未选中，添加到选中列表
                state.selectedItems.push(item);
            }
        } else {
            // 普通点击：如果点击的是已选中的项，保持多选状态；否则只选中当前项
            if (!state.selectedItems.includes(item)) {
                state.selectedItems = [item];
            }
        }

        // 设置拖拽状态（拖拽所有选中的项）
        state.dragState = {
            type: 'move',
            items: [...state.selectedItems], // 拖拽所有选中项
            startX: x,
            startY: y,
            offsets: state.selectedItems.map(i => ({
                x: x - i.x,
                y: y - i.y
            }))
        };
        render();
    } else {
        // 点击空白区域，清空选中
        state.selectedItems = [];

        // 如果缩放级别大于1，启用画布平移
        if (state.zoomLevel > 1) {
            state.isPanning = true;
            state.panStart = { x: e.clientX, y: e.clientY };
            document.querySelector('.canvas-section').classList.add('panning');
        }

        render();
    }
}

function handleCanvasMouseMove(e) {
    const rect = state.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / state.scale;
    const y = (e.clientY - rect.top) / state.scale;

    // 处理画布平移
    if (state.isPanning) {
        const dx = e.clientX - state.panStart.x;
        const dy = e.clientY - state.panStart.y;

        state.panOffset.x += dx;
        state.panOffset.y += dy;

        state.panStart = { x: e.clientX, y: e.clientY };

        updateCanvasTransform();
        return;
    }

    // 裁剪模式下的处理
    if (state.cropMode) {
        handleCropMouseMove(x, y);
        return;
    }

    if (state.dragState) {
        if (state.dragState.type === 'move') {
            // 移动所有选中的元素
            const dx = x - state.dragState.startX;
            const dy = y - state.dragState.startY;

            state.dragState.items.forEach((item, index) => {
                const offset = state.dragState.offsets[index];
                item.x = x - offset.x;
                item.y = y - offset.y;
            });
            render();
        } else if (state.dragState.type === 'resize') {
            // 缩放元素
            resizeItem(state.dragState, x, y, e.shiftKey);
            render();
        }
    } else {
        // 更新鼠标样式
        updateCursor(x, y);
    }
}

function handleCanvasMouseUp(e) {
    state.dragState = null;
    state.cropDragState = null;

    // 停止平移
    if (state.isPanning) {
        state.isPanning = false;
        document.querySelector('.canvas-section').classList.remove('panning');
    }
}

function handleCanvasContextMenu(e) {
    e.preventDefault();

    const rect = state.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / state.scale;
    const y = (e.clientY - rect.top) / state.scale;

    const item = getItemAtPoint(x, y);
    if (item) {
        // 如果右键点击的项不在选中列表中，只选中当前项
        if (!state.selectedItems.includes(item)) {
            state.selectedItems = [item];
            render();
        }

        const contextMenu = document.getElementById('contextMenu');
        contextMenu.style.display = 'block';
        contextMenu.style.left = `${e.clientX}px`;
        contextMenu.style.top = `${e.clientY}px`;
    }
}

function getItemAtPoint(x, y) {
    // 从后往前查找（后面的元素在上层）
    for (let i = state.canvasItems.length - 1; i >= 0; i--) {
        const item = state.canvasItems[i];
        if (x >= item.x && x <= item.x + item.width &&
            y >= item.y && y <= item.y + item.height) {
            return item;
        }
    }
    return null;
}

function getHandleAtPoint(item, x, y) {
    for (const handle of HANDLES) {
        const hx = item.x + item.width * handle.x;
        const hy = item.y + item.height * handle.y;

        const distance = Math.sqrt((x - hx) ** 2 + (y - hy) ** 2);
        if (distance <= HANDLE_SIZE) {
            return handle;
        }
    }
    return null;
}

function updateCursor(x, y) {
    let cursor = 'default';

    // 只在单选时检查控制点
    if (state.selectedItems.length === 1) {
        const handle = getHandleAtPoint(state.selectedItems[0], x, y);
        if (handle) {
            cursor = handle.cursor;
        } else if (getItemAtPoint(x, y)) {
            cursor = 'move';
        }
    } else if (getItemAtPoint(x, y)) {
        cursor = 'move';
    }

    state.canvas.style.cursor = cursor;
}

function resizeItem(dragState, x, y, shiftKey) {
    const { item, handle, startX, startY, originalRect } = dragState;
    const dx = x - startX;
    const dy = y - startY;

    // 使用元素保存的原始宽高比
    const aspectRatio = item.aspectRatio;

    // 所有缩放操作都保持宽高比（移除了 shiftKey 的判断）
    switch (handle.name) {
        case 'nw':
            // 左上角：根据宽度变化计算
            const newWidth_nw = originalRect.width - dx;
            const newHeight_nw = newWidth_nw / aspectRatio;
            item.x = originalRect.x + originalRect.width - newWidth_nw;
            item.y = originalRect.y + originalRect.height - newHeight_nw;
            item.width = newWidth_nw;
            item.height = newHeight_nw;
            break;
        case 'ne':
            // 右上角：根据宽度变化计算
            const newWidth_ne = originalRect.width + dx;
            const newHeight_ne = newWidth_ne / aspectRatio;
            item.y = originalRect.y + originalRect.height - newHeight_ne;
            item.width = newWidth_ne;
            item.height = newHeight_ne;
            break;
        case 'sw':
            // 左下角：根据宽度变化计算
            const newWidth_sw = originalRect.width - dx;
            const newHeight_sw = newWidth_sw / aspectRatio;
            item.x = originalRect.x + originalRect.width - newWidth_sw;
            item.width = newWidth_sw;
            item.height = newHeight_sw;
            break;
        case 'se':
            // 右下角：根据宽度变化计算
            const newWidth_se = originalRect.width + dx;
            const newHeight_se = newWidth_se / aspectRatio;
            item.width = newWidth_se;
            item.height = newHeight_se;
            break;
        case 'n':
            // 上边：根据高度变化计算宽度
            const newHeight_n = originalRect.height - dy;
            const newWidth_n = newHeight_n * aspectRatio;
            item.y = originalRect.y + dy;
            item.x = originalRect.x + (originalRect.width - newWidth_n) / 2;
            item.width = newWidth_n;
            item.height = newHeight_n;
            break;
        case 's':
            // 下边：根据高度变化计算宽度
            const newHeight_s = originalRect.height + dy;
            const newWidth_s = newHeight_s * aspectRatio;
            item.x = originalRect.x + (originalRect.width - newWidth_s) / 2;
            item.width = newWidth_s;
            item.height = newHeight_s;
            break;
        case 'w':
            // 左边：根据宽度变化计算高度
            const newWidth_w = originalRect.width - dx;
            const newHeight_w = newWidth_w / aspectRatio;
            item.x = originalRect.x + dx;
            item.y = originalRect.y + (originalRect.height - newHeight_w) / 2;
            item.width = newWidth_w;
            item.height = newHeight_w;
            break;
        case 'e':
            // 右边：根据宽度变化计算高度
            const newWidth_e = originalRect.width + dx;
            const newHeight_e = newWidth_e / aspectRatio;
            item.y = originalRect.y + (originalRect.height - newHeight_e) / 2;
            item.width = newWidth_e;
            item.height = newHeight_e;
            break;
    }

    // 确保最小尺寸
    if (item.width < 20) {
        item.width = 20;
        item.height = 20 / aspectRatio;
    }
    if (item.height < 20) {
        item.height = 20;
        item.width = 20 * aspectRatio;
    }
}

// ==================== 渲染 ====================
function render() {
    const ctx = state.ctx;

    // 清空画布
    ctx.fillStyle = state.backgroundColor;
    ctx.fillRect(0, 0, state.canvasWidth, state.canvasHeight);

    // 绘制网格（如果启用）
    if (state.showGrid) {
        drawGrid(ctx);
    }

    // 绘制所有元素
    state.canvasItems.forEach(item => {
        ctx.save();

        // 应用旋转
        if (item.rotation !== 0) {
            const centerX = item.x + item.width / 2;
            const centerY = item.y + item.height / 2;
            ctx.translate(centerX, centerY);
            ctx.rotate(item.rotation * Math.PI / 180);
            ctx.translate(-centerX, -centerY);
        }

        // 绘制图片
        ctx.drawImage(item.image, item.x, item.y, item.width, item.height);

        // 绘制边框
        if (state.selectedItems.includes(item)) {
            ctx.strokeStyle = '#2196F3';
            ctx.lineWidth = 2;
            ctx.strokeRect(item.x, item.y, item.width, item.height);
        } else {
            ctx.strokeStyle = '#e0e0e0';
            ctx.lineWidth = 1;
            ctx.strokeRect(item.x, item.y, item.width, item.height);
        }

        ctx.restore();
    });

    // 绘制选中元素的控制点（只在单选且非裁剪模式时显示）
    if (state.selectedItems.length === 1 && !state.cropMode) {
        drawHandles(state.selectedItems[0]);
    }

    // 绘制裁剪覆盖层（裁剪模式）
    if (state.cropMode && state.cropTarget) {
        drawCropOverlay(ctx);
    }

    // 更新对齐按钮状态
    updateAlignmentButtons();
}

function drawHandles(item) {
    const ctx = state.ctx;

    ctx.fillStyle = '#2196F3';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;

    HANDLES.forEach(handle => {
        const x = item.x + item.width * handle.x;
        const y = item.y + item.height * handle.y;

        ctx.beginPath();
        ctx.arc(x, y, HANDLE_SIZE, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    });
}

function drawGrid(ctx) {
    const minorGridSize = 10; // 次网格间距（点）
    const majorGridSize = 50; // 主网格间距（点）

    ctx.save();

    // 绘制次网格（细线）
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.lineWidth = 0.5;

    for (let x = minorGridSize; x < state.canvasWidth; x += minorGridSize) {
        if (x % majorGridSize !== 0) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, state.canvasHeight);
            ctx.stroke();
        }
    }

    for (let y = minorGridSize; y < state.canvasHeight; y += minorGridSize) {
        if (y % majorGridSize !== 0) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(state.canvasWidth, y);
            ctx.stroke();
        }
    }

    // 绘制主网格（粗线）
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.lineWidth = 1;

    for (let x = majorGridSize; x < state.canvasWidth; x += majorGridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, state.canvasHeight);
        ctx.stroke();
    }

    for (let y = majorGridSize; y < state.canvasHeight; y += majorGridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(state.canvasWidth, y);
        ctx.stroke();
    }

    ctx.restore();
}

// ==================== 右键菜单操作 ====================
function handleContextMenuAction(action) {
    if (state.selectedItems.length === 0) return;

    // 图层操作只对第一个选中项生效
    const item = state.selectedItems[0];
    const index = state.canvasItems.indexOf(item);

    switch (action) {
        case 'bringToFront':
            state.canvasItems.splice(index, 1);
            state.canvasItems.push(item);
            break;
        case 'bringForward':
            if (index < state.canvasItems.length - 1) {
                [state.canvasItems[index], state.canvasItems[index + 1]] =
                [state.canvasItems[index + 1], state.canvasItems[index]];
            }
            break;
        case 'sendBackward':
            if (index > 0) {
                [state.canvasItems[index], state.canvasItems[index - 1]] =
                [state.canvasItems[index - 1], state.canvasItems[index]];
            }
            break;
        case 'sendToBack':
            state.canvasItems.splice(index, 1);
            state.canvasItems.unshift(item);
            break;
        case 'rotate':
            rotateSelectedItem();
            break;
        case 'delete':
            deleteSelectedItem();
            break;
    }

    render();
}

function rotateSelectedItem() {
    if (state.selectedItems.length === 0) return;
    state.selectedItems.forEach(item => {
        item.rotation = (item.rotation + 90) % 360;
    });
    render();
}

function deleteSelectedItem() {
    if (state.selectedItems.length === 0) return;
    state.selectedItems.forEach(item => {
        const index = state.canvasItems.indexOf(item);
        if (index !== -1) {
            state.canvasItems.splice(index, 1);
        }
    });
    state.selectedItems = [];
    render();
    updateItemCount();
}

// ==================== 工具栏操作 ====================
function clearCanvas() {
    if (state.canvasItems.length === 0) return;

    if (confirm('确定要清空画布吗？')) {
        state.canvasItems = [];
        state.selectedItems = [];
        render();
        updateItemCount();
    }
}

async function exportPDF() {
    if (state.canvasItems.length === 0) {
        alert('画布上没有内容');
        return;
    }

    const exportData = {
        canvas_width: state.canvasWidth,
        canvas_height: state.canvasHeight,
        background_color: state.backgroundColor,
        items: state.canvasItems.map(item => {
            const exportItem = {
                file_id: item.fileId,
                page_num: item.pageNum,
                x: item.x,
                y: item.y,
                width: item.width,
                height: item.height,
                rotation: item.rotation,
                type: item.type || 'pdf'  // 添加类型信息
            };

            // 如果有裁剪数据，添加 clip 参数
            if (item.crop) {
                exportItem.clip = [
                    item.crop.x,
                    item.crop.y,
                    item.crop.x + item.crop.width,
                    item.crop.y + item.crop.height
                ];
            }

            return exportItem;
        })
    };

    try {
        const response = await fetch('/api/export', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(exportData)
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'merged.pdf';
            a.click();
            URL.revokeObjectURL(url);
        } else {
            const data = await response.json();
            alert(`导出失败: ${data.error}`);
        }
    } catch (error) {
        alert(`导出失败: ${error.message}`);
    }
}

function updateItemCount() {
    document.getElementById('itemCount').textContent = `已添加 ${state.canvasItems.length} 个页面`;
}

// ==================== 画布缩放 ====================
function handleCanvasWheel(e) {
    // 只在按住 Ctrl 键时缩放，否则允许正常滚动
    if (!e.ctrlKey) {
        return; // 不阻止默认行为，允许容器滚动
    }

    // 阻止 Ctrl+滚轮的默认缩放行为
    e.preventDefault();

    // 计算缩放增量
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newZoomLevel = Math.max(0.1, Math.min(5, state.zoomLevel + delta));

    // 更新缩放级别
    state.zoomLevel = newZoomLevel;

    // 如果缩放回到1，重置平移偏移
    if (state.zoomLevel === 1) {
        state.panOffset = { x: 0, y: 0 };
        updateCanvasTransform();
    }

    // 更新显示
    updateZoomDisplay();

    // 重新计算画布尺寸
    updateCanvasSize();
}

function updateZoomDisplay() {
    const zoomPercent = Math.round(state.zoomLevel * 100);
    document.getElementById('zoomLevel').textContent = `${zoomPercent}%`;
}

function updateCanvasTransform() {
    const wrapper = document.querySelector('.canvas-wrapper');
    wrapper.style.transform = `translate(${state.panOffset.x}px, ${state.panOffset.y}px)`;
}

// ==================== 裁剪模式 ====================
function initCropMode() {
    const cropBtn = document.getElementById('cropBtn');
    const cropApplyBtn = document.getElementById('cropApplyBtn');
    const cropCancelBtn = document.getElementById('cropCancelBtn');

    cropBtn.addEventListener('click', enterCropMode);
    cropApplyBtn.addEventListener('click', () => exitCropMode(true));
    cropCancelBtn.addEventListener('click', () => exitCropMode(false));
}

function enterCropMode() {
    if (state.selectedItems.length === 0) {
        alert('请先选择一个页面');
        return;
    }

    if (state.selectedItems.length > 1) {
        alert('裁剪模式只支持单个页面，请只选择一个页面');
        return;
    }

    const item = state.selectedItems[0];

    // 进入裁剪模式
    state.cropMode = true;
    state.cropTarget = item;

    // 获取原始页面尺寸
    const fileInfo = state.uploadedFiles.get(item.fileId);
    const page = fileInfo.pages[item.pageNum];
    state.originalPageSize = {
        width: page.width,
        height: page.height
    };

    // 初始化裁剪矩形（如果已有裁剪数据则使用，否则使用全尺寸）
    if (item.crop) {
        // 已有裁剪数据，转换为画布坐标
        const scaleX = item.width / item.crop.width;
        const scaleY = item.height / item.crop.height;
        state.cropRect = {
            x: 0,
            y: 0,
            width: item.width,
            height: item.height
        };
    } else {
        // 无裁剪数据，使用全尺寸
        state.cropRect = {
            x: 0,
            y: 0,
            width: item.width,
            height: item.height
        };
    }

    // 显示裁剪操作栏
    document.getElementById('cropActionBar').classList.add('active');
    document.getElementById('cropBtn').classList.add('active');
    document.querySelector('.canvas-section').classList.add('crop-mode');

    render();
}

function exitCropMode(apply) {
    if (apply && state.cropTarget && state.cropRect) {
        applyCrop();
    }

    // 重置裁剪状态
    state.cropMode = false;
    state.cropTarget = null;
    state.cropRect = null;
    state.cropDragState = null;
    state.originalPageSize = null;

    // 隐藏裁剪操作栏
    document.getElementById('cropActionBar').classList.remove('active');
    document.getElementById('cropBtn').classList.remove('active');
    document.querySelector('.canvas-section').classList.remove('crop-mode');

    render();
}

async function applyCrop() {
    const item = state.cropTarget;
    const cropRect = state.cropRect;

    // 计算裁剪区域在源页面坐标系中的位置
    const fileInfo = state.uploadedFiles.get(item.fileId);
    const page = fileInfo.pages[item.pageNum];

    // 计算缩放比例
    const scaleX = page.width / item.width;
    const scaleY = page.height / item.height;

    // 转换裁剪矩形到源页面坐标
    const sourceCrop = {
        x: cropRect.x * scaleX,
        y: cropRect.y * scaleY,
        width: cropRect.width * scaleX,
        height: cropRect.height * scaleY
    };

    // 存储裁剪数据
    item.crop = sourceCrop;

    // 更新宽高比为裁剪后的比例
    item.aspectRatio = sourceCrop.width / sourceCrop.height;

    // 加载裁剪后的缩略图
    const croppedThumbUrl = `/api/thumbnail/${item.fileId}/${item.pageNum}?crop=${sourceCrop.x},${sourceCrop.y},${sourceCrop.width},${sourceCrop.height}`;

    try {
        item.image = await loadImage(croppedThumbUrl);

        // 调整元素尺寸以保持宽高比
        const newHeight = item.width / item.aspectRatio;
        item.height = newHeight;

        render();
    } catch (error) {
        console.error('加载裁剪缩略图失败:', error);
        alert('裁剪失败，请重试');
    }
}

// ==================== 裁剪覆盖层渲染 ====================
function drawCropOverlay(ctx) {
    const item = state.cropTarget;
    const cropRect = state.cropRect;

    // 保存当前状态
    ctx.save();

    // 绘制半透明遮罩覆盖整个画布
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, state.canvasWidth, state.canvasHeight);

    // 清除裁剪区域（使其可见）
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillRect(
        item.x + cropRect.x,
        item.y + cropRect.y,
        cropRect.width,
        cropRect.height
    );

    // 恢复合成模式
    ctx.globalCompositeOperation = 'source-over';

    // 绘制裁剪矩形边框
    ctx.strokeStyle = '#2196F3';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(
        item.x + cropRect.x,
        item.y + cropRect.y,
        cropRect.width,
        cropRect.height
    );
    ctx.setLineDash([]);

    // 恢复状态
    ctx.restore();

    // 绘制裁剪控制点
    drawCropHandles(ctx);
}

function drawCropHandles(ctx) {
    const item = state.cropTarget;
    const cropRect = state.cropRect;

    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#2196F3';
    ctx.lineWidth = 2;

    HANDLES.forEach(handle => {
        const x = item.x + cropRect.x + cropRect.width * handle.x;
        const y = item.y + cropRect.y + cropRect.height * handle.y;

        // 绘制正方形控制点
        ctx.fillRect(x - 5, y - 5, 10, 10);
        ctx.strokeRect(x - 5, y - 5, 10, 10);
    });
}

// ==================== 裁剪交互 ====================
function handleCropMouseDown(x, y) {
    const item = state.cropTarget;
    const cropRect = state.cropRect;

    // 检查是否点击了裁剪控制点
    const handle = getCropHandleAtPoint(x, y);
    if (handle) {
        state.cropDragState = {
            type: 'resize',
            handle: handle,
            startX: x,
            startY: y,
            originalRect: { ...cropRect }
        };
        return;
    }

    // 检查是否点击在裁剪矩形内部
    if (isPointInCropRect(x, y)) {
        state.cropDragState = {
            type: 'move',
            startX: x,
            startY: y,
            originalRect: { ...cropRect }
        };
        return;
    }
}

function handleCropMouseMove(x, y) {
    if (!state.cropDragState) return;

    if (state.cropDragState.type === 'move') {
        moveCropRect(x, y);
    } else if (state.cropDragState.type === 'resize') {
        resizeCropRect(x, y);
    }

    render();
}

function getCropHandleAtPoint(x, y) {
    const item = state.cropTarget;
    const cropRect = state.cropRect;

    for (const handle of HANDLES) {
        const hx = item.x + cropRect.x + cropRect.width * handle.x;
        const hy = item.y + cropRect.y + cropRect.height * handle.y;

        const distance = Math.sqrt((x - hx) ** 2 + (y - hy) ** 2);
        if (distance <= 10) {
            return handle;
        }
    }
    return null;
}

function isPointInCropRect(x, y) {
    const item = state.cropTarget;
    const cropRect = state.cropRect;

    return x >= item.x + cropRect.x &&
           x <= item.x + cropRect.x + cropRect.width &&
           y >= item.y + cropRect.y &&
           y <= item.y + cropRect.y + cropRect.height;
}

function moveCropRect(x, y) {
    const { startX, startY, originalRect } = state.cropDragState;
    const item = state.cropTarget;

    const dx = x - startX;
    const dy = y - startY;

    // 计算新位置
    let newX = originalRect.x + dx;
    let newY = originalRect.y + dy;

    // 限制在元素边界内
    newX = Math.max(0, Math.min(newX, item.width - originalRect.width));
    newY = Math.max(0, Math.min(newY, item.height - originalRect.height));

    state.cropRect.x = newX;
    state.cropRect.y = newY;
}

function resizeCropRect(x, y) {
    const { handle, startX, startY, originalRect } = state.cropDragState;
    const item = state.cropTarget;

    const dx = x - startX;
    const dy = y - startY;

    const newRect = { ...originalRect };

    // 根据控制点调整裁剪矩形
    switch (handle.name) {
        case 'nw':
            newRect.x = Math.max(0, originalRect.x + dx);
            newRect.y = Math.max(0, originalRect.y + dy);
            newRect.width = originalRect.width - (newRect.x - originalRect.x);
            newRect.height = originalRect.height - (newRect.y - originalRect.y);
            break;
        case 'ne':
            newRect.y = Math.max(0, originalRect.y + dy);
            newRect.width = Math.min(item.width - originalRect.x, originalRect.width + dx);
            newRect.height = originalRect.height - (newRect.y - originalRect.y);
            break;
        case 'sw':
            newRect.x = Math.max(0, originalRect.x + dx);
            newRect.width = originalRect.width - (newRect.x - originalRect.x);
            newRect.height = Math.min(item.height - originalRect.y, originalRect.height + dy);
            break;
        case 'se':
            newRect.width = Math.min(item.width - originalRect.x, originalRect.width + dx);
            newRect.height = Math.min(item.height - originalRect.y, originalRect.height + dy);
            break;
        case 'n':
            newRect.y = Math.max(0, originalRect.y + dy);
            newRect.height = originalRect.height - (newRect.y - originalRect.y);
            break;
        case 's':
            newRect.height = Math.min(item.height - originalRect.y, originalRect.height + dy);
            break;
        case 'w':
            newRect.x = Math.max(0, originalRect.x + dx);
            newRect.width = originalRect.width - (newRect.x - originalRect.x);
            break;
        case 'e':
            newRect.width = Math.min(item.width - originalRect.x, originalRect.width + dx);
            break;
    }

    // 确保最小尺寸
    if (newRect.width >= 20 && newRect.height >= 20) {
        state.cropRect = newRect;
    }
}

// ==================== 对齐功能 ====================

// 获取选中项的边界框
function getSelectionBounds(items) {
    if (items.length === 0) return null;

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    items.forEach(item => {
        minX = Math.min(minX, item.x);
        minY = Math.min(minY, item.y);
        maxX = Math.max(maxX, item.x + item.width);
        maxY = Math.max(maxY, item.y + item.height);
    });

    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

// 水平对齐 - 左对齐
function alignLeft() {
    if (state.selectedItems.length < 2) return;
    const minX = Math.min(...state.selectedItems.map(i => i.x));
    state.selectedItems.forEach(item => item.x = minX);
    render();
}

// 水平对齐 - 居中
function alignCenterH() {
    if (state.selectedItems.length < 2) return;
    const bounds = getSelectionBounds(state.selectedItems);
    const centerX = bounds.minX + bounds.width / 2;
    state.selectedItems.forEach(item => {
        item.x = centerX - item.width / 2;
    });
    render();
}

// 水平对齐 - 右对齐
function alignRight() {
    if (state.selectedItems.length < 2) return;
    const maxX = Math.max(...state.selectedItems.map(i => i.x + i.width));
    state.selectedItems.forEach(item => {
        item.x = maxX - item.width;
    });
    render();
}

// 垂直对齐 - 顶部对齐
function alignTop() {
    if (state.selectedItems.length < 2) return;
    const minY = Math.min(...state.selectedItems.map(i => i.y));
    state.selectedItems.forEach(item => item.y = minY);
    render();
}

// 垂直对齐 - 居中
function alignCenterV() {
    if (state.selectedItems.length < 2) return;
    const bounds = getSelectionBounds(state.selectedItems);
    const centerY = bounds.minY + bounds.height / 2;
    state.selectedItems.forEach(item => {
        item.y = centerY - item.height / 2;
    });
    render();
}

// 垂直对齐 - 底部对齐
function alignBottom() {
    if (state.selectedItems.length < 2) return;
    const maxY = Math.max(...state.selectedItems.map(i => i.y + i.height));
    state.selectedItems.forEach(item => {
        item.y = maxY - item.height;
    });
    render();
}

// 水平分布
function distributeH() {
    if (state.selectedItems.length < 3) return;

    // 按 x 坐标排序
    const sorted = [...state.selectedItems].sort((a, b) => a.x - b.x);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    // 计算总间距
    const totalWidth = sorted.reduce((sum, item) => sum + item.width, 0);
    const availableSpace = (last.x + last.width) - first.x - totalWidth;
    const gap = availableSpace / (sorted.length - 1);

    // 分布项目
    let currentX = first.x + first.width + gap;
    for (let i = 1; i < sorted.length - 1; i++) {
        sorted[i].x = currentX;
        currentX += sorted[i].width + gap;
    }

    render();
}

// 垂直分布
function distributeV() {
    if (state.selectedItems.length < 3) return;

    // 按 y 坐标排序
    const sorted = [...state.selectedItems].sort((a, b) => a.y - b.y);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    // 计算总间距
    const totalHeight = sorted.reduce((sum, item) => sum + item.height, 0);
    const availableSpace = (last.y + last.height) - first.y - totalHeight;
    const gap = availableSpace / (sorted.length - 1);

    // 分布项目
    let currentY = first.y + first.height + gap;
    for (let i = 1; i < sorted.length - 1; i++) {
        sorted[i].y = currentY;
        currentY += sorted[i].height + gap;
    }

    render();
}

// 相对画布居中
function alignCanvasCenter() {
    if (state.selectedItems.length === 0) return;

    const bounds = getSelectionBounds(state.selectedItems);
    const offsetX = (state.canvasWidth / 2) - (bounds.minX + bounds.width / 2);
    const offsetY = (state.canvasHeight / 2) - (bounds.minY + bounds.height / 2);

    state.selectedItems.forEach(item => {
        item.x += offsetX;
        item.y += offsetY;
    });

    render();
}

// 更新对齐按钮状态
function updateAlignmentButtons() {
    const count = state.selectedItems.length;

    // 需要至少 2 个选中项
    const needsTwo = ['alignLeftBtn', 'alignCenterHBtn', 'alignRightBtn',
                      'alignTopBtn', 'alignCenterVBtn', 'alignBottomBtn'];
    needsTwo.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = count < 2;
    });

    // 需要至少 3 个选中项
    const needsThree = ['distributeHBtn', 'distributeVBtn'];
    needsThree.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = count < 3;
    });

    // 需要至少 1 个选中项
    const btn = document.getElementById('alignCanvasCenterBtn');
    if (btn) btn.disabled = count < 1;
}
