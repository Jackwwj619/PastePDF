# PastePDF - 浏览器端 PDF 拼接工具

## 项目概述

一个基于 Web 的 PDF 页面拼接工具，本地启动服务后通过浏览器访问，支持可视化拖拽布局，将多个 PDF 文件的页面自由排列合并成一页。

**核心原则：使用 PyMuPDF 原生 PDF 操作，非图片转换方式**

## 核心特性

- **零安装使用**：运行 `python app.py` 后，浏览器打开 `http://127.0.0.1:5000` 即可使用
- **可视化拖拽**：在画布上自由拖拽 PDF 页面，所见即所得
- **自由缩放**：拖拽边角调整每个 PDF 页面的大小和比例
- **实时预览**：拖拽过程中实时显示布局效果
- **原生 PDF 合并**：使用 PyMuPDF 的 `show_pdf_page()` 直接嵌入 PDF 页面，保持矢量质量

---

## 技术实现说明

### 预览 vs 导出

| 阶段 | 实现方式 | 说明 |
|------|----------|------|
| **预览** | PDF 页面渲染为图片 | 用于浏览器 Canvas 显示，仅作预览用途 |
| **导出** | PyMuPDF 原生操作 | 使用 `page.show_pdf_page()` 直接嵌入 PDF 内容，保持矢量/文字可选 |

### 为什么这样设计？

1. **浏览器无法直接渲染 PDF 到 Canvas**：必须转图片才能在前端显示
2. **导出时使用原生 PDF 操作**：`show_pdf_page()` 将源 PDF 页面作为 XObject 嵌入，不会栅格化
3. **保持 PDF 质量**：导出的 PDF 中文字可选、矢量图形可缩放、不失真

### 核心 API：`page.show_pdf_page()`

```python
import fitz

# 创建新文档
new_doc = fitz.open()
new_page = new_doc.new_page(width=595, height=842)

# 打开源 PDF
src_doc = fitz.open("source.pdf")

# 将源 PDF 第一页嵌入到目标位置
# rect 定义目标区域 (x0, y0, x1, y1)
dest_rect = fitz.Rect(0, 0, 297, 421)  # 左上角，宽297，高421
new_page.show_pdf_page(dest_rect, src_doc, 0)  # 0 = 第一页

# 支持旋转
new_page.show_pdf_page(dest_rect, src_doc, 0, rotate=90)

new_doc.save("output.pdf")
```

---

## 功能需求

### 1. 文件管理

| 功能 | 描述 | 实现方式 |
|------|------|----------|
| 上传 PDF | 支持点击上传或拖拽文件到上传区域 | Flask 接收文件 |
| 多文件上传 | 支持同时上传多个 PDF 文件 | 多文件表单 |
| 文件列表 | 显示已上传的 PDF 文件列表及缩略图 | PyMuPDF 渲染缩略图 |
| 删除文件 | 支持从列表中删除已上传的文件 | 删除临时文件 |
| 页面选择 | 支持选择 PDF 的特定页面（默认第一页） | 下拉选择 |

### 2. 画布操作（前端交互）

| 功能 | 描述 | 实现方式 |
|------|------|----------|
| 拖拽定位 | 鼠标拖拽 PDF 页面到画布任意位置 | Canvas + JS 事件 |
| **拖拽缩放** | 拖拽边角/边缘调整页面大小 | 8个控制点（四角+四边中点） |
| **保持比例** | 按住 Shift 拖拽时保持宽高比 | JS 事件处理 |
| **自由比例** | 默认可自由调整宽高比例 | 独立调整 width/height |
| 旋转页面 | 支持 90°/180°/270° 旋转 | 旋转按钮或快捷键 |
| 层级调整 | 支持调整重叠页面的上下层级 | 右键菜单或按钮 |
| 对齐辅助 | 拖拽时显示对齐参考线 | Canvas 绘制辅助线 |
| 删除页面 | 从画布删除已添加的页面 | Delete 键或按钮 |

### 3. 画布设置

| 功能 | 描述 |
|------|------|
| 预设尺寸 | A4、A3、Letter、自适应 |
| 自定义尺寸 | 支持输入自定义宽高（单位：pt，1pt = 1/72 inch） |
| 横向/纵向 | 支持切换页面方向 |
| 背景色 | 支持设置输出 PDF 的背景色（默认白色） |

### 4. 导出功能（PyMuPDF 原生）

| 功能 | 描述 | 实现方式 |
|------|------|----------|
| 导出 PDF | 根据画布布局生成合并后的 PDF | `show_pdf_page()` |
| 矢量保持 | 导出 PDF 保持矢量质量，文字可选 | 原生 PDF 嵌入 |
| 文件下载 | 生成后自动下载到本地 | Flask send_file |

---

## API 设计

### 1. 上传 PDF

```
POST /api/upload
Content-Type: multipart/form-data

Request:
  - file: PDF 文件

Response:
{
  "success": true,
  "file_id": "uuid-string",
  "filename": "example.pdf",
  "page_count": 5,
  "pages": [
    {
      "page_num": 0,
      "width": 595,
      "height": 842,
      "thumbnail": "/api/thumbnail/uuid-string/0"
    },
    ...
  ]
}
```

### 2. 获取页面缩略图（仅用于预览）

```
GET /api/thumbnail/<file_id>/<page_num>?scale=1.0

Response: PNG 图片（用于 Canvas 显示）
```

### 3. 导出合并 PDF（PyMuPDF 原生操作）

```
POST /api/export
Content-Type: application/json

Request:
{
  "canvas_width": 595,
  "canvas_height": 842,
  "background_color": "#ffffff",
  "items": [
    {
      "file_id": "uuid-string",
      "page_num": 0,
      "x": 0,
      "y": 0,
      "width": 297.5,
      "height": 421,
      "rotation": 0
    },
    {
      "file_id": "uuid-string-2",
      "page_num": 0,
      "x": 297.5,
      "y": 0,
      "width": 297.5,
      "height": 421,
      "rotation": 0
    }
  ]
}

Response:
  Content-Type: application/pdf
  Content-Disposition: attachment; filename="merged.pdf"
```

### 4. 删除文件

```
DELETE /api/file/<file_id>

Response:
{
  "success": true
}
```

### 5. 获取文件列表

```
GET /api/files

Response:
{
  "files": [
    {
      "file_id": "uuid",
      "filename": "example.pdf",
      "page_count": 5
    }
  ]
}
```

---

## 页面布局

```
┌──────────────────────────────────────────────────────────────────┐
│  PastePDF                                        [清空] [导出PDF] │
├──────────────────┬───────────────────────────────────────────────┤
│                  │                                               │
│  ┌────────────┐  │    ┌─────────────────────────────────────┐    │
│  │  上传区域  │  │    │                                     │    │
│  │ 点击或拖拽 │  │    │                                     │    │
│  │  上传PDF   │  │    │                                     │    │
│  └────────────┘  │    │           画布区域                   │    │
│                  │    │      （拖拽布局 + 缩放控制点）        │    │
│  已上传文件:     │    │                                     │    │
│  ┌────────────┐  │    │    ┌───────●───────┐                │    │
│  │ ┌────┐     │  │    │    ●              ●                │    │
│  │ │缩略│ 1.pdf│ │    │    │    PDF 1     │                │    │
│  │ │ 图 │ 3页  │  │    │    ●              ●                │    │
│  │ └────┘     │  │    │    └───────●───────┘                │    │
│  └────────────┘  │    │                                     │    │
│  ┌────────────┐  │    │         ┌───────●───────┐           │    │
│  │ ┌────┐     │  │    │         ●              ●           │    │
│  │ │缩略│ 2.pdf│ │    │         │    PDF 2     │           │    │
│  │ │ 图 │ 1页  │  │    │         ●              ●           │    │
│  │ └────┘     │  │    │         └───────●───────┘           │    │
│  └────────────┘  │    │                                     │    │
│                  │    └─────────────────────────────────────┘    │
├──────────────────┴───────────────────────────────────────────────┤
│  画布: [A4 ▼] 宽:[595]pt 高:[842]pt [横向] │ 已添加 2 个页面     │
└──────────────────────────────────────────────────────────────────┘

● = 缩放控制点（8个：四角 + 四边中点）
```

---

## 交互说明

### 拖拽缩放控制点

```
        ●───────────●───────────●
        │                       │
        ●       PDF 页面        ●
        │                       │
        ●───────────●───────────●

- 四角控制点：同时调整宽高
- 四边中点：单独调整宽或高
- Shift + 拖拽四角：保持原始宽高比
- 拖拽中心区域：移动位置
```

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| Delete | 删除选中的页面 |
| Ctrl+Z | 撤销 |
| Ctrl+Y | 重做 |
| R | 旋转选中页面 90° |
| Shift+拖拽 | 保持宽高比缩放 |

---

## 目录结构

```
pastepdf/
├── app.py                 # Flask 主程序
├── requirements.txt       # Python 依赖
├── README.md              # 项目说明
├── static/
│   ├── css/
│   │   └── style.css      # 样式
│   └── js/
│       └── main.js        # 前端拖拽/缩放逻辑
├── templates/
│   └── index.html         # 主页面
└── uploads/               # 临时上传目录（自动创建，程序退出时清理）
```

---

## 快速开始

```bash
# 安装依赖
pip install -r requirements.txt

# 启动服务
python app.py

# 浏览器访问
http://127.0.0.1:5000
```

---

## 依赖

```
flask>=2.0
pymupdf>=1.20
```

---

## 实现要点

### 后端（PyMuPDF）

```python
# 导出时的核心逻辑
def export_pdf(canvas_width, canvas_height, items):
    new_doc = fitz.open()
    new_page = new_doc.new_page(width=canvas_width, height=canvas_height)

    for item in items:
        src_doc = fitz.open(uploaded_files[item['file_id']])
        dest_rect = fitz.Rect(
            item['x'],
            item['y'],
            item['x'] + item['width'],
            item['y'] + item['height']
        )
        new_page.show_pdf_page(
            dest_rect,
            src_doc,
            item['page_num'],
            rotate=item.get('rotation', 0)
        )
        src_doc.close()

    # 返回 PDF 字节流
    return new_doc.tobytes()
```

### 前端（Canvas 拖拽）

- 使用原生 JavaScript 实现拖拽和缩放
- Canvas 绑定 mousedown/mousemove/mouseup 事件
- 检测鼠标位置判断是移动还是缩放
- 实时重绘 Canvas 显示预览效果
