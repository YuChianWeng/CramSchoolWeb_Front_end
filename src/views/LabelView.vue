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
              :style="{ 
                cursor: currentMode === 'pan' 
                  ? (isPanning ? 'grabbing' : 'grab') 
                  : 'crosshair' 
              }"
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
            <div class="mode-selector">
              <label>操作模式：</label>
              <div class="mode-buttons">
                <button 
                  :class="{ active: currentMode === 'draw' }" 
                  @click="currentMode = 'draw'"
                >✏️ 標註</button>
                <button 
                  :class="{ active: currentMode === 'pan' }" 
                  @click="currentMode = 'pan'"
                >✋ 拖移（或按住ALT）</button>
              </div>
            </div>

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
                  :class="{ 'selected': index === selectedLabelIndex }"
                  @click="focusLabelInput(index)"
                >
                  <button @click.stop="removeLabel(index)" class="remove-label-btn">×</button>

                  <div class="label-content-row">
                    <span class="label-name" :class="{ 'text-red': index === selectedLabelIndex }">
                      {{ label.class }} ({{ index + 1 }})
                    </span>

                    <div class="label-input-group">
                      <span class="input-prefix">答:</span>
                      <input 
                        type="text" 
                        v-model="label.answer" 
                        maxlength="4"
                        :ref="(el) => { if(el) inputRefs[index] = el as HTMLInputElement }"
                        @focus="selectLabel(index)"
                        @click.stop
                      />
                    </div>
                  </div>
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants'

const DEFAULT_CLASS = '答案區'

interface Label {
  class: string
  x: number
  y: number
  width: number
  height: number
  answer?: string // 儲存老師輸入的答案
}

interface ImageData {
  name: string
  preview: string
  labels?: Label[]
  predictionsLoaded?: boolean
  isPredicting?: boolean
  predictionError?: string
}

const router = useRouter()
const canvas = ref<HTMLCanvasElement | null>(null)
const images = ref<ImageData[]>([])
const currentImageIndex = ref(0)
const currentClass = ref(DEFAULT_CLASS)
const isDrawing = ref(false)
const isPanning = ref(false)
const currentMode = ref<'draw' | 'pan'>('draw')
const isProcessingOCR = ref(false)
const startX = ref(0)
const startY = ref(0)
const currentX = ref(0)
const currentY = ref(0)
const panX = ref(0)
const panY = ref(0)
const zoom = ref(1)

// 追蹤目前被選取的標籤索引 (-1 表示未選取)
const selectedLabelIndex = ref<number>(-1)

// [新增] 用來存放所有輸入框的 DOM 元素，讓我們可以程式化控制焦點
const inputRefs = ref<HTMLInputElement[]>([])

const currentImage = computed(() => images.value[currentImageIndex.value])

onMounted(() => {
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
    })
  } else {
    images.value = [
      { name: 'sample1.jpg', preview: '', labels: [], predictionsLoaded: false },
      { name: 'sample2.jpg', preview: '', labels: [], predictionsLoaded: false }
    ]
  }
})

watch(currentImageIndex, () => {
  handleImageChange()
})

const handleImageChange = () => {
  selectedLabelIndex.value = -1 // 切換圖片時重置選取狀態
  inputRefs.value = [] // 重置 refs 陣列
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

    drawLabels(ctx)
    ctx.restore()
  }
  
  if (currentImage.value.preview) {
    img.src = currentImage.value.preview
  } else {
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

  currentImage.value.labels.forEach((label, index) => {
    // 根據是否被選取改變顏色
    const isSelected = index === selectedLabelIndex.value
    ctx.strokeStyle = isSelected ? '#ff5252' : '#42b883'
    ctx.lineWidth = isSelected ? 3 : 2
    
    ctx.strokeRect(label.x, label.y, label.width, label.height)
  })
}

// 核心函式：強制聚焦指定的輸入框，這會觸發 @focus 進而更新 selectedLabelIndex
const focusLabelInput = (index: number) => {
  nextTick(() => {
    const inputEl = inputRefs.value[index]
    if (inputEl) {
      inputEl.focus()
    }
  })
}

// 這裡被 @focus 呼叫，負責更新資料狀態與重繪
const selectLabel = (index: number) => {
  if (selectedLabelIndex.value !== index) {
    selectedLabelIndex.value = index
    loadImage()
  }
}

const startDrawing = (event: MouseEvent) => {
  if (!canvas.value) return

  if (currentMode.value === 'pan' || event.button !== 0 || event.altKey) {
    startPan(event)
    return
  }

  const { x, y } = getCanvasCoords(event)

  // 碰撞偵測 - 檢查是否點擊到現有的框
  const labels = currentImage.value?.labels || []
  let hitIndex = -1
  // 反向遍歷，確保優先選取最上層的框
  for (let i = labels.length - 1; i >= 0; i--) {
    const l = labels[i]
    if (!l) continue // 防呆
    if (x >= l.x && x <= l.x + l.width && y >= l.y && y <= l.y + l.height) {
      hitIndex = i
      break
    }
  }

  if (hitIndex !== -1) {
    // 點擊到框框：聚焦對應輸入框 (會自動觸發變色)
    focusLabelInput(hitIndex)
    return
  } else {
    // 點擊空白處：如果有選取則取消選取
    if (selectedLabelIndex.value !== -1) {
      selectedLabelIndex.value = -1
      loadImage()
    }
  }

  // 沒點到框框，開始畫新框
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

  loadImage()

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

const endDrawing = () => {
  if (isPanning.value) {
    stopPan()
    return
  }

  if (!isDrawing.value || !currentImage.value) return

  isDrawing.value = false

  const width = currentX.value - startX.value
  const height = currentY.value - startY.value

  if (Math.abs(width) > 10 && Math.abs(height) > 10) {
    const label: Label = {
      class: currentClass.value,
      x: Math.min(startX.value, currentX.value),
      y: Math.min(startY.value, currentY.value),
      width: Math.abs(width),
      height: Math.abs(height),
      answer: '' // 初始化答案
    }

    if (!currentImage.value.labels) {
      currentImage.value.labels = []
    }
    currentImage.value.labels.push(label)
    
    // 畫完新框後，自動聚焦到新框的輸入欄位
    focusLabelInput(currentImage.value.labels.length - 1)
    
    loadImage()
  }
}

const removeLabel = (index: number) => {
  const img = currentImage.value
  if (img && img.labels) {
    img.labels.splice(index, 1)
    // 刪除後調整選取狀態
    if (selectedLabelIndex.value === index) {
      selectedLabelIndex.value = -1
    } else if (selectedLabelIndex.value > index) {
      selectedLabelIndex.value--
    }
    loadImage()
  }
}

const clearLabels = () => {
  const img = currentImage.value
  if (img && img.labels) {
    img.labels = []
    selectedLabelIndex.value = -1
    loadImage()
  }
}

const extractBase64FromPreview = (preview: string) => {
  const separatorIndex = preview.indexOf(',')
  return separatorIndex >= 0 ? preview.slice(separatorIndex + 1) : preview
}

const fetchPredictionsForCurrentImage = async () => {
  const img = currentImage.value
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
    const response = await fetch('/api/predict', { 
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ image_base64 })
    })

    if (!response.ok) {
      throw new Error(`Prediction failed with status ${response.status}`)
    }

    const data = await response.json()
    const detections = data?.detections || data?.body?.json?.detections || []

    const mappedLabels: Label[] = detections.map((detection: any) => {
      const bbox = detection?.bbox || []
      const [x1, y1, x2, y2] = bbox
      const normalizedX1 = Number(x1) || 0
      const normalizedY1 = Number(y1) || 0
      const normalizedX2 = Number(x2) || 0
      const normalizedY2 = Number(y2) || 0

      const boxX = Math.max(0, normalizedX1 * scale + offsetX)
      const boxY = Math.max(0, normalizedY1 * scale + offsetY)
      const boxWidth = Math.abs(normalizedX2 - normalizedX1) * scale
      const boxHeight = Math.abs(normalizedY2 - normalizedY1) * scale

      return {
        class: DEFAULT_CLASS,
        x: boxX,
        y: boxY,
        width: boxWidth,
        height: boxHeight,
        answer: ''
      }
    })

    img.labels = mappedLabels
    img.predictionsLoaded = true
    loadImage()
  } catch (error: any) {
    console.error('Error fetching predictions:', error)
    img.predictionError = error?.message || 'Unable to fetch predictions'
  } finally {
    img.isPredicting = false
  }
}

const retryPrediction = () => {
  const img = currentImage.value
  if (!img || img.isPredicting) return

  img.predictionsLoaded = false
  img.predictionError = undefined
  img.labels = []
  selectedLabelIndex.value = -1
  fetchPredictionsForCurrentImage()
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
  if (direction === 'up') panY.value += step
  if (direction === 'down') panY.value -= step
  if (direction === 'left') panX.value += step
  if (direction === 'right') panX.value -= step
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
  const yoloData = images.value.map(img => {
    const labels = img.labels || []
    return {
      image: img.name,
      annotations: labels.map(label => ({
        class: label.class,
        bbox: [label.x, label.y, label.width, label.height],
        answer: label.answer || '' // 包含答案
      }))
    }
  })
  
  const blob = new Blob([JSON.stringify(yoloData, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'yolo_labels.json'
  a.click()
  URL.revokeObjectURL(url)
}

const goToResults = async () => {
  if (!currentImage.value || isProcessingOCR.value) return;
  
  const img = currentImage.value;
  const labels = img.labels || [];
  
  const base64Data = extractBase64FromPreview(img.preview);
  const previewImg = await loadPreviewImage(img.preview);
  const { scale, offsetX, offsetY } = computeFit(previewImg.width, previewImg.height);

  const inputPayload = {
    image: base64Data,
    annotations: labels.map(l => ({
      class: l.class,
      answer: l.answer || '', // 傳遞答案給後端
      bbox: [
        (l.x - offsetX) / scale,
        (l.y - offsetY) / scale,
        ((l.x - offsetX) / scale) + (l.width / scale),
        ((l.y - offsetY) / scale) + (l.height / scale)
      ]
    }))
  };

  const inputBlob = new Blob([JSON.stringify(inputPayload, null, 2)], { type: 'application/json' });
  const inputLink = document.createElement('a');
  inputLink.href = URL.createObjectURL(inputBlob);
  inputLink.download = `input.json`;
  inputLink.click();
  URL.revokeObjectURL(inputLink.href);

  isProcessingOCR.value = true;
  
  try {
    const response = await fetch('/api/ocr_process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inputPayload)
    });

    if (!response.ok) throw new Error(`API 錯誤: ${response.status}`);
    
    const resultData = await response.json(); 

    const outputBlob = new Blob([JSON.stringify(resultData, null, 2)], { type: 'application/json' });
    const outputLink = document.createElement('a');
    outputLink.href = URL.createObjectURL(outputBlob);
    outputLink.download = `output.json`;
    outputLink.click();
    URL.revokeObjectURL(outputLink.href);

    router.push({ 
      name: 'results', 
      state: { 
        ocrResults: resultData,
        imageName: img.name 
      } 
    });

  } catch (error: any) {
    console.error('OCR 失敗:', error);
    alert('辨識失敗，請檢查網路面板或後端 Log');
  } finally {
    isProcessingOCR.value = false;
  }
};
</script>

<style scoped>
.label-container {
  padding: 1rem 2rem 2rem 2rem;
  height: calc(100vh - 4rem);
  overflow: hidden;
}

h1 {
  text-align: center;
  color: #2c3e50;
  margin-bottom: 1rem;
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
  border: 2px solid #ddd;
  border-radius: 4px;
  background-color: white;
  transition: cursor 0.1s;
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

.controls {
  background-color: #f5f5f5;
  border-radius: 8px;
  padding: 1rem;
  width: 360px;
  max-width: 380px;
  height: 100%;
  overflow-y: auto;
}

/* 模式切換器專用樣式 */
.mode-selector {
  margin-bottom: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.mode-selector label {
  font-weight: bold;
  color: #2c3e50;
}

.mode-buttons {
  display: flex;
  gap: 0.5rem;
}

.mode-buttons button {
  flex: 1;
  padding: 0.6rem;
  border: 2px solid #ddd;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
  transition: all 0.2s;
}

.mode-buttons button.active {
  border-color: #42b883;
  background-color: #e8f5e9;
  color: #42b883;
}

.mode-buttons button:hover:not(.active) {
  background-color: #f9f9f9;
  border-color: #ccc;
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

.single-class-label {
  background: #e8f5e9;
  color: #2c3e50;
  padding: 0.4rem 0.75rem;
  border-radius: 4px;
  font-weight: bold;
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

/* ----- 修改後的 Label Item 樣式 (單行整合版 + 大字體) ----- */

.label-item {
  position: relative; /* 為了讓絕對定位的叉叉按鈕參考 */
  display: block; /* 改為 block 方便內部 flex 排版 */
  padding: 1rem 0.75rem; /* 加大上下 padding，讓點擊區域更舒適 */
  background-color: white;
  border-radius: 6px;
  margin-bottom: 0.75rem; /* 增加間距 */
  border: 2px solid transparent; /* 預留邊框位置 */
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 4px rgba(0,0,0,0.08); /* 稍微加深陰影 */
}

/* 選取時的樣式 */
.label-item.selected {
  border-color: #ff5252;
  background-color: #fff5f5; /* 淡淡的紅色背景 */
}

/* 單行排版容器：名稱在左，輸入框在右 */
.label-content-row {
  display: flex;
  align-items: center;
  justify-content: space-between; /* 左右撐開 */
  margin-right: 32px; /* 右側預留空間給垂直置中的刪除按鈕 */
}

/* 標籤名稱：字體放大 */
.label-name {
  font-weight: bold;
  font-size: 1.2rem; /* 字體放大 */
  color: #42b883;
}

/* 選取時文字變紅 */
.label-name.text-red {
  color: #d32f2f;
}

/* 輸入框群組 (包含 "答:" 字樣) */
.label-input-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.input-prefix {
  font-size: 1rem;
  font-weight: bold;
  color: #2c3e50;
}

/* 輸入框樣式：字體放大、框加大 */
.label-input-group input {
  width: 70px; /* 寬度加寬 */
  padding: 4px 8px;
  border: 2px solid #ddd;
  border-radius: 6px;
  outline: none;
  font-size: 1.2rem; /* 輸入字體放大 */
  text-align: center;
  color: #2c3e50; 
  font-weight: bold;
  background-color: #f9f9f9;
}

.label-input-group input:focus {
  border-color: #42b883;
  background-color: #fff;
  box-shadow: 0 0 0 3px rgba(66, 184, 131, 0.15);
}

/* 刪除按鈕：垂直置中 */
.remove-label-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%); /* 垂直置中修正 */
  right: 8px;
  
  background-color: transparent;
  color: #bbb;
  border: none;
  width: 32px; /* 按鈕範圍加大 */
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 1.5rem; /* 叉叉符號放大 */
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.remove-label-btn:hover {
  background-color: #ff5252;
  color: white;
}

/* 舊的樣式若不再使用可忽略，為避免衝突或遺漏仍保留基礎設定 */
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