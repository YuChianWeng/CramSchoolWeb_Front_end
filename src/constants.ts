// Canvas dimensions for image labeling
export const CANVAS_WIDTH = 800
export const CANVAS_HEIGHT = 600

// YOLO class mapping
export const CLASS_MAP: Record<string, number> = {
  'person': 0,
  'car': 1,
  'bicycle': 2,
  'motorbike': 3,
  'bus': 4,
  'truck': 5,
  'cat': 6,
  'dog': 7,
  'other': 8
}

// Available object classes for labeling
export const OBJECT_CLASSES = [
  'person',
  'car',
  'bicycle',
  'motorbike',
  'bus',
  'truck',
  'cat',
  'dog',
  'other'
] as const

export type ObjectClass = typeof OBJECT_CLASSES[number]
