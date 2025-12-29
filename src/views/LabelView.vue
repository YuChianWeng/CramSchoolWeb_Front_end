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
        <div class="workspace-main">
          <div class="image-display">
            <canvas
              ref="canvas"
              @mousedown="startDrawing"
              @mousemove="draw"
              @mouseup="endDrawing"
              @mouseleave="endDrawing"
              @wheel.prevent="handleWheel"
            ></canvas>
            <div class="view-controls">
              <div class="zoom-controls">
                <button @click="changeZoom(0.1)">＋</button>
                <span>{{ Math.round(zoom * 100) }}%</span>
                <button @click="changeZoom(-0.1)">－</button>
              </div>
              <div class="pan-controls">
                <button @click="nudgePan('up')">↑</button>
                <div class="pan-middle">
                  <button @click="nudgePan('left')">←</button>
                  <button @click="resetView">重置</button>
                  <button @click="nudgePan('right')">→</button>
                </div>
                <button @click="nudgePan('down')">↓</button>
              </div>
              <p class="hint">按住 Alt 拖曳即可移動畫面</p>
            </div>
            <div class="prediction-state" v-if="currentImage">
              <span v-if="currentImage.isPredicting" class="state loading">偵測中...</span>
              <span v-else-if="currentImage.predictionError" class="state error">
                {{ currentImage.predictionError }}
                <button @click="retryPrediction" class="retry-btn">重試</button>
              </span>
              <span v-else-if="currentImage.predictionsLoaded" class="state success">已套用偵測結果</span>
              <span v-else class="state idle">等待偵測</span>
            </div>
          </div>

          <div class="controls">
            <div class="class-selector single-class">
              <label>標註類型：</label>
              <span class="single-class-label">{{ DEFAULT_CLASS }}</span>
              <button @click="retryPrediction" :disabled="currentImage?.isPredicting" class="retry-btn">
                重新偵測
              </button>
            </div>

            <div class="label-list">
              <h3>Labels for current image:</h3>
              <div v-if="currentImage?.labels && currentImage.labels.length > 0" class="label-scroll">
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
              <button type="button" @click="clearLabels" class="clear-labels-btn">Clear Labels</button>
              <button type="button" @click="exportLabels" class="export-btn">Export Labels</button>
              <div class="results-action">
                <a
                  :href="resultsHref"
                  class="results-btn"
                  role="button"
                  @click="handleVerifyClick"
                >Verify Labels</a>
                <span v-if="isVerifying" class="loading-text">loading...</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants'
import { setResultsData } from '../stores/resultsStore'

const YOLO_DEFAULT = '/api/predict'
const OCR_DEFAULT = '/ocr'
const YOLO_HARDCODE = 'http://140.115.54.239:8082/predict'
const OCR_HARDCODE = 'http://140.115.54.239:8083/ocr'
const YOLO_ENDPOINT = import.meta.env.VITE_YOLO_ENDPOINT || YOLO_DEFAULT
const OCR_ENDPOINT = import.meta.env.VITE_OCR_ENDPOINT || OCR_DEFAULT
const isPreviewPort = typeof window !== 'undefined' && window.location?.port === '4173'

const DEFAULT_CLASS = '答案區'

interface Label {
  class: string
  x: number
  y: number
  width: number
  height: number
  recognizedAnswer?: string
  expectedAnswer?: string
  isCorrect?: boolean
}

interface ImageData {
  name: string
  preview: string
  labels?: Label[]
  predictionsLoaded?: boolean
  isPredicting?: boolean
  predictionError?: string
  isOcrRunning?: boolean
  ocrError?: string
}

const router = useRouter()
const canvas = ref<HTMLCanvasElement | null>(null)
const images = ref<ImageData[]>([])
const currentImageIndex = ref(0)
const currentClass = ref(DEFAULT_CLASS)
const isDrawing = ref(false)
const isPanning = ref(false)
const autoScanInProgress = ref(false)
const REQUEST_TIMEOUT_MS = 15000
let autoScanPromise: Promise<void> | null = null
const isVerifying = ref(false)
const startX = ref(0)
const startY = ref(0)
const currentX = ref(0)
const currentY = ref(0)
const panX = ref(0)
const panY = ref(0)
const zoom = ref(1)

const currentImage = computed(() => images.value[currentImageIndex.value])
const resultsHref = computed(() => {
  const resolvedHref = router.resolve({ name: 'results' }).href
  if (resolvedHref.includes('#')) return resolvedHref
  return `#${resolvedHref.startsWith('/') ? resolvedHref : `/${resolvedHref}`}`
})
const allScansComplete = computed(
  () =>
    images.value.length > 0 &&
    images.value.every((img) => Boolean(img.predictionsLoaded || img.predictionError))
)

onMounted(() => {
  // Try to get images from router state
  const state = history.state as { files?: ImageData[] }
  if (state?.files && state.files.length > 0) {
    images.value = state.files.map(f => ({
      ...f,
      labels: f.labels || [],
      predictionsLoaded: false,
      isPredicting: false,
      predictionError: undefined
    }))
    nextTick(() => {
      handleImageChange()
      void scanAllImages()
    })
  } else {
    // Load sample images for demonstration
    images.value = [
      { name: 'sample1.jpg', preview: '', labels: [], predictionsLoaded: false },
      { name: 'sample2.jpg', preview: '', labels: [], predictionsLoaded: false }
    ]
  }
})

watch(
  () => images.value,
  (nextImages) => {
    if (nextImages.length > 0) {
      void scanAllImages()
    }
  },
  { deep: false }
)

watch(currentImageIndex, () => {
  handleImageChange()
})

const handleImageChange = () => {
  panX.value = 0
  panY.value = 0
  zoom.value = 1
  if (currentImage.value) {
    currentImage.value.predictionError = undefined
    if (!currentImage.value.labels) currentImage.value.labels = []
  }
  loadImage()
  fetchPredictionsForCurrentImage()
}

const computeFit = (imgWidth: number, imgHeight: number) => {
  const scale = Math.min(CANVAS_WIDTH / imgWidth, CANVAS_HEIGHT / imgHeight)
  const offsetX = (CANVAS_WIDTH - imgWidth * scale) / 2
  const offsetY = (CANVAS_HEIGHT - imgHeight * scale) / 2

  return { scale, offsetX, offsetY }
}

const loadPreviewImage = (preview: string) => {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = preview
  })
}

const loadImage = () => {
  if (!canvas.value || !currentImage.value) return

  const ctx = canvas.value.getContext('2d')
  if (!ctx) return

  const img = new Image()
  img.onload = () => {
    canvas.value!.width = CANVAS_WIDTH
    canvas.value!.height = CANVAS_HEIGHT
    ctx.clearRect(0, 0, canvas.value!.width, canvas.value!.height)

    const fit = computeFit(img.width, img.height)

    ctx.save()
    ctx.setTransform(zoom.value, 0, 0, zoom.value, panX.value, panY.value)
    ctx.drawImage(img, fit.offsetX, fit.offsetY, img.width * fit.scale, img.height * fit.scale)

    // Draw existing labels
    drawLabels(ctx)
    ctx.restore()
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

const drawLabels = (ctx: CanvasRenderingContext2D) => {
  if (!canvas.value || !currentImage.value?.labels) return

  currentImage.value.labels.forEach((label) => {
    ctx.strokeStyle = '#42b883'
    ctx.lineWidth = 2
    ctx.strokeRect(label.x, label.y, label.width, label.height)

    ctx.fillStyle = '#42b883'
    ctx.fillRect(label.x, label.y - 20, label.class.length * 10 + 20, 20)
    ctx.fillStyle = 'white'
    ctx.font = '14px Arial'
    ctx.fillText(label.class, label.x + 5, label.y - 5)
  })
}

const startDrawing = (event: MouseEvent) => {
  if (!canvas.value) return

  if (event.button !== 0 || event.altKey) {
    startPan(event)
    return
  }

  const { x, y } = getCanvasCoords(event)
  startX.value = x
  startY.value = y
  isDrawing.value = true
}

const draw = (event: MouseEvent) => {
  if (isPanning.value) {
    handlePanMove(event)
    return
  }

  if (!isDrawing.value || !canvas.value) return

  const { x, y } = getCanvasCoords(event)
  currentX.value = x
  currentY.value = y

  // Redraw image and existing labels
  loadImage()

  // Draw current box
  const ctx = canvas.value.getContext('2d')
  if (!ctx) return

  ctx.save()
  ctx.setTransform(zoom.value, 0, 0, zoom.value, panX.value, panY.value)
  ctx.strokeStyle = '#ff5252'
  ctx.lineWidth = 2
  ctx.strokeRect(
    startX.value,
    startY.value,
    currentX.value - startX.value,
    currentY.value - startY.value
  )
  ctx.restore()
}

const extractBase64FromPreview = (preview: string) => {
  const separatorIndex = preview.indexOf(',')
  return separatorIndex >= 0 ? preview.slice(separatorIndex + 1) : preview
}

const fetchWithFallback = async (
  endpoints: string[],
  body: any,
  timeoutMs = REQUEST_TIMEOUT_MS
) => {
  let lastError: any = null
  const headers = { 'Content-Type': 'application/json' }

  for (const endpoint of endpoints) {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      })

      window.clearTimeout(timeoutId)
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`)
      }

      return await response.json()
    } catch (err) {
      window.clearTimeout(timeoutId)
      lastError = err
      console.warn(`Request to ${endpoint} failed, trying next fallback`, err)
    }
  }

  throw lastError || new Error('All endpoints failed')
}

const toPixelBox = (
  bbox: any[],
  imgWidth: number,
  imgHeight: number
): { x1: number; y1: number; x2: number; y2: number } | null => {
  if (!Array.isArray(bbox) || bbox.length < 4) return null

  const [a, b, c, d] = bbox.map(Number)
  if ([a, b, c, d].some(v => Number.isNaN(v))) return null

  // Detect normalized inputs (0-1) and center-based ordering (cx, cy, w, h)
  const looksNormalized = [a, b, c, d].every(v => v >= 0 && v <= 1.2)
  const looksCenterBased = looksNormalized && c <= 1.2 && d <= 1.2

  if (looksCenterBased) {
    const cx = a * imgWidth
    const cy = b * imgHeight
    const w = c * imgWidth
    const h = d * imgHeight
    return {
      x1: cx - w / 2,
      y1: cy - h / 2,
      x2: cx + w / 2,
      y2: cy + h / 2
    }
  }

  const x1 = looksNormalized ? a * imgWidth : a
  const y1 = looksNormalized ? b * imgHeight : b
  const x2 = looksNormalized ? c * imgWidth : c
  const y2 = looksNormalized ? d * imgHeight : d

  return { x1, y1, x2, y2 }
}

const fetchPredictionsForImage = async (img?: ImageData) => {
  if (!img || !img.preview || img.isPredicting || img.predictionsLoaded) return

  img.isPredicting = true
  img.predictionError = undefined

  try {
    const previewImg = await loadPreviewImage(img.preview)
    const { scale, offsetX, offsetY } = computeFit(previewImg.width, previewImg.height)
    const base64 = extractBase64FromPreview(img.preview)
    const image_base64 = base64.includes('base64,')
    ? base64.split('base64,')[1]
    : base64
    const yoloEndpoints = Array.from(
      new Set(
        isPreviewPort
          ? [YOLO_HARDCODE, YOLO_ENDPOINT, YOLO_DEFAULT]
          : [YOLO_ENDPOINT, YOLO_DEFAULT, YOLO_HARDCODE]
      )
    )
    const data = await fetchWithFallback(yoloEndpoints, { image_base64 })
    const detections =
      data?.detections ||
      data?.predictions ||
      data?.boxes ||
      data?.results ||
      data?.body?.json?.detections ||
      data?.body?.json?.predictions ||
      []

    const mappedLabels: Label[] = detections
      .map((detection: any) => {
        const rawBox =
          detection?.bbox ||
          detection?.box ||
          [detection?.x1, detection?.y1, detection?.x2, detection?.y2]
        const pixelBox = toPixelBox(rawBox, previewImg.width, previewImg.height)
        if (!pixelBox) return null

        const { x1, y1, x2, y2 } = pixelBox
        const boxX = Math.max(0, Math.min(x1, x2) * scale + offsetX)
        const boxY = Math.max(0, Math.min(y1, y2) * scale + offsetY)
        const boxWidth = Math.abs(x2 - x1) * scale
        const boxHeight = Math.abs(y2 - y1) * scale

        return {
          class: detection?.class || detection?.label || detection?.name || DEFAULT_CLASS,
          x: boxX,
          y: boxY,
          width: boxWidth,
          height: boxHeight
        }
      })
      .filter((v): v is Label => Boolean(v))

    img.labels = mappedLabels
    img.predictionsLoaded = true
    if (currentImage.value === img) {
      loadImage()
    }
    runOcrForImage(img)
  } catch (error: any) {
    console.error('Error fetching predictions:', error)
    const message = error?.message || 'Unable to fetch predictions'
    if (message.includes('Failed to fetch') || message.includes('CORS')) {
      img.predictionError = 'Prediction blocked by network/CORS. Please use the proxied endpoint (/api/predict) or set VITE_YOLO_ENDPOINT.'
    } else if (message.startsWith('Request failed (')) {
      img.predictionError = 'Prediction failed with server error. Please retry or contact admin.'
    } else {
      img.predictionError = message
    }
  } finally {
    img.isPredicting = false
  }
}

const fetchPredictionsForCurrentImage = async () => {
  const img = currentImage.value
  return fetchPredictionsForImage(img)
}

const scanAllImages = async () => {
  if (autoScanPromise) return autoScanPromise
  autoScanInProgress.value = true
  autoScanPromise = (async () => {
    const queue = images.value.filter(
      (img) => img.preview && !img.predictionsLoaded && !img.isPredicting
    )
    if (queue.length === 0) return

    const maxWorkers = Math.min(3, queue.length)
    let cursor = 0
    const worker = async () => {
      while (cursor < queue.length) {
        const target = queue[cursor]
        cursor += 1
        await fetchPredictionsForImage(target)
      }
    }

    const workers = Array.from({ length: maxWorkers }, () => worker())
    await Promise.all(workers)
  })()
    .finally(() => {
      autoScanInProgress.value = false
      autoScanPromise = null
    })

  return autoScanPromise
}

const retryPrediction = () => {
  const img = currentImage.value
  if (!img || img.isPredicting) return

  img.predictionsLoaded = false
  img.predictionError = undefined
  img.labels = []
  fetchPredictionsForCurrentImage()
}

const endDrawing = () => {
  if (isPanning.value) {
    stopPan()
    return
  }

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
    runOcrForImage(currentImage.value)
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

const getCanvasCoords = (event: MouseEvent) => {
  if (!canvas.value) return { x: 0, y: 0 }

  const rect = canvas.value.getBoundingClientRect()
  return {
    x: (event.clientX - rect.left - panX.value) / zoom.value,
    y: (event.clientY - rect.top - panY.value) / zoom.value
  }
}

const startPan = (event: MouseEvent) => {
  isPanning.value = true
  startX.value = event.clientX
  startY.value = event.clientY
}

const handlePanMove = (event: MouseEvent) => {
  if (!isPanning.value) return

  const dx = event.clientX - startX.value
  const dy = event.clientY - startY.value

  panX.value += dx
  panY.value += dy

  startX.value = event.clientX
  startY.value = event.clientY

  loadImage()
}

const stopPan = () => {
  isPanning.value = false
}

const handleWheel = (event: WheelEvent) => {
  changeZoom(event.deltaY < 0 ? 0.05 : -0.05)
}

const changeZoom = (delta: number) => {
  zoom.value = Math.min(3, Math.max(0.2, zoom.value + delta))
  loadImage()
}

const nudgePan = (direction: 'up' | 'down' | 'left' | 'right') => {
  const step = 20
  if (direction === 'up') panY.value -= step
  if (direction === 'down') panY.value += step
  if (direction === 'left') panX.value -= step
  if (direction === 'right') panX.value += step
  loadImage()
}

const resetView = () => {
  panX.value = 0
  panY.value = 0
  zoom.value = 1
  loadImage()
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

const RESULTS_STORAGE_KEY = 'results-page-data'

const persistResultsForNextPage = () => {
  const payload = images.value.map(img => {
    const labels = img.labels || []
    const correctCount = labels.filter((label: any) => label?.isCorrect === true).length
    return {
      name: img.name,
      preview: img.preview,
      labels,
      totalLabels: labels.length,
      correctCount
    }
  })
  setResultsData(payload)
  try {
    sessionStorage.setItem(RESULTS_STORAGE_KEY, JSON.stringify(payload))
  } catch (err) {
    console.warn('Unable to persist results to sessionStorage', err)
  }
}

const handleVerifyClick = async (event: MouseEvent) => {
  event.preventDefault()
  if (isVerifying.value) return
  isVerifying.value = true
  try {
    if (!allScansComplete.value) {
      await scanAllImages()
    }
    try {
      persistResultsForNextPage()
    } catch (err) {
      console.warn('Unable to persist results for next page', err)
    }
    window.location.assign(resultsHref.value || '/#/results')
  } finally {
    isVerifying.value = false
  }
}

const buildCanvasForImage = async (preview: string) => {
  const baseImg = await loadPreviewImage(preview)
  const offscreen = document.createElement('canvas')
  offscreen.width = CANVAS_WIDTH
  offscreen.height = CANVAS_HEIGHT
  const ctx = offscreen.getContext('2d')
  if (!ctx) return null

  const { scale, offsetX, offsetY } = computeFit(baseImg.width, baseImg.height)
  ctx.drawImage(baseImg, offsetX, offsetY, baseImg.width * scale, baseImg.height * scale)
  return offscreen
}

const cropLabelToBase64 = (source: HTMLCanvasElement, label: Label) => {
  if (label.width <= 0 || label.height <= 0) return null
  const cropCanvas = document.createElement('canvas')
  cropCanvas.width = Math.max(1, Math.floor(label.width))
  cropCanvas.height = Math.max(1, Math.floor(label.height))
  const ctx = cropCanvas.getContext('2d')
  if (!ctx) return null

  ctx.drawImage(
    source,
    label.x,
    label.y,
    label.width,
    label.height,
    0,
    0,
    cropCanvas.width,
    cropCanvas.height
  )

  const dataUrl = cropCanvas.toDataURL('image/png')
  return extractBase64FromPreview(dataUrl)
}

const runOcrForImage = async (img?: ImageData) => {
  if (!img || img.isOcrRunning) return
  if (!img.preview || !img.labels || img.labels.length === 0) return

  const targets = img.labels.filter(label => !label.recognizedAnswer)
  if (targets.length === 0) return

  img.isOcrRunning = true
  img.ocrError = undefined

  try {
    const sourceCanvas = await buildCanvasForImage(img.preview)
    if (!sourceCanvas) throw new Error('Unable to prepare canvas for OCR')

    for (const label of targets) {
      const cropped = cropLabelToBase64(sourceCanvas, label)
      if (!cropped) continue

      const ocrEndpoints = Array.from(
        new Set(
          isPreviewPort
            ? [OCR_HARDCODE, OCR_ENDPOINT, OCR_DEFAULT]
            : [OCR_ENDPOINT, OCR_DEFAULT, OCR_HARDCODE]
        )
      )
      const data = await fetchWithFallback(ocrEndpoints, { image: cropped })
      const text =
        data?.text ||
        data?.result ||
        data?.prediction ||
        data?.body?.json?.text ||
        ''
      label.recognizedAnswer = String(text)
    }
  } catch (error: any) {
    console.error('OCR error:', error)
    img.ocrError = error?.message || 'OCR 發生錯誤'
  } finally {
    img.isOcrRunning = false
  }
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

.workspace-main {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  height: 100%;
}

.image-display {
  background-color: #f5f5f5;
  border-radius: 8px;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  flex-direction: column;
  flex: 1;
  padding: 1rem;
  position: relative;
  min-height: 680px;
}

canvas {
  cursor: crosshair;
  border: 2px solid #ddd;
  border-radius: 4px;
  background-color: white;
}

.view-controls {
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-top: 0.5rem;
}

.zoom-controls,
.pan-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.pan-controls {
  flex-direction: column;
  gap: 0.25rem;
}

.pan-middle {
  display: flex;
  gap: 0.25rem;
}

.view-controls button {
  background-color: #42b883;
  color: white;
  border: none;
  padding: 0.3rem 0.6rem;
  border-radius: 4px;
  cursor: pointer;
}

.view-controls button:hover {
  background-color: #35945d;
}

.view-controls .hint {
  margin: 0;
  color: #666;
  font-size: 0.875rem;
}

.prediction-state {
  margin-top: 0.75rem;
  width: 100%;
  display: flex;
  gap: 0.5rem;
  align-items: center;
  justify-content: flex-start;
  flex-wrap: wrap;
  color: #2c3e50;
}

.state {
  font-size: 0.9rem;
}

.state.loading {
  color: #ff9800;
}

.state.error {
  color: #d32f2f;
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.state.success {
  color: #42b883;
}

.state.idle {
  color: #666;
}

.retry-btn {
  background-color: #2196f3;
  color: #fff;
  border: none;
  padding: 0.3rem 0.6rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
}

.retry-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.single-class {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.single-class-label {
  background: #e8f5e9;
  color: #2c3e50;
  padding: 0.4rem 0.75rem;
  border-radius: 4px;
  font-weight: bold;
}

.controls {
  background-color: #f5f5f5;
  border-radius: 8px;
  padding: 1rem;
  width: 360px;
  max-width: 380px;
  height: 100%;
  overflow-y: auto;
}

.class-selector {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
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

.label-scroll {
  max-height: 360px;
  overflow-y: auto;
  padding-right: 0.25rem;
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
  text-align: right;
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
  text-decoration: none;
}

.results-action {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
}

.loading-text {
  color: #9aa3ad;
  font-size: 0.9rem;
}

.results-btn:hover {
  background-color: #35945d;
}
</style>
