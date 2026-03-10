# CramSchoolWeb_Front_end

A Vue 3 front-end application for YOLO image labeling with three main function pages.

Back end linked
- https://github.com/KevinLin0919/CramSchool_Storing
- https://github.com/leo8799/CramSchool_YOLO_Backend
- https://github.com/Kellen-hung/FudanOCR_api

## Features

### 📁 Upload Page
- Drag and drop image upload interface
- Multiple image selection support
- Image preview grid
- File management (add/remove images)

### 🏷️ Label Page
- Interactive canvas for drawing bounding boxes
- Multiple object class selection (Person, Car, Bicycle, etc.)
- Image navigation (previous/next)
- Label management (add/remove/clear labels)
- Export labels in YOLO format
- Real-time label visualization

### 📊 Results Page
- Summary statistics (total images, total labels, averages)
- Class distribution chart
- Labeled images gallery
- Detailed view modal for each image
- Export options (YOLO format and JSON)

## Tech Stack

- **Vue 3** - Progressive JavaScript Framework
- **TypeScript** - Type-safe development
- **Vue Router** - Client-side routing
- **Vite** - Fast build tool and dev server

## Getting Started

### Prerequisites

- Node.js 20.19.0 or higher
- npm 10.x or higher

### Installation

```bash
# Install dependencies
npm install
```

### Development

```bash
# Run development server
npm run dev
```

The application will be available at `http://localhost:5173/`

### Build

```bash
# Type check
npm run type-check

# Build for production
npm run build

# Preview production build
npm run preview
```

### API Proxy 設定

開發模式下 API 透過 `vite.config.ts` 的 proxy 轉發，如需修改目標位址請編輯該檔案的 `server.proxy` 欄位。

| 路徑 | 服務 |
|------|------|
| `/api/ocr_process` | OCR 辨識 (port 8083) |
| `/api/predict` | YOLO 預測 (port 8082) |
| `/ocr_google` | Google OCR (port 8083) |
| `/api/exam-templates` | 模板儲存 (port 8084) |

---

## Docker

### Build image

```bash
docker build -t cramschool-frontend .
```

### Run container

透過環境變數指定各 API 目標位址（可隨時修改，不需重新 build）：

```bash
docker run -p 8080:80 \
  -e OCR_URL=http://140.115.54.239:8083 \
  -e PREDICT_URL=http://140.115.54.241:8082 \
  -e GOOGLE_OCR_URL=http://140.115.54.241:8083 \
  -e EXAM_TEMPLATE_URL=http://140.115.54.241:8084 \
  cramschool-frontend
```

開啟 `http://localhost:8080`

| 環境變數 | 對應服務 |
|---------|---------|
| `OCR_URL` | OCR 辨識服務 |
| `PREDICT_URL` | YOLO 預測服務 |
| `GOOGLE_OCR_URL` | Google OCR 服務 |
| `EXAM_TEMPLATE_URL` | 模板儲存服務 |

## Project Structure

```
src/
├── views/
│   ├── UploadView.vue    # Upload page
│   ├── LabelView.vue     # Image labeling page
│   └── ResultsView.vue   # Results display page
├── router/
│   └── index.ts          # Route configuration
├── App.vue               # Main app component
└── main.ts              # Application entry point
```

## Usage Flow

1. **Upload Images**: Start by uploading images on the Upload page
2. **Label Images**: Navigate to the Label page to draw bounding boxes and assign classes
3. **View Results**: Check the Results page for statistics and export labeled data

## Export Formats

- **YOLO Format**: Normalized coordinates (class_id center_x center_y width height)
- **JSON Format**: Detailed annotations with image metadata

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.
