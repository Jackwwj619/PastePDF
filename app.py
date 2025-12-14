"""
PastePDF - 浏览器端 PDF 拼接工具
Flask 后端服务
"""

import os
import uuid
import atexit
import shutil
from flask import Flask, request, jsonify, send_file, render_template
import fitz  # PyMuPDF
from io import BytesIO

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size

# 上传文件存储目录
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# 存储已上传文件的信息 {file_id: {'path': path, 'filename': filename, 'page_count': count}}
uploaded_files = {}


def cleanup_uploads():
    """程序退出时清理上传目录"""
    if os.path.exists(UPLOAD_FOLDER):
        shutil.rmtree(UPLOAD_FOLDER)
        print("已清理上传目录")


atexit.register(cleanup_uploads)


@app.route('/')
def index():
    """主页面"""
    return render_template('index.html')


@app.route('/api/upload', methods=['POST'])
def upload_file():
    """上传 PDF 文件"""
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': '没有文件'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'error': '没有选择文件'}), 400

    if not file.filename.lower().endswith('.pdf'):
        return jsonify({'success': False, 'error': '只支持 PDF 文件'}), 400

    # 生成唯一文件ID
    file_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_FOLDER, f"{file_id}.pdf")

    # 保存文件
    file.save(file_path)

    try:
        # 读取 PDF 信息
        doc = fitz.open(file_path)
        page_count = len(doc)

        pages = []
        for i in range(page_count):
            page = doc[i]
            rect = page.rect
            pages.append({
                'page_num': i,
                'width': rect.width,
                'height': rect.height,
                'thumbnail': f'/api/thumbnail/{file_id}/{i}'
            })

        doc.close()

        # 存储文件信息
        uploaded_files[file_id] = {
            'path': file_path,
            'filename': file.filename,
            'page_count': page_count
        }

        return jsonify({
            'success': True,
            'file_id': file_id,
            'filename': file.filename,
            'page_count': page_count,
            'pages': pages
        })

    except Exception as e:
        # 如果读取失败，删除文件
        if os.path.exists(file_path):
            os.remove(file_path)
        return jsonify({'success': False, 'error': f'无法读取 PDF: {str(e)}'}), 400


@app.route('/api/thumbnail/<file_id>/<int:page_num>')
def get_thumbnail(file_id, page_num):
    """获取页面缩略图"""
    if file_id not in uploaded_files:
        return jsonify({'error': '文件不存在'}), 404

    file_info = uploaded_files[file_id]
    scale = float(request.args.get('scale', 1.0))

    try:
        doc = fitz.open(file_info['path'])

        if page_num < 0 or page_num >= len(doc):
            doc.close()
            return jsonify({'error': '页码无效'}), 400

        page = doc[page_num]

        # 渲染为图片
        mat = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=mat)

        # 转换为 PNG
        img_data = pix.tobytes("png")
        doc.close()

        return send_file(
            BytesIO(img_data),
            mimetype='image/png',
            as_attachment=False
        )

    except Exception as e:
        return jsonify({'error': f'生成缩略图失败: {str(e)}'}), 500


@app.route('/api/export', methods=['POST'])
def export_pdf():
    """导出合并后的 PDF"""
    data = request.get_json()

    if not data:
        return jsonify({'error': '无效的请求数据'}), 400

    canvas_width = data.get('canvas_width', 595)
    canvas_height = data.get('canvas_height', 842)
    background_color = data.get('background_color', '#ffffff')
    items = data.get('items', [])

    if not items:
        return jsonify({'error': '没有要导出的内容'}), 400

    try:
        # 创建新文档
        new_doc = fitz.open()
        new_page = new_doc.new_page(width=canvas_width, height=canvas_height)

        # 设置背景色
        if background_color and background_color != '#ffffff':
            # 解析颜色
            bg_color = background_color.lstrip('#')
            r = int(bg_color[0:2], 16) / 255
            g = int(bg_color[2:4], 16) / 255
            b = int(bg_color[4:6], 16) / 255

            bg_rect = fitz.Rect(0, 0, canvas_width, canvas_height)
            shape = new_page.new_shape()
            shape.draw_rect(bg_rect)
            shape.finish(color=(r, g, b), fill=(r, g, b))
            shape.commit()

        # 按层级顺序添加页面
        for item in items:
            file_id = item.get('file_id')
            if file_id not in uploaded_files:
                continue

            file_info = uploaded_files[file_id]
            page_num = item.get('page_num', 0)
            x = item.get('x', 0)
            y = item.get('y', 0)
            width = item.get('width', 100)
            height = item.get('height', 100)
            rotation = item.get('rotation', 0)

            try:
                src_doc = fitz.open(file_info['path'])

                if page_num < 0 or page_num >= len(src_doc):
                    src_doc.close()
                    continue

                # 定义目标区域
                dest_rect = fitz.Rect(x, y, x + width, y + height)

                # 使用 show_pdf_page 嵌入 PDF 页面（保持矢量质量）
                new_page.show_pdf_page(
                    dest_rect,
                    src_doc,
                    page_num,
                    rotate=rotation
                )

                src_doc.close()

            except Exception as e:
                print(f"处理页面时出错: {e}")
                continue

        # 生成 PDF 字节流
        pdf_bytes = new_doc.tobytes()
        new_doc.close()

        return send_file(
            BytesIO(pdf_bytes),
            mimetype='application/pdf',
            as_attachment=True,
            download_name='merged.pdf'
        )

    except Exception as e:
        return jsonify({'error': f'导出失败: {str(e)}'}), 500


@app.route('/api/file/<file_id>', methods=['DELETE'])
def delete_file(file_id):
    """删除文件"""
    if file_id not in uploaded_files:
        return jsonify({'success': False, 'error': '文件不存在'}), 404

    file_info = uploaded_files[file_id]

    try:
        # 删除文件
        if os.path.exists(file_info['path']):
            os.remove(file_info['path'])

        # 从记录中移除
        del uploaded_files[file_id]

        return jsonify({'success': True})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/files')
def get_files():
    """获取文件列表"""
    files = []
    for file_id, info in uploaded_files.items():
        files.append({
            'file_id': file_id,
            'filename': info['filename'],
            'page_count': info['page_count']
        })

    return jsonify({'files': files})


if __name__ == '__main__':
    print("PastePDF 服务启动中...")
    print("请在浏览器中访问: http://127.0.0.1:5000")
    app.run(debug=True, host='127.0.0.1', port=5000)
