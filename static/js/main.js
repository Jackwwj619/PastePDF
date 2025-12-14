/**
 * PastePDF - 前端交互逻辑
 * 实现 Canvas 拖拽、缩放、旋转等功能
 */

// ==================== 全局状态 ====================
const state = {
    uploadedFiles: new Map(), // file_id -> {filename, pageCount, pages: [{pageNum, width, height, thumbnail, image}]}
    canvasItems: [], // 画布上的元素 [{id, fileId, pageNum, x, y, width, height, rotation, image}]
    selectedItem: null,
    dragState: null, // {type: 'move'|'resize', item, startX, startY, handle, originalRect}
    canvas: null,
    ctx: null,
    canvasWidth: 595,
    canvasHeight: 842,
    backgroundColor: '#ffffff',
    scale: 1, // 画布缩放比例（用于适配屏幕）
    nextItemId: 1
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
}

function initContextMenu() {
    const contextMenu = document.getElementById('contextMenu');

    document.addEventListener('click', () => {
        contextMenu.style.display = 'none';
    });

    contextMenu.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        if (action && state.selectedItem) {
            handleContextMenuAction(action);
        }
        contextMenu.style.display = 'none';
    });
}

function initKeyboard() {
    document.addEventListener('keydown', (e) => {
        if (!state.selectedItem) return;

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
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            alert(`${file.name} 不是 PDF 文件`);
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
                pages: pages
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
    state.scale = Math.min(scaleX, scaleY, 1);

    state.canvas.width = state.canvasWidth;
    state.canvas.height = state.canvasHeight;
    state.canvas.style.width = `${state.canvasWidth * state.scale}px`;
    state.canvas.style.height = `${state.canvasHeight * state.scale}px`;

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
        aspectRatio: width / height  // 保存原始宽高比
    };

    state.canvasItems.push(item);
    state.selectedItem = item;

    render();
    updateItemCount();
}

function handleCanvasMouseDown(e) {
    const rect = state.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / state.scale;
    const y = (e.clientY - rect.top) / state.scale;

    // 检查是否点击了控制点
    if (state.selectedItem) {
        const handle = getHandleAtPoint(state.selectedItem, x, y);
        if (handle) {
            state.dragState = {
                type: 'resize',
                item: state.selectedItem,
                handle: handle,
                startX: x,
                startY: y,
                originalRect: { ...state.selectedItem },
                shiftKey: e.shiftKey
            };
            return;
        }
    }

    // 检查是否点击了元素
    const item = getItemAtPoint(x, y);
    if (item) {
        state.selectedItem = item;
        state.dragState = {
            type: 'move',
            item: item,
            startX: x,
            startY: y,
            offsetX: x - item.x,
            offsetY: y - item.y
        };
        render();
    } else {
        state.selectedItem = null;
        render();
    }
}

function handleCanvasMouseMove(e) {
    const rect = state.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / state.scale;
    const y = (e.clientY - rect.top) / state.scale;

    if (state.dragState) {
        if (state.dragState.type === 'move') {
            // 移动元素
            state.dragState.item.x = x - state.dragState.offsetX;
            state.dragState.item.y = y - state.dragState.offsetY;
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
}

function handleCanvasContextMenu(e) {
    e.preventDefault();

    const rect = state.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / state.scale;
    const y = (e.clientY - rect.top) / state.scale;

    const item = getItemAtPoint(x, y);
    if (item) {
        state.selectedItem = item;
        render();

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

    if (state.selectedItem) {
        const handle = getHandleAtPoint(state.selectedItem, x, y);
        if (handle) {
            cursor = handle.cursor;
        } else if (getItemAtPoint(x, y) === state.selectedItem) {
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
        if (item === state.selectedItem) {
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

    // 绘制选中元素的控制点
    if (state.selectedItem) {
        drawHandles(state.selectedItem);
    }
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

// ==================== 右键菜单操作 ====================
function handleContextMenuAction(action) {
    if (!state.selectedItem) return;

    const index = state.canvasItems.indexOf(state.selectedItem);

    switch (action) {
        case 'bringToFront':
            state.canvasItems.splice(index, 1);
            state.canvasItems.push(state.selectedItem);
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
            state.canvasItems.unshift(state.selectedItem);
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
    if (!state.selectedItem) return;
    state.selectedItem.rotation = (state.selectedItem.rotation + 90) % 360;
    render();
}

function deleteSelectedItem() {
    if (!state.selectedItem) return;
    const index = state.canvasItems.indexOf(state.selectedItem);
    if (index !== -1) {
        state.canvasItems.splice(index, 1);
        state.selectedItem = null;
        render();
        updateItemCount();
    }
}

// ==================== 工具栏操作 ====================
function clearCanvas() {
    if (state.canvasItems.length === 0) return;

    if (confirm('确定要清空画布吗？')) {
        state.canvasItems = [];
        state.selectedItem = null;
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
        items: state.canvasItems.map(item => ({
            file_id: item.fileId,
            page_num: item.pageNum,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            rotation: item.rotation
        }))
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
