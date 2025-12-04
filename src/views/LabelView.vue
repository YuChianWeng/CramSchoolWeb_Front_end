<template>
  <div class="label-container">
    <h1>Image Labeling for YOLO</h1>
    
    <div v-if="images.length === 0" class="no-images">
      <p>No images uploaded. Please upload images first.</p>
      <button @click="goToUpload" class="upload-link-btn">Go to Upload</button>
    </div>

    <div v-else class="labeling-workspace">
      <div class="sidebar">
        <h2>Image List</h2>
        <div class="image-list">
          <div 
            v-for="(img, index) in images" 
            :key="index"
            class="image-list-item"
            :class="{ active: currentImageIndex === index }"
            @click="selectImage(index)"
          >
            <img :src="img.preview" :alt="img.name" />
            <span>{{ img.name }}</span>
            <span class="label-count">{{ img.labels?.length || 0 }} labels</span>
          </div>
        </div>
      </div>

      <div class="main-area">
        <div class="image-display">
          <canvas 
            ref="canvas"
            @mousedown="startDrawing"
            @mousemove="draw"
            @mouseup="endDrawing"
            @mouseleave="endDrawing"
          ></canvas>
        </div>

        <div class="controls">
          <div class="class-selector">
            <label>Object Class:</label>
            <select v-model="currentClass">
              <option v-for="cls in OBJECT_CLASSES" :key="cls" :value="cls">
                {{ cls.charAt(0).toUpperCase() + cls.slice(1) }}
              </option>
            </select>
          </div>

          <div class="label-list">
            <h3>Labels for current image:</h3>
            <div v-if="currentImage?.labels && currentImage.labels.length > 0">
              <div 
                v-for="(label, index) in currentImage.labels" 
                :key="index"
                class="label-item"
              >
                <span class="label-class">{{ label.class }}</span>
                <span class="label-coords">
                  ({{ Math.round(label.x) }}, {{ Math.round(label.y) }}, 
                   {{ Math.round(label.width) }}×{{ Math.round(label.height) }})
                </span>
                <button @click="removeLabel(index)" class="remove-label-btn">×</button>
              </div>
            </div>
            <p v-else class="no-labels">No labels yet. Draw boxes on the image.</p>
          </div>

          <div class="navigation">
            <button 
              @click="previousImage" 
              :disabled="currentImageIndex === 0"
              class="nav-btn"
            >
              ← Previous
            </button>
            <span class="image-counter">
              {{ currentImageIndex + 1 }} / {{ images.length }}
            </span>
            <button 
              @click="nextImage" 
              :disabled="currentImageIndex === images.length - 1"
              class="nav-btn"
            >
              Next →
            </button>
          </div>

          <div class="action-buttons">
            <button @click="clearLabels" class="clear-labels-btn">Clear Labels</button>
            <button @click="exportLabels" class="export-btn">Export Labels</button>
            <button @click="goToResults" class="results-btn">View Results</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { CANVAS_WIDTH, CANVAS_HEIGHT, OBJECT_CLASSES } from '../constants'

interface Label {
  class: string
  x: number
  y: number
  width: number
  height: number
}

interface ImageData {
  name: string
  preview: string
  labels?: Label[]
}

const router = useRouter()
const canvas = ref<HTMLCanvasElement | null>(null)
const images = ref<ImageData[]>([])
const currentImageIndex = ref(0)
const currentClass = ref('person')
const isDrawing = ref(false)
const startX = ref(0)
const startY = ref(0)
const currentX = ref(0)
const currentY = ref(0)

const currentImage = computed(() => images.value[currentImageIndex.value])

onMounted(() => {
  // Try to get images from router state
  const state = history.state as { files?: ImageData[] }
  if (state?.files && state.files.length > 0) {
    images.value = state.files.map(f => ({ ...f, labels: f.labels || [] }))
    nextTick(() => {
      loadImage()
    })
  } else {
    // Load sample images for demonstration
    images.value = [
      { name: 'sample1.jpg', preview: '', labels: [] },
      { name: 'sample2.jpg', preview: '', labels: [] }
    ]
  }
})

watch(currentImageIndex, () => {
  loadImage()
})

const loadImage = () => {
  if (!canvas.value || !currentImage.value) return
  
  const ctx = canvas.value.getContext('2d')
  if (!ctx) return

  const img = new Image()
  img.onload = () => {
    canvas.value!.width = CANVAS_WIDTH
    canvas.value!.height = CANVAS_HEIGHT
    ctx.clearRect(0, 0, canvas.value!.width, canvas.value!.height)
    
    // Draw image scaled to fit canvas
    const scale = Math.min(CANVAS_WIDTH / img.width, CANVAS_HEIGHT / img.height)
    const x = (CANVAS_WIDTH - img.width * scale) / 2
    const y = (CANVAS_HEIGHT - img.height * scale) / 2
    ctx.drawImage(img, x, y, img.width * scale, img.height * scale)
    
    // Draw existing labels
    drawLabels()
  }
  
  if (currentImage.value.preview) {
    img.src = currentImage.value.preview
  } else {
    // Draw placeholder
    ctx.fillStyle = '#f0f0f0'
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    ctx.fillStyle = '#666'
    ctx.font = '24px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('No image', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2)
  }
}

const drawLabels = () => {
  if (!canvas.value || !currentImage.value?.labels) return
  
  const ctx = canvas.value.getContext('2d')
  if (!ctx) return
  
  currentImage.value.labels.forEach((label) => {
    ctx.strokeStyle = '#42b883'
    ctx.lineWidth = 2
    ctx.strokeRect(label.x, label.y, label.width, label.height)
    
    ctx.fillStyle = '#42b883'
    ctx.fillRect(label.x, label.y - 20, label.class.length * 10 + 10, 20)
    ctx.fillStyle = 'white'
    ctx.font = '14px Arial'
    ctx.fillText(label.class, label.x + 5, label.y - 5)
  })
}

const startDrawing = (event: MouseEvent) => {
  if (!canvas.value) return
  
  const rect = canvas.value.getBoundingClientRect()
  startX.value = event.clientX - rect.left
  startY.value = event.clientY - rect.top
  isDrawing.value = true
}

const draw = (event: MouseEvent) => {
  if (!isDrawing.value || !canvas.value) return
  
  const rect = canvas.value.getBoundingClientRect()
  currentX.value = event.clientX - rect.left
  currentY.value = event.clientY - rect.top
  
  // Redraw image and existing labels
  loadImage()
  
  // Draw current box
  const ctx = canvas.value.getContext('2d')
  if (!ctx) return
  
  ctx.strokeStyle = '#ff5252'
  ctx.lineWidth = 2
  ctx.strokeRect(
    startX.value,
    startY.value,
    currentX.value - startX.value,
    currentY.value - startY.value
  )
}

const endDrawing = () => {
  if (!isDrawing.value || !currentImage.value) return
  
  isDrawing.value = false
  
  const width = currentX.value - startX.value
  const height = currentY.value - startY.value
  
  // Only save if box is large enough
  if (Math.abs(width) > 10 && Math.abs(height) > 10) {
    const label: Label = {
      class: currentClass.value,
      x: Math.min(startX.value, currentX.value),
      y: Math.min(startY.value, currentY.value),
      width: Math.abs(width),
      height: Math.abs(height)
    }
    
    if (!currentImage.value.labels) {
      currentImage.value.labels = []
    }
    currentImage.value.labels.push(label)
    
    loadImage()
  }
}

const removeLabel = (index: number) => {
  const img = currentImage.value
  if (img && img.labels) {
    img.labels.splice(index, 1)
    loadImage()
  }
}

const clearLabels = () => {
  const img = currentImage.value
  if (img && img.labels) {
    img.labels = []
    loadImage()
  }
}

const selectImage = (index: number) => {
  currentImageIndex.value = index
}

const previousImage = () => {
  if (currentImageIndex.value > 0) {
    currentImageIndex.value--
  }
}

const nextImage = () => {
  if (currentImageIndex.value < images.value.length - 1) {
    currentImageIndex.value++
  }
}

const goToUpload = () => {
  router.push({ name: 'upload' })
}

const exportLabels = () => {
  // Convert labels to YOLO format
  const yoloData = images.value.map(img => {
    const labels = img.labels || []
    return {
      image: img.name,
      annotations: labels.map(label => ({
        class: label.class,
        bbox: [label.x, label.y, label.width, label.height]
      }))
    }
  })
  
  // Create and download JSON file
  const blob = new Blob([JSON.stringify(yoloData, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'yolo_labels.json'
  a.click()
  URL.revokeObjectURL(url)
}

const goToResults = () => {
  router.push({ 
    name: 'results',
    state: { images: images.value }
  })
}
</script>

<style scoped>
.label-container {
  padding: 2rem;
  height: calc(100vh - 4rem);
  overflow: hidden;
}

h1 {
  text-align: center;
  color: #2c3e50;
  margin-bottom: 2rem;
}

.no-images {
  text-align: center;
  padding: 4rem;
}

.no-images p {
  font-size: 1.2rem;
  color: #666;
  margin-bottom: 1rem;
}

.upload-link-btn {
  background-color: #42b883;
  color: white;
  border: none;
  padding: 0.75rem 2rem;
  font-size: 1rem;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.upload-link-btn:hover {
  background-color: #35945d;
}

.labeling-workspace {
  display: flex;
  gap: 1rem;
  height: calc(100% - 80px);
}

.sidebar {
  width: 250px;
  background-color: #f5f5f5;
  border-radius: 8px;
  padding: 1rem;
  overflow-y: auto;
}

.sidebar h2 {
  font-size: 1.2rem;
  margin-bottom: 1rem;
  color: #2c3e50;
}

.image-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.image-list-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  background-color: white;
  border: 2px solid transparent;
  transition: all 0.3s;
}

.image-list-item:hover {
  background-color: #e8f5e9;
}

.image-list-item.active {
  border-color: #42b883;
  background-color: #e8f5e9;
}

.image-list-item img {
  width: 50px;
  height: 50px;
  object-fit: cover;
  border-radius: 4px;
}

.image-list-item span {
  font-size: 0.875rem;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.label-count {
  color: #42b883;
  font-weight: bold;
}

.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.image-display {
  background-color: #f5f5f5;
  border-radius: 8px;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
}

canvas {
  cursor: crosshair;
  border: 2px solid #ddd;
  border-radius: 4px;
  background-color: white;
}

.controls {
  background-color: #f5f5f5;
  border-radius: 8px;
  padding: 1rem;
}

.class-selector {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.class-selector label {
  font-weight: bold;
  color: #2c3e50;
}

.class-selector select {
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
}

.label-list {
  margin-bottom: 1rem;
}

.label-list h3 {
  font-size: 1rem;
  color: #2c3e50;
  margin-bottom: 0.5rem;
}

.label-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background-color: white;
  border-radius: 4px;
  margin-bottom: 0.5rem;
}

.label-class {
  font-weight: bold;
  color: #42b883;
}

.label-coords {
  font-size: 0.875rem;
  color: #666;
  flex: 1;
}

.remove-label-btn {
  background-color: #ff5252;
  color: white;
  border: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 1.2rem;
  line-height: 1;
  transition: background-color 0.3s;
}

.remove-label-btn:hover {
  background-color: #d32f2f;
}

.no-labels {
  color: #999;
  font-style: italic;
}

.navigation {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.nav-btn {
  background-color: #42b883;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.nav-btn:hover:not(:disabled) {
  background-color: #35945d;
}

.nav-btn:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.image-counter {
  font-weight: bold;
  color: #2c3e50;
}

.action-buttons {
  display: flex;
  gap: 1rem;
  justify-content: center;
}

.clear-labels-btn,
.export-btn,
.results-btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  transition: background-color 0.3s;
}

.clear-labels-btn {
  background-color: #ff5252;
  color: white;
}

.clear-labels-btn:hover {
  background-color: #d32f2f;
}

.export-btn {
  background-color: #2196f3;
  color: white;
}

.export-btn:hover {
  background-color: #1976d2;
}

.results-btn {
  background-color: #42b883;
  color: white;
}

.results-btn:hover {
  background-color: #35945d;
}
</style>
