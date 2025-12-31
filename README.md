# CramSchoolWeb_Front_end

A Vue 3 front-end application for YOLO image labeling with three main function pages.

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
