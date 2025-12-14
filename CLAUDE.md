# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PastePDF is a browser-based PDF page merging tool. Users run a local Flask server and access it via browser to visually arrange and merge multiple PDF pages into a single page using drag-and-drop.

**Core Principle**: Uses PyMuPDF native PDF operations (NOT image conversion) to maintain vector quality.

## Running the Application

```bash
# Install dependencies
pip install -r requirements.txt

# Start the Flask server
python app.py

# Access in browser
http://127.0.0.1:5000
```

The server runs on port 5000 with debug mode enabled.

## Architecture

### Two-Phase Approach: Preview vs Export

| Phase | Implementation | Purpose |
|-------|---------------|---------|
| **Preview** | PDF pages rendered to PNG images | Browser Canvas display only |
| **Export** | PyMuPDF native `show_pdf_page()` | Embeds PDF content as XObject, preserves vector/text |

**Why this design?**
- Browsers cannot directly render PDF to Canvas - must convert to images for preview
- Export uses `page.show_pdf_page()` to embed source PDF pages without rasterization
- Final PDF maintains selectable text, scalable vectors, and no quality loss

### Core Technology: `page.show_pdf_page()`

This PyMuPDF method embeds a source PDF page into a destination rectangle:

```python
new_page.show_pdf_page(
    dest_rect,      # fitz.Rect(x0, y0, x1, y1) - target position/size
    src_doc,        # Source PDF document
    page_num,       # Source page number (0-indexed)
    rotate=rotation # Optional rotation (0, 90, 180, 270)
)
```

## Backend Structure (Flask + PyMuPDF)

### File Storage
- Uploaded PDFs stored in `uploads/` directory with UUID filenames
- `uploaded_files` dict tracks: `{file_id: {'path': path, 'filename': filename, 'page_count': count}}`
- `atexit.register(cleanup_uploads)` removes uploads/ on server shutdown

### API Endpoints

1. **POST /api/upload** - Upload PDF, returns file_id and page metadata
2. **GET /api/thumbnail/<file_id>/<page_num>** - Returns PNG thumbnail (for Canvas preview)
3. **POST /api/export** - Generates merged PDF using `show_pdf_page()`
4. **DELETE /api/file/<file_id>** - Removes uploaded file
5. **GET /api/files** - Lists all uploaded files

### Export Logic (app.py:137-222)

The export endpoint:
1. Creates new PDF document with specified canvas dimensions
2. Optionally draws background color rectangle
3. Iterates through items array, calling `show_pdf_page()` for each
4. Returns PDF as BytesIO stream with `download_name='merged.pdf'`

## Frontend Structure

### Missing Implementation
**CRITICAL**: `static/js/main.js` is referenced in `templates/index.html:92` but does NOT exist. The frontend drag-and-drop Canvas logic is not implemented.

### Expected Frontend Behavior (per README.md)
- Canvas-based drag-and-drop for positioning PDF pages
- 8 resize handles (4 corners + 4 edge midpoints) for scaling
- Shift+drag to maintain aspect ratio
- Right-click context menu for layer ordering and rotation
- Keyboard shortcuts: Delete, Ctrl+Z/Y, R for rotate

### Canvas Settings
- Preset sizes: A4 (595×842pt), A3, Letter
- Custom dimensions in points (1pt = 1/72 inch)
- Orientation toggle (portrait/landscape)
- Background color picker

## Key Implementation Details

### Coordinate System
- All dimensions in **points** (pt), where 1pt = 1/72 inch
- A4 portrait: 595×842pt
- Canvas uses top-left origin (0,0)

### Export Request Format
```json
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
    }
  ]
}
```

### File Upload Constraints
- Max file size: 50MB (`app.config['MAX_CONTENT_LENGTH']`)
- Only `.pdf` files accepted
- Multiple file upload supported

## Development Notes

### When Implementing Frontend (main.js)
- Use native JavaScript Canvas API for rendering
- Bind mousedown/mousemove/mouseup events for drag/resize
- Detect mouse position to determine move vs resize action
- Maintain items array matching export format
- Call `/api/thumbnail` to load page images for Canvas display
- POST to `/api/export` with items array to generate final PDF

### PyMuPDF Version Requirements
- Requires PyMuPDF >= 1.20 for `show_pdf_page()` support
- Import as `import fitz` (PyMuPDF's module name)

#### ⚠️ CRITICAL Bug Workaround

CRITICAL: Follow these guidelines when using tools operating on file paths EXCEPT `Bash` in any skill or agent. Otherwise, they will not work correctly.

- When referencing file paths in tool calls, ALWAYS use the Windows-style paths with backslashes (`\`), as we're running on Windows.
- When referencing paths to the home directory, ALWAYS EXPAND the tilde symbol (`~`) representing the home directory to the full path, e.g., `C:\Users\some.user`.

#### Applies To

- `Edit`
- `Glob`
- `Grep`
- `Read`

#### Examples (CRITICAL Bug Workaround)

##### ✅ Correct (File Paths)

```json
{
    "type": "tool_use",
    "id": "...",
    "name": "Read",
    "input": {
        "file_path": "C:\\path\\to\\some\\file.txt"
    }
}
```

```json
{
    "type": "tool_use",
    "id": "...",
    "name": "Edit",
    "input": {
        "file_path": "C:\\path\\to\\some\\file.txt",
        "old_string": "...",
        "new_string": "..."
    }
}
```

##### ❌ Incorrect (File Paths)

```json
{
    "type": "tool_use",
    "id": "...",
    "name": "Read",
    "input": {
        "file_path": "/c/path/to/some/file.txt"
    }
}
```
