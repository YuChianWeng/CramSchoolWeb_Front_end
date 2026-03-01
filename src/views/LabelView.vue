<template>
  <div class="label-container">
    <h1>Image Labeling for YOLO</h1>
    
    <div v-if="!hasAnyImages" class="no-images">
      <p>No images uploaded. Please upload images first.</p>
      <button @click="goToUpload" class="upload-link-btn">Go to Upload</button>
    </div>

    <div v-else class="labeling-workspace">
      <div class="sidebar">
        <h2>Image List</h2>
        <div class="view-toggle">
          <button
            :class="{ active: viewMode === 'student' }"
            @click="viewMode = 'student'"
          >
            學生卷檢視
          </button>
          <button
            :class="{ active: viewMode === 'master' }"
            @click="viewMode = 'master'"
          >
            答案卷檢視
          </button>
        </div>
        <div class="image-list">
          <div
            v-for="(img, index) in displayedImages"
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
              tabindex="0"
              :style="{ 
                cursor: getCursorStyle(),
                outline: 'none' /* 移除聚焦時的預設黑框 */
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
                >✋ 拖移（或按住Ctrl）</button>
              </div>
            </div>

            <div class="class-selector single-class">
              <label>標註類型：</label>
              <span class="single-class-label">{{ DEFAULT_CLASS }}</span>
                <button
                  @click="retryPrediction"
                  :disabled="currentImage?.isPredicting"
                  class="retry-btn"
                >
                  重新偵測
                </button>
              
              <button
                @click="applyLabelsToAll"
                :disabled="!currentImage?.labels || currentImage.labels.length === 0"
                class="apply-all-btn"
              >
                全部套用
              </button>

              <button
                @click="autoSort"
                :disabled="!currentImage?.labels || currentImage.labels.length === 0"
                class="auto-sort-btn"
              >
                自動排序
              </button>

              <button
                @click="detectAnswers"
                :disabled="isProcessingOCR"
                class="detect-answers-btn"
              >
                {{ isProcessingOCR ? '辨識中...' : '答案偵測' }}
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
                  @click="isMasterView ? focusLabelInput(index) : selectLabel(index)"
                >
                  <button @click.stop="removeLabel(index)" class="remove-label-btn">×</button>

                  <div class="label-content-row">
                    <span class="label-name" :class="{ 'text-red': index === selectedLabelIndex }">
                      {{ label.class }} ({{ index + 1 }})
                    </span>

                    <div v-if="isMasterView" class="label-expected">
                      <span class="input-prefix">正解:</span>
                      <input
                        type="text"
                        v-model="label.expectedAnswer"
                        maxlength="4"
                        class="expected-value"
                        :ref="(el) => { if(el) inputRefs[index] = el as HTMLInputElement }"
                        @focus="selectLabel(index)"
                        @keydown="handleInputKeydown(index, $event)"
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
                ← 上一張
              </button>
              <span class="image-counter">
                {{ currentImageIndex + 1 }} / {{ displayedImages.length }}
              </span>
              <button
                @click="nextImage"
                :disabled="currentImageIndex === displayedImages.length - 1"
                class="nav-btn"
              >
                下一張 →
              </button>
            </div>

            <div class="auto-apply-option">
              <label class="checkbox-label">
                <input type="checkbox" v-model="autoApplyMasterToResults" />
                <span>自動套用答案卷標註到所有考卷</span>
              </label>
            </div>

            <div class="action-buttons">
              <button @click="clearLabels" class="clear-labels-btn">清除標註</button>
              <button @click="exportLabels" class="export-btn">匯出標註</button>
              <button @click="goToResults" class="results-btn">查看結果</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick, onBeforeUpdate, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants'
import { setResultsData, getStoreData, hasData, updateStudentImages, updateMasterImage } from '../stores/resultsStore'

const DEFAULT_CLASS = '答案區'

interface Label {
  class: string
  x: number
  y: number
  width: number
  height: number
  recognizedAnswer?: string
  answer?: string
  expectedAnswer?: string
  isCorrect?: boolean
  // [新增] 用來暫存後端回傳的兩種結果
  ocrCandidates?: {
    chinese: string
    digit: string
  }
}

interface ImageData {
  name: string
  preview: string
  labels?: Label[]
  predictionsLoaded?: boolean
  isPredicting?: boolean
  predictionError?: string
  role: 'student' | 'master'
}

const draggingLabelIndex = ref<number>(-1) // 記錄正在拖曳的標籤索引
const dragOffset = ref({ x: 0, y: 0 })     // 記錄點擊點與框框左上角的距離
const hoverLabelIndex = ref<number>(-1)    // 記錄滑鼠目前懸停在哪個框上 (用來變更游標)
const router = useRouter()
const canvas = ref<HTMLCanvasElement | null>(null)
const studentImages = ref<ImageData[]>([])
const masterKeyImage = ref<ImageData | null>(null)
const viewMode = ref<'student' | 'master'>('master')
const currentImageIndex = ref(0)
const currentClass = ref(DEFAULT_CLASS)
const isDrawing = ref(false)
const isPanning = ref(false)
const currentMode = ref<'draw' | 'pan'>('draw')
const isCtrlPressed = ref(false) // 追蹤 Ctrl 鍵狀態
const isProcessingOCR = ref(false)
const startX = ref(0)
const startY = ref(0)
const currentX = ref(0)
const currentY = ref(0)
const panX = ref(0)
const panY = ref(0)
const zoom = ref(1)

const selectedLabelIndex = ref<number>(-1)
const inputRefs = ref<HTMLInputElement[]>([])
const autoApplyMasterToResults = ref(true) // 自動套用答案卷到結果頁的開關

const displayedImages = computed(() =>
  viewMode.value === 'student'
    ? studentImages.value
    : masterKeyImage.value
      ? [masterKeyImage.value]
      : []
)
const currentImage = computed(() => displayedImages.value[currentImageIndex.value])
const isMasterView = computed(() => viewMode.value === 'master')
const hasAnyImages = computed(() => studentImages.value.length > 0 || !!masterKeyImage.value)

// 確保在列表更新前清空 refs
onBeforeUpdate(() => {
  inputRefs.value = []
})

// 監聽 Ctrl 鍵狀態
const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Control') {
    isCtrlPressed.value = true
  }
}
const handleKeyUp = (event: KeyboardEvent) => {
  if (event.key === 'Control') {
    isCtrlPressed.value = false
  }
}

onMounted(async () => {
  // 註冊全域鍵盤監聽
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)

  // 從統一的 store 讀取資料
  if (hasData()) {
    const { studentImages: storedStudents, masterKeyImage: storedMaster } = getStoreData()

    if (storedStudents.length > 0) {
      studentImages.value = storedStudents.map((f: any) => ({
        ...f,
        labels: f.labels || [],
        preview: f.preview,
        predictionsLoaded: f.predictionsLoaded || false,
        isPredicting: false,
        predictionError: undefined,
        role: 'student'
      }))
    }

    if (storedMaster) {
      masterKeyImage.value = {
        ...storedMaster,
        labels: storedMaster.labels || [],
        preview: storedMaster.preview,
        predictionsLoaded: storedMaster.predictionsLoaded || false,
        isPredicting: false,
        predictionError: undefined,
        role: 'master'
      }
    }
  }
  if (studentImages.value.length === 0) {
    studentImages.value = [
      { name: 'sample1.jpg', preview: '', labels: [], predictionsLoaded: false, role: 'student' },
      { name: 'sample2.jpg', preview: '', labels: [], predictionsLoaded: false, role: 'student' }
    ]
  }
  currentImageIndex.value = 0

  // 先顯示圖片
  nextTick(() => {
    handleImageChange()
  })

  // 檢查是否已經有標註資料（例如從 ResultsView 返回）
  const hasExistingLabels = studentImages.value.some(img => img.labels && img.labels.length > 0) ||
    (masterKeyImage.value?.labels && masterKeyImage.value.labels.length > 0)

  // 只有在沒有現有標註時才執行初始 YOLO 偵測
  if (!hasExistingLabels) {
    // 用第一張學生卷做 YOLO 偵測（手寫優化模型），然後套用到答案卷和其他學生卷
    const firstStudent = studentImages.value[0]
    if (firstStudent && firstStudent.preview) {
      await fetchPredictionsForImage(firstStudent)

      if (firstStudent.labels && firstStudent.labels.length > 0) {
        // 自動排序
        const previewImg = await loadPreviewImage(firstStudent.preview)
        const isVertical = previewImg.height > previewImg.width
        firstStudent.labels = isVertical
          ? sortLabelsVertical(firstStudent.labels)
          : sortLabelsRightToLeft(firstStudent.labels)

        // 套用到答案卷
        if (masterKeyImage.value) {
          masterKeyImage.value.labels = firstStudent.labels.map(label => ({
            ...label,
            answer: '',
            recognizedAnswer: undefined,
            expectedAnswer: undefined,
            ocrCandidates: undefined,
            isCorrect: undefined
          }))
          masterKeyImage.value.predictionsLoaded = true
          masterKeyImage.value.predictionError = undefined
        }

        // 套用到其他學生卷
        const sourceLabels = firstStudent.labels
        studentImages.value.forEach((student, index) => {
          if (index === 0) return // 跳過第一張（已經有了）
          student.labels = sourceLabels.map(label => ({
            ...label,
            answer: '',
            recognizedAnswer: undefined,
            expectedAnswer: undefined,
            ocrCandidates: undefined,
            isCorrect: undefined
          }))
          student.predictionsLoaded = true
          student.predictionError = undefined
        })

        // 偵測完成後重新繪製
        loadImage()
      }
    }
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
})

watch(currentImageIndex, () => {
  handleImageChange()
})

watch(viewMode, () => {
  currentImageIndex.value = 0
  nextTick(() => {
    handleImageChange()
  })
})

const getCursorStyle = () => {
  const isPanMode = currentMode.value === 'pan' || isCtrlPressed.value

  // 正在拖曳中
  if (isPanning.value || draggingLabelIndex.value !== -1) {
    return 'grabbing'
  }

  // 拖移模式下，hover 在框框上顯示小手
  if (isPanMode && hoverLabelIndex.value !== -1) {
    return 'grab'
  }

  // 拖移模式下，空白處顯示小手
  if (isPanMode) {
    return 'grab'
  }

  // 標註模式，一律顯示十字
  return 'crosshair'
}

// [修改] 改名為 runOCRForImage，並接受參數，讓它可以處理任何一張圖
const extractTextValue = (value: any, seen = new Set<any>()): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim()
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? extractTextValue(value[0], seen) : ''
  }
  if (typeof value === 'object') {
    if (seen.has(value)) return ''
    seen.add(value)
    const candidate =
      value.text ??
      value.words ??
      value.word ??
      value.label ??
      value.content ??
      value.result ??
      value.prediction ??
      value.ocr ??
      value.value ??
      value.answer ??
      value.recognizedAnswer ??
      value.data?.text ??
      value.data?.words ??
      value.data?.word ??
      value.data?.label ??
      value.data?.result ??
      value.data?.prediction ??
      value.data?.ocr
    if (candidate !== undefined && candidate !== null) {
      return candidate === value ? '' : extractTextValue(candidate, seen)
    }
    for (const key of Object.keys(value)) {
      const found = extractTextValue((value as Record<string, any>)[key], seen)
      if (found) return found
    }
  }
  return ''
}

const chooseOcrValue = (res: { chinese?: string; digit?: string } | string) => {
  if (typeof res === 'string') return res.trim()
  const digit = String(res.digit || '').trim()
  const chinese = String(res.chinese || '').trim()
  return digit || chinese
}

const runOCRForImage = async (img: ImageData, target: 'student' | 'master') => {
  // 檢查傳入的圖片是否有效
  if (!img || !img.preview || !img.labels || img.labels.length === 0) return;

  try {
    // 1. 準備資料
    const base64Data = extractBase64FromPreview(img.preview);
    const previewImg = await loadPreviewImage(img.preview);
    const { scale, offsetX, offsetY } = computeFit(previewImg.width, previewImg.height);

    const inputPayload = {
      image: base64Data,
      annotations: img.labels.map(l => ({
        class: l.class,
        bbox: [
          (l.x - offsetX) / scale,
          (l.y - offsetY) / scale,
          ((l.x - offsetX) / scale) + (l.width / scale),
          ((l.y - offsetY) / scale) + (l.height / scale)
        ]
      }))
    };

    // 2. 呼叫後端（加入 30 秒逾時）
    const endpoint = target === 'master' ? '/ocr_google' : '/api/ocr_process'
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inputPayload),
      signal: controller.signal
    });
    clearTimeout(timeoutId)

    if (!response.ok) throw new Error('OCR API Error');
    const resultData = await response.json();

    // 3. 將回傳結果填入 labels
    const results = resultData.ocr_results || resultData.results || [];
    console.log('OCR 回傳結果:', JSON.stringify(results, null, 2)) // 偵錯用

    if (Array.isArray(results)) {
      results.forEach((res: any, index: number) => {
        // 確保對應的 label 還存在
        if (img.labels && img.labels[index]) {
          const targetLabel = img.labels[index];
          if (target === 'master') {
            // 優先抓取 google_text，避免 extractTextValue 誤抓 bbox 數字
            const googleText = res.google_text ?? res.text ?? res.answer ?? ''
            targetLabel.expectedAnswer = typeof googleText === 'string' ? googleText : ''
            targetLabel.ocrCandidates = undefined
            targetLabel.recognizedAnswer = undefined
            console.log(`Label ${index}: expectedAnswer = "${targetLabel.expectedAnswer}"`) // 偵錯用
          } else {
            const candidate =
              res && (res.chinese !== undefined || res.digit !== undefined)
                ? {
                    chinese: String(res.chinese || ''),
                    digit: String(res.digit || '')
                  }
                : undefined

            if (candidate) {
              targetLabel.ocrCandidates = candidate
              updateRecognizedAnswer(targetLabel)
            } else {
              targetLabel.ocrCandidates = undefined
              targetLabel.recognizedAnswer = extractTextValue(res)
            }
          }
        }
      });
      console.log(`圖片 ${img.name} 背景 OCR 完成`);
    }

  } catch (error) {
    console.warn(`圖片 ${img.name} OCR 失敗 (不影響標註):`, error);
  }
};

const handleImageChange = () => {
  selectedLabelIndex.value = -1 
  inputRefs.value = [] 
  panX.value = 0
  panY.value = 0
  zoom.value = 1
  if (currentImage.value) {
    currentImage.value.predictionError = undefined
    if (!currentImage.value.labels) currentImage.value.labels = []
  }
  loadImage()
  if (currentImage.value?.role === 'student') {
    fetchPredictionsForCurrentImage()
  }
}

// 全域鍵盤事件：處理非輸入框焦點時的刪除
const handleGlobalKeydown = (event: KeyboardEvent) => {
  if (selectedLabelIndex.value === -1) return

  if (event.key === 'Backspace' || event.key === 'Delete') {
    const activeEl = document.activeElement as HTMLElement
    
    // 如果焦點正在輸入框內，不執行這裡的邏輯 (交給 handleInputKeydown)
    if (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement || activeEl?.isContentEditable) {
      return
    }

    event.preventDefault()
    removeLabel(selectedLabelIndex.value)
  }
}

const computeFit = (imgWidth: number, imgHeight: number) => {
  const scale = Math.min(CANVAS_WIDTH / imgWidth, CANVAS_HEIGHT / imgHeight)
  const offsetX = (CANVAS_WIDTH - imgWidth * scale) / 2
  const offsetY = (CANVAS_HEIGHT - imgHeight * scale) / 2

  return { scale, offsetX, offsetY }
}

// [新增] 根據輸入的答案，自動選擇要採信 OCR 的中文還是數字結果
const updateRecognizedAnswer = (label: Label) => {
  // 如果沒有候選資料，就跳過
  if (!label.ocrCandidates) return

  const input = label.answer ? label.answer.trim() : ''
  
  // 判斷邏輯：如果是純數字 (RegExp: ^\d+$)，就選 digit，否則選 chinese
  // 你也可以改用 /[0-9]/.test(input) 只要包含數字就切換，視你的需求而定
  const isDigit = /^\d+$/.test(input)

  if (isDigit) {
    label.recognizedAnswer = label.ocrCandidates.digit
  } else {
    label.recognizedAnswer = label.ocrCandidates.chinese
  }
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
    const isSelected = index === selectedLabelIndex.value
    ctx.strokeStyle = isSelected ? '#ff5252' : '#42b883'
    ctx.lineWidth = isSelected ? 3 : 2 
    ctx.strokeRect(label.x, label.y, label.width, label.height)
  })
}

const focusLabelInput = (index: number) => {
  nextTick(() => {
    const inputEl = inputRefs.value[index]
    if (inputEl) {
      inputEl.focus()
    }
  })
}

const selectLabel = (index: number) => {
  if (selectedLabelIndex.value !== index) {
    selectedLabelIndex.value = index
    loadImage()
  }
}

// [修改] 處理輸入框按鍵事件：Enter 跳轉 & Backspace 刪除
const handleInputKeydown = (index: number, event: KeyboardEvent) => {
  const label = currentImage.value?.labels?.[index]
  if (!label) return
  const inputValue = isMasterView.value ? label.expectedAnswer : label.answer

  // 1. Enter 鍵 -> 跳到下一個輸入框
  if (event.key === 'Enter') {
    event.preventDefault()
    // 檢查是否有下一個標籤
    const nextIndex = index + 1
    if (currentImage.value?.labels && nextIndex < currentImage.value.labels.length) {
      focusLabelInput(nextIndex)
    }
    return
  }

  // 2. Backspace/Delete 鍵 -> 如果是空的則刪除框框
  if ((event.key === 'Backspace' || event.key === 'Delete') && (inputValue ?? '') === '') {
    event.preventDefault()
    removeLabel(index)
  }
}

const startDrawing = (event: MouseEvent) => {
  if (!canvas.value) return

  // 判斷是否為拖移模式（拖移按鈕選中 或 按住 Ctrl）
  const isPanMode = currentMode.value === 'pan' || event.ctrlKey

  const { x, y } = getCanvasCoords(event)
  const labels = currentImage.value?.labels || []

  // 檢查是否點擊在現有的框框上
  let hitIndex = -1
  for (let i = labels.length - 1; i >= 0; i--) {
    const l = labels[i]
    if (!l) continue
    if (x >= l.x && x <= l.x + l.width && y >= l.y && y <= l.y + l.height) {
      hitIndex = i
      break
    }
  }

  // === 拖移模式 ===
  if (isPanMode) {
    if (hitIndex !== -1) {
      // 點到框框 → 移動框框
      draggingLabelIndex.value = hitIndex
      selectedLabelIndex.value = hitIndex
      const targetLabel = labels[hitIndex]
      if (targetLabel) {
        dragOffset.value = {
          x: x - targetLabel.x,
          y: y - targetLabel.y
        }
      }
      focusLabelInput(hitIndex)
      loadImage()
    } else {
      // 點到空白處 → 移動畫布
      startPan(event)
    }
    return
  }

  // === 標註模式 ===
  // 點到框框 → 選取該框框（不移動）
  if (hitIndex !== -1) {
    selectedLabelIndex.value = hitIndex
    focusLabelInput(hitIndex)
    loadImage()
    return
  }

  // 點到空白處 → 清除選取並開始畫新框
  if (selectedLabelIndex.value !== -1) {
    selectedLabelIndex.value = -1
    loadImage()
  }

  startX.value = x
  startY.value = y
  isDrawing.value = true
}

const draw = (event: MouseEvent) => {
  const { x, y } = getCanvasCoords(event)

  if (isPanning.value) {
    handlePanMove(event)
    return
  }

  // [修正] 拖曳框框的邏輯
  if (draggingLabelIndex.value !== -1 && currentImage.value?.labels) {
    const label = currentImage.value.labels[draggingLabelIndex.value]
    // [修正] 確保 label 存在才執行
    if (label) {
      label.x = x - dragOffset.value.x
      label.y = y - dragOffset.value.y
      loadImage()
    }
    return
  }

  // [修正] 滑鼠懸停 (Hover) 效果的邏輯
  if (!isDrawing.value && draggingLabelIndex.value === -1) {
    const labels = currentImage.value?.labels || []
    let found = -1
    for (let i = labels.length - 1; i >= 0; i--) {
      const l = labels[i]
      // [修正] 加入 undefined 檢查
      if (!l) continue

      if (x >= l.x && x <= l.x + l.width && y >= l.y && y <= l.y + l.height) {
        found = i
        break
      }
    }
    if (hoverLabelIndex.value !== found) {
      hoverLabelIndex.value = found
    }
  }

  // 畫新框邏輯 (保持原樣)
  if (!isDrawing.value || !canvas.value) return

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

const extractBase64FromPreview = (preview: string) => {
  const separatorIndex = preview.indexOf(',')
  return separatorIndex >= 0 ? preview.slice(separatorIndex + 1) : preview
}

// [新增] 通用函數：對任意圖片執行 YOLO 偵測
const fetchPredictionsForImage = async (img: ImageData) => {
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
  } catch (error: any) {
    console.error('Error fetching predictions:', error)
    img.predictionError = error?.message || 'Unable to fetch predictions'
  } finally {
    img.isPredicting = false
  }
}

const fetchPredictionsForCurrentImage = async () => {
  const img = currentImage.value
  if (!img) return

  await fetchPredictionsForImage(img)
  loadImage()
  // 學生卷 OCR 移到結果頁面執行，這裡只做 YOLO 偵測框框位置
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

const endDrawing = () => {
  // 1. 結束平移
  if (isPanning.value) {
    stopPan()
    return
  }

  // 2. [新增] 結束框框拖曳
  if (draggingLabelIndex.value !== -1) {
    draggingLabelIndex.value = -1 // 重置拖曳狀態
    return
  }

  // 3. 結束畫新框 (原本的邏輯)
  if (!isDrawing.value || !currentImage.value) return

  isDrawing.value = false

  const width = currentX.value - startX.value
  const height = currentY.value - startY.value

  if (Math.abs(width) > 10 && Math.abs(height) > 10) {
    // ... (維持原本的新增 Label 邏輯) ...
    const label: Label = {
      class: currentClass.value,
      x: Math.min(startX.value, currentX.value),
      y: Math.min(startY.value, currentY.value),
      width: Math.abs(width),
      height: Math.abs(height),
      answer: ''
    }

    if (!currentImage.value.labels) {
      currentImage.value.labels = []
    }
    currentImage.value.labels.push(label)

    focusLabelInput(currentImage.value.labels.length - 1)
    selectedLabelIndex.value = currentImage.value.labels.length - 1 // 新增完自動選中
    loadImage()
  }
}
const removeLabel = (index: number) => {
  const img = currentImage.value
  if (img && img.labels) {
    img.labels.splice(index, 1)
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

// [修改] 將當前圖片的標註框套用到所有圖片（不執行OCR）
const applyLabelsToAll = () => {
  // 1. 基本檢查
  if (!currentImage.value?.labels || currentImage.value.labels.length === 0) return

  const totalTargets = studentImages.value.length + (masterKeyImage.value ? 1 : 0)
  const confirmMsg = `確定要將目前的 ${currentImage.value.labels.length} 個標註框套用到所有 ${totalTargets} 張圖片嗎？\n\n注意：這將會覆蓋其他圖片現有的標註！`
  if (!confirm(confirmMsg)) return

  // 2. 準備「乾淨」的樣板
  const isMasterSource = currentImage.value.role === 'master'
  const sourceLabels = currentImage.value.labels.map(label => ({
    ...label,
    recognizedAnswer: undefined,
    expectedAnswer: isMasterSource ? label.expectedAnswer : undefined,
    ocrCandidates: undefined,
    isCorrect: undefined
  }))

  if (masterKeyImage.value) {
    masterKeyImage.value.labels = sourceLabels.map(label => ({
      ...label,
      answer: ''
    }))
    masterKeyImage.value.predictionsLoaded = true
    masterKeyImage.value.predictionError = undefined
  }

  studentImages.value.forEach(img => {
    img.labels = sourceLabels.map(label => ({
      ...label,
      answer: isMasterSource ? '' : label.answer
    }))
    img.predictionsLoaded = true
    img.predictionError = undefined
  })

  alert('已成功套用標註框！')
}

// [新增] 排序標註：從右上到左下（先上到下，再右到左）
const sortLabelsRightToLeft = (labels: Label[]): Label[] => {
  return [...labels].sort((a, b) => {
    // 先按 Y 座標排序（小到大，從上到下）
    const yDiff = Math.abs(a.y - b.y)
    if (yDiff > 10) { // 如果 Y 座標差異大於 10px，認為是不同行
      return a.y - b.y
    }
    // 同一行內，按 X 座標排序（大到小，從右到左）
    return b.x - a.x
  })
}

// [新增] 直式考卷排序：左半部優先，每半部內由上到下、由左到右
const sortLabelsVertical = (labels: Label[]): Label[] => {
  if (labels.length === 0) return labels

  const centerXs = labels.map(l => l.x + l.width / 2).sort((a, b) => a - b)
  const midLine = centerXs[Math.floor(centerXs.length / 2)] ?? 0

  return [...labels].sort((a, b) => {
    const aIsLeft = (a.x + a.width / 2) < midLine
    const bIsLeft = (b.x + b.width / 2) < midLine

    // 左半部優先於右半部
    if (aIsLeft !== bIsLeft) return aIsLeft ? -1 : 1

    // 同一半部內：先按 Y（由上到下）
    const yDiff = Math.abs(a.y - b.y)
    if (yDiff > 10) return a.y - b.y

    // 同一行內：按 X（由左到右）
    return a.x - b.x
  })
}

// [新增] 自動排序：根據圖片寬高判斷直式/橫式並排序
const autoSort = async () => {
  const img = currentImage.value
  if (!img?.labels || img.labels.length === 0 || !img.preview) return

  const previewImg = await loadPreviewImage(img.preview)
  const isVertical = previewImg.height > previewImg.width

  if (isVertical) {
    img.labels = sortLabelsVertical(img.labels)
    alert('已偵測為直式考卷，排序完成（左半部優先，由上到下、由左到右）')
  } else {
    img.labels = sortLabelsRightToLeft(img.labels)
    alert('已偵測為橫式考卷，排序完成（由上到下、由右到左）')
  }

  loadImage()
}

// [修改] 只對答案卷執行答案偵測（學生卷 OCR 移至結果頁面）
const detectAnswers = async () => {
  // 只處理答案卷
  if (!masterKeyImage.value || !masterKeyImage.value.labels || masterKeyImage.value.labels.length === 0) {
    alert('請先在答案卷建立標註框！')
    return
  }

  isProcessingOCR.value = true

  try {
    await runOCRForImage(masterKeyImage.value, 'master')

    // 重新繪製畫面
    loadImage()

    alert('答案卷偵測完成！正解已填入。')
  } catch (error) {
    console.error('答案偵測失敗:', error)
    alert('答案偵測過程中發生錯誤，請查看控制台。')
  } finally {
    isProcessingOCR.value = false
  }
}

const nextImage = () => {
  if (currentImageIndex.value < displayedImages.value.length - 1) {
    currentImageIndex.value++
  }
}

const goToUpload = () => {
  router.push({ name: 'upload' })
}

const exportLabels = () => {
  const allImages = [
    ...(masterKeyImage.value ? [masterKeyImage.value] : []),
    ...studentImages.value
  ]
  const yoloData = allImages.map(img => {
    const labels = img.labels || []
    return {
      image: img.name,
      role: img.role,
      annotations: labels.map(label => ({
        class: label.class,
        bbox: [label.x, label.y, label.width, label.height],
        answer: label.expectedAnswer || label.answer || ''
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

const goToResults = () => {
  if (!currentImage.value) return;

  // [新增] 如果開關開啟，自動套用答案卷標註到所有學生考卷
  if (autoApplyMasterToResults.value && masterKeyImage.value?.labels && masterKeyImage.value.labels.length > 0) {
    const masterLabels = masterKeyImage.value.labels

    studentImages.value.forEach(student => {
      // 為每個學生建立新的 labels，基於 master 的框框位置和 expectedAnswer
      student.labels = masterLabels.map((masterLabel, index) => {
        // 如果學生已經有這個位置的標註資料，保留它的 OCR 結果
        const existingLabel = student.labels?.[index]

        return {
          ...masterLabel, // 複製框框位置和 class
          expectedAnswer: masterLabel.expectedAnswer, // 複製正解
          answer: existingLabel?.answer || '', // 保留學生的答案（如果有）
          recognizedAnswer: existingLabel?.recognizedAnswer, // 保留 OCR 結果
          ocrCandidates: existingLabel?.ocrCandidates, // 保留 OCR 候選
          isCorrect: existingLabel?.isCorrect // 保留判定結果
        }
      })
      student.predictionsLoaded = true
      student.predictionError = undefined
    })
  }

  // 1. 深拷貝整理資料
  const cleanMasterKey = masterKeyImage.value
    ? JSON.parse(JSON.stringify(masterKeyImage.value))
    : null
  const cleanStudents = JSON.parse(JSON.stringify(studentImages.value))

  // 2. 同步更新 store（保持資料持久）
  updateStudentImages(cleanStudents)
  updateMasterImage(cleanMasterKey)

  // 3. 同時設定 resultsData（供 ResultsView 使用）
  setResultsData({
    masterKey: cleanMasterKey,
    students: cleanStudents
  });

  // 4. 背景儲存模板到後端（靜默，不擋換頁）
  const master = masterKeyImage.value
  const isFromTemplate = !!master?.preview?.startsWith('/api/exam-templates')
  const hasLabels = (master?.labels?.length ?? 0) > 0
  const hasAnswers = master?.labels?.some(l => l.expectedAnswer || l.answer)

  if (master && hasLabels && hasAnswers && !isFromTemplate) {
    const pages = [{
      image: master.name,
      annotations: (master.labels ?? []).map(label => ({
        class: label.class,
        bbox: [label.x, label.y, label.width, label.height],
        answer: label.expectedAnswer || label.answer || ''
      }))
    }]
    fetch('/api/exam-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exam_name: master.name,
        image_base64: master.preview,
        pages
      })
    }).catch(() => {})
  }

  // 5. 換頁
  router.push({ name: 'results' });
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

.view-toggle {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.view-toggle button {
  flex: 1;
  padding: 0.5rem;
  border: 2px solid #ddd;
  border-radius: 6px;
  background: white;
  cursor: pointer;
  font-weight: bold;
  color: #2c3e50;
  transition: all 0.2s;
}

.view-toggle button.active {
  border-color: #42b883;
  background-color: #e8f5e9;
  color: #42b883;
}

.view-toggle button:hover:not(.active) {
  background-color: #f9f9f9;
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
  background-color: #f0f0f0;
  border: 2px solid transparent;
  transition: all 0.3s;
  color: #666;
}

.image-list-item:hover {
  background-color: #e8f5e9;
}

.image-list-item.active {
  border-color: #42b883;
  background-color: #e8f5e9;
  color: #2d8a5f;
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

.apply-all-btn {
  background-color: #673ab7; /* 紫色，代表批次處理 */
  color: #fff;
  border: none;
  padding: 0.4rem 0.8rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  margin-left: 10px; /* 與左邊按鈕拉開距離 */
  transition: background-color 0.2s;
}

.apply-all-btn:hover {
  background-color: #5e35b1;
}

.apply-all-btn:disabled {
  background-color: #b39ddb;
  cursor: not-allowed;
  opacity: 0.7;
}

.auto-sort-btn {
  background-color: #009688;
  color: #fff;
  border: none;
  padding: 0.4rem 0.8rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  margin-left: 10px;
  transition: background-color 0.2s;
}

.auto-sort-btn:hover {
  background-color: #00796b;
}

.auto-sort-btn:disabled {
  background-color: #80cbc4;
  cursor: not-allowed;
  opacity: 0.7;
}

.detect-answers-btn {
  background-color: #ff9800; /* 橙色，代表辨識功能 */
  color: #fff;
  border: none;
  padding: 0.4rem 0.8rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  margin-left: 10px;
  transition: background-color 0.2s;
}

.detect-answers-btn:hover {
  background-color: #f57c00;
}

.detect-answers-btn:disabled {
  background-color: #ffcc80;
  cursor: not-allowed;
  opacity: 0.7;
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

/* ----- Label Item 樣式 (單行整合版) ----- */

.label-item {
  position: relative; /* 為了讓絕對定位的叉叉按鈕參考 */
  display: block; /* 改為 block 方便內部 flex 排版 */
  /* [修改] 加大上下 padding，讓點擊區域更舒適 */
  padding: 1rem 0.75rem; 
  background-color: white;
  border-radius: 6px;
  margin-bottom: 0.75rem; /* [修改] 增加間距 */
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

/* [新增] 單行排版容器：名稱在左，輸入框在右 */
.label-content-row {
  display: flex;
  align-items: center;
  justify-content: space-between; /* 左右撐開 */
  margin-right: 32px; /* [修改] 右側預留空間給垂直置中的刪除按鈕 */
}

/* [修改] 標籤名稱：字體放大 */
.label-name {
  font-weight: bold;
  font-size: 1.2rem; /* [修改] 字體放大 */
  color: #42b883;
}

/* 選取時文字變紅 */
.label-name.text-red {
  color: #d32f2f;
}

/* [新增] 輸入框群組 (包含 "答:" 字樣) */
.label-input-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.label-expected {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: bold;
  color: #2c3e50;
}

.expected-value {
  width: 70px;
  padding: 4px 8px;
  border: 2px solid #ddd;
  border-radius: 6px;
  background-color: #fff7e6;
  color: #8a5a00;
  text-align: center;
  font-size: 1.2rem;
  font-weight: bold;
}

.input-prefix {
  font-size: 1rem;
  font-weight: bold;
  color: #2c3e50;
}

/* [修改] 輸入框樣式：字體放大、框加大 */
.label-input-group input {
  width: 70px; /* 寬度加寬 */
  padding: 4px 8px;
  border: 2px solid #ddd;
  border-radius: 6px;
  outline: none;
  font-size: 1.2rem; /* [修改] 輸入字體放大 */
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

/* [修改] 刪除按鈕：垂直置中 */
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

.auto-apply-option {
  display: flex;
  justify-content: center;
  margin-bottom: 1rem;
  padding: 0.75rem;
  background-color: #f9f9f9;
  border-radius: 6px;
  border: 1px solid #e0e0e0;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  user-select: none;
  color: #2c3e50;
  font-weight: 500;
}

.checkbox-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: #42b883;
}

.checkbox-label span {
  font-size: 0.95rem;
}

.checkbox-label:hover {
  color: #42b883;
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
