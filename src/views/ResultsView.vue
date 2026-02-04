<template>
  <div class="results-page">
    <div class="page-header">
      <div>
        <p class="eyebrow">Result</p>
        <h1>每張的對比情形</h1>
        <p class="subtext">顯示 YOLO 標籤配對正確答案的數量，並快速回顧 OCR 辨識結果。</p>
      </div>
      <div class="header-actions">
        <button class="ghost-btn" @click="goToUpload">重新上傳</button>
        <button class="primary-btn" @click="goToLabel">返回標記</button>
      </div>
    </div>

    <div v-if="scoredImages.length === 0" class="empty-state">
      <p>目前沒有批改結果，請先完成標記與批改。</p>
      <div class="empty-actions">
        <button class="primary-btn" @click="goToUpload">上傳照片</button>
        <button class="ghost-btn" @click="goToLabel">回到標記頁</button>
      </div>
    </div>

    <div v-else class="results-body">
      <div v-if="showMasterWarning" class="warning-banner">
        <strong>提醒：</strong>
        尚未取得標準答案卷的 OCR 結果，請回到標記頁同步標準卷的框位與 OCR，再重新查看結果。
      </div>
      <section class="image-section">
        <div class="section-header">
          <div>
            <h2>Preview</h2>
            <p class="subtext">「正確標籤數 / 標籤總數」。</p>
          </div>
        </div>

        <div class="image-grid">
          <article
            v-for="(img, idx) in scoredImages"
            :key="img.name"
            class="image-card"
            role="button"
            tabindex="0"
            @click="openModal(idx)"
          >
            <div class="thumb">
              <img :src="img.preview || placeholderImage" :alt="img.name" />
              <div class="overlay">
                <span class="fraction">{{ img.correctCount }}/{{ img.totalLabels }}</span>
                <span class="badge" :class="img.graded ? 'badge-graded' : 'badge-pending'">
                  {{ img.graded ? '已批改' : '待批改' }}
                </span>
              </div>
              <div class="box-layer" v-if="img.labels.length">
                <div
                  v-for="(label, idx) in img.labels"
                  :key="idx"
                  class="bbox"
                  :class="label.isCorrect === true ? 'bbox-correct' : label.isCorrect === false ? 'bbox-wrong' : 'bbox-pending'"
                  :style="boxStyle(label)"
                ></div>
              </div>
            </div>
            <div class="card-body">
              <div class="card-title">
                <h3>{{ img.name }}</h3>
                <div class="title-metrics">
                  <span class="fraction inline">{{ img.correctCount }}/{{ img.totalLabels }}</span>
                  <span class="accuracy">{{ img.graded ? img.accuracy + '%' : '尚未批改' }}</span>
                </div>
              </div>
              <div v-if="img.labels.length" class="answers">
                <div
                  v-for="(label, idx) in img.labels"
                  :key="idx"
                  class="answer-row"
                >
                  <span class="answer-index">#{{ idx + 1 }}</span>
                  <span class="answer-text">OCR：{{ label.recognizedAnswer || '—' }}</span>
                  <span class="answer-text">正解：{{ label.expectedAnswer || label.answer || '—' }}</span>
                  <span class="answer-chip" :class="label.isCorrect ? 'chip-correct' : label.isCorrect === false ? 'chip-wrong' : 'chip-pending'">
                    {{ label.isCorrect === undefined ? '未判定' : label.isCorrect ? '正確' : '錯誤' }}
                  </span>
                </div>
              </div>
              <div class="card-meta">
                
                <span>正確 <strong>{{ img.correctCount }}</strong></span>
                <span>錯誤 <strong>{{ img.incorrectCount }}</strong></span>
                <span>標籤總數 <strong>{{ img.totalLabels }}</strong></span>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>
  </div>

  <div v-if="selectedImage" class="modal" @click="closeModal">
    <div class="modal-content" @click.stop>
      <button class="modal-close" @click="closeModal">×</button>
      <h3>{{ selectedImage.name }}</h3>
      <div class="modal-image-wrap">
        <img :src="selectedImage.preview || placeholderImage" :alt="selectedImage.name" />
        <div class="box-layer" v-if="selectedImage.labels.length">
          <div
            v-for="(label, idx) in selectedImage.labels"
            :key="idx"
            class="bbox"
            :class="label.isCorrect === true ? 'bbox-correct' : label.isCorrect === false ? 'bbox-wrong' : 'bbox-pending'"
            :style="boxStyle(label)"
          >
            <span class="bbox-tag">#{{ idx + 1 }} {{ label.recognizedAnswer || '—' }}</span>
          </div>
        </div>
      </div>

      <div v-if="selectedImage.labels.length" class="answers modal-answers">
        <div
          v-for="(label, idx) in selectedImage.labels"
          :key="idx"
          class="answer-row"
        >
          <span class="answer-index">#{{ idx + 1 }}</span>
          <span class="answer-text">OCR：{{ label.recognizedAnswer || '—' }}</span>
          <span class="answer-text">正解：{{ label.expectedAnswer || label.answer || '—' }}</span>
          <span class="answer-chip" :class="label.isCorrect ? 'chip-correct' : label.isCorrect === false ? 'chip-wrong' : 'chip-pending'">
            {{ label.isCorrect === undefined ? '未判定' : label.isCorrect ? '正確' : '錯誤' }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getResultsData } from '../stores/resultsStore'

interface LabelResult {
  recognizedAnswer?: string
  expectedAnswer?: string
  answer?: string
  isCorrect?: boolean
  x?: number
  y?: number
  width?: number
  height?: number
  ocrCandidates?: {
    chinese: string
    digit: string
  }
}

interface IncomingImage {
  name: string
  preview?: string
  labels?: LabelResult[]
  correctCount?: number
  totalLabels?: number
}

interface ResultsPayload {
  masterKey?: IncomingImage | null
  students?: IncomingImage[]
}

interface NormalizedImage extends IncomingImage {
  preview: string
  labels: LabelResult[]
  correctCount: number
  totalLabels: number
  incorrectCount: number
  accuracy: number
  graded: boolean
}

const router = useRouter()
const scoredImages = ref<NormalizedImage[]>([])
const masterKeyImage = ref<IncomingImage | null>(null)
const selectedIndex = ref<number | null>(null)
const placeholderImage =
  'data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"320\" height=\"200\" viewBox=\"0 0 320 200\" fill=\"none\"><rect width=\"320\" height=\"200\" rx=\"12\" fill=\"%23e8f5e9\"/><text x=\"50%\" y=\"50%\" dominant-baseline=\"middle\" text-anchor=\"middle\" font-family=\"Arial\" font-size=\"16\" fill=\"%23666\">預覽圖片</text></svg>'
const BASE_CANVAS_WIDTH = 800
const BASE_CANVAS_HEIGHT = 600

const extractTextValue = (value: any, seen = new Set<any>()): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
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

const normalizeAnswer = (value?: any) => extractTextValue(value).trim()

const extractOcrResultsArray = (payload: any) => {
  const results =
    payload?.ocr_results ??
    payload?.ocrResults ??
    payload?.results ??
    payload?.data?.ocr_results ??
    payload?.body?.json?.ocr_results

  if (!Array.isArray(results)) return null
  return results.map((value) => normalizeAnswer(value))
}

const mergeOcrResultsWithImages = (
  images: IncomingImage[],
  ocrPayload: any,
  imageName?: string
) => {
  const ocrResults = extractOcrResultsArray(ocrPayload)
  if (!ocrResults) return images

  let targetIndex = imageName
    ? images.findIndex((img) => img.name === imageName)
    : images.length === 1
      ? 0
      : -1

  if (targetIndex === -1 && images.length > 0) {
    targetIndex = 0
  }

  return images.map((img, index) => {
    if (index !== targetIndex) return img
    const labels = (img.labels ?? []).map((label, labelIndex) => ({
      ...label,
      recognizedAnswer: normalizeAnswer(ocrResults[labelIndex] ?? label.recognizedAnswer)
    }))
    return { ...img, labels }
  })
}

const normalizeImage = (
  img: IncomingImage,
  expectedAnswers: string[] = []
): NormalizedImage => {
  const labels = (img.labels ?? []).map((label, index) => {
    const normalizedAnswer = normalizeAnswer(label.answer)
    const expectedFromMaster = expectedAnswers[index] || ''
    const expectedAnswer =
      expectedFromMaster || normalizeAnswer(label.expectedAnswer) || normalizedAnswer

    // 智能選擇 OCR 結果：根據正解是數字還是中文
    let normalizedRecognized = normalizeAnswer(label.recognizedAnswer)
    if (label.ocrCandidates && expectedAnswer) {
      const isExpectedDigit = /^\d+$/.test(expectedAnswer.trim())
      normalizedRecognized = isExpectedDigit
        ? (label.ocrCandidates.digit || '').trim()
        : (label.ocrCandidates.chinese || '').trim()
    }

    let isCorrect = label.isCorrect
    if (typeof isCorrect !== 'boolean' && expectedAnswer && normalizedRecognized) {
      isCorrect = normalizedRecognized === normalizeAnswer(expectedAnswer)
    }
    return {
      ...label,
      recognizedAnswer: normalizedRecognized,
      answer: normalizedAnswer,
      expectedAnswer,
      isCorrect
    }
  })
  const gradedLabels = labels.filter(label => typeof label.isCorrect === 'boolean')
  const providedCorrect = typeof img.correctCount === 'number' ? img.correctCount : null
  const totalLabels = typeof img.totalLabels === 'number' ? img.totalLabels : labels.length
  const derivedCorrect = gradedLabels.filter(label => label.isCorrect).length
  const correctCount = gradedLabels.length > 0 ? derivedCorrect : providedCorrect ?? derivedCorrect
  const boundedCorrect = Math.min(Math.max(correctCount, 0), totalLabels || Number.MAX_SAFE_INTEGER)
  const graded = providedCorrect !== null || gradedLabels.length > 0
  const accuracy = totalLabels > 0 ? Math.round((boundedCorrect / totalLabels) * 100) : 0
  const incorrectCount = Math.max(totalLabels - boundedCorrect, 0)

  return {
    ...img,
    preview: img.preview || '',
    labels,
    correctCount: boundedCorrect,
    totalLabels,
    incorrectCount,
    accuracy,
    graded
  }
}

const STORAGE_KEY = 'results-page-data'

const extractPayload = (payload: any): ResultsPayload => {
  if (Array.isArray(payload)) {
    return { students: payload }
  }
  if (payload && (payload.students || payload.masterKey)) {
    return {
      students: payload.students ?? [],
      masterKey: payload.masterKey ?? null
    }
  }
  return { students: [] }
}

const getExpectedAnswers = (master: IncomingImage | null): string[] =>
  (master?.labels ?? []).map((label) =>
    normalizeAnswer(label.expectedAnswer ?? label.answer)
  )

const loadResultsFromState = () => {
  const cachedInMemory = getResultsData()
  if (cachedInMemory) {
    const { masterKey, students } = extractPayload(cachedInMemory)
    if ((students && students.length > 0) || masterKey) {
      masterKeyImage.value = masterKey ?? null
      const expectedAnswers = getExpectedAnswers(masterKeyImage.value)
      scoredImages.value = (students ?? []).map((img) =>
        normalizeImage(img, [...expectedAnswers])
      )
      return
    }
  }
  const state = history.state as {
    results?: IncomingImage[] | ResultsPayload
    images?: IncomingImage[] | ResultsPayload
    allImages?: IncomingImage[] | ResultsPayload
    ocrResults?: any
    imageName?: string
    state?: {
      results?: IncomingImage[] | ResultsPayload
      images?: IncomingImage[] | ResultsPayload
      allImages?: IncomingImage[] | ResultsPayload
      ocrResults?: any
      imageName?: string
    }
  }

  const nestedState = state?.state
  const ocrPayload = state?.ocrResults || nestedState?.ocrResults
  const ocrImages =
    state?.allImages || state?.images || nestedState?.allImages || nestedState?.images
  const ocrImageName = state?.imageName || nestedState?.imageName

  if (ocrPayload && ocrImages) {
    const { students, masterKey } = extractPayload(ocrImages)
    if (students && students.length > 0) {
      const merged = mergeOcrResultsWithImages(students, ocrPayload, ocrImageName)
      masterKeyImage.value = masterKey ?? null
      const expectedAnswers = getExpectedAnswers(masterKeyImage.value)
      scoredImages.value = merged.map((img) => normalizeImage(img, [...expectedAnswers]))
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ students: merged, masterKey: masterKeyImage.value })
      )
      return
    }
  }

  const payload = state?.results || state?.images || nestedState?.results || nestedState?.images

  if (payload) {
    const { masterKey, students } = extractPayload(payload)
    if ((students && students.length > 0) || masterKey) {
      masterKeyImage.value = masterKey ?? null
      const expectedAnswers = getExpectedAnswers(masterKeyImage.value)
      scoredImages.value = (students ?? []).map((img) =>
        normalizeImage(img, [...expectedAnswers])
      )
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ students: students ?? [], masterKey: masterKeyImage.value })
      )
      return
    }
  }

  const cached = sessionStorage.getItem(STORAGE_KEY)
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as ResultsPayload | IncomingImage[]
      const { masterKey, students } = extractPayload(parsed)
      masterKeyImage.value = masterKey ?? null
      const expectedAnswers = getExpectedAnswers(masterKeyImage.value)
      scoredImages.value = (students ?? []).map((img) =>
        normalizeImage(img, [...expectedAnswers])
      )
      return
    } catch (err) {
      console.warn('Unable to parse cached results', err)
    }
  }

  scoredImages.value = []
}

onMounted(() => {
  loadResultsFromState()
})

const goToLabel = () => {
  router.push({
    name: 'label',
    state: { files: scoredImages.value, masterKey: masterKeyImage.value }
  })
}

const goToUpload = () => {
  router.push({ name: 'upload' })
}

const boxStyle = (label: LabelResult) => {
  const x = label.x ?? 0
  const y = label.y ?? 0
  const w = label.width ?? 0
  const h = label.height ?? 0
  const left = (x / BASE_CANVAS_WIDTH) * 100
  const top = (y / BASE_CANVAS_HEIGHT) * 100
  const width = (w / BASE_CANVAS_WIDTH) * 100
  const height = (h / BASE_CANVAS_HEIGHT) * 100

  return {
    left: `${left}%`,
    top: `${top}%`,
    width: `${width}%`,
    height: `${height}%`
  }
}

const openModal = (idx: number) => {
  selectedIndex.value = idx
}

const closeModal = () => {
  selectedIndex.value = null
}

const selectedImage = computed(() =>
  selectedIndex.value !== null ? scoredImages.value[selectedIndex.value] : null
)

const showMasterWarning = computed(() => {
  if (!masterKeyImage.value) return true
  const expectedAnswers = getExpectedAnswers(masterKeyImage.value)
  return expectedAnswers.length === 0 || expectedAnswers.every((value) => !value)
})
</script>

<style scoped>
.results-page {
  max-width: 1280px;
  margin: 0 auto;
  padding: 2rem;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.eyebrow {
  margin: 0;
  color: #42b883;
  font-weight: 700;
  letter-spacing: 0.08em;
  font-size: 0.85rem;
}

h1 {
  margin: 0.25rem 0;
  color: #1f2d3d;
  font-size: 1.75rem;
}

.subtext {
  margin: 0;
  color: #5f6b7a;
}

.header-actions {
  display: flex;
  gap: 0.75rem;
}

.primary-btn,
.ghost-btn {
  border-radius: 8px;
  padding: 0.65rem 1.25rem;
  font-size: 0.95rem;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s ease;
}

.primary-btn {
  background: linear-gradient(135deg, #42b883, #2f9b6f);
  color: white;
  border-color: #2f9b6f;
}

.primary-btn:hover {
  filter: brightness(0.95);
}

.ghost-btn {
  background: white;
  color: #1f2d3d;
  border-color: #d7dee5;
}

.ghost-btn:hover {
  background: #eef4f8;
}

.empty-state {
  background: white;
  border: 1px dashed #d7dee5;
  border-radius: 12px;
  padding: 2rem;
  text-align: center;
  color: #5f6b7a;
}

.empty-actions {
  margin-top: 1rem;
  display: flex;
  gap: 0.75rem;
  justify-content: center;
}

.results-body {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.warning-banner {
  border: 1px solid #ffcc80;
  background: #fff7e6;
  color: #8a5a00;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  font-size: 0.95rem;
}

.image-section {
  background: white;
  border: 1px solid #e4e9ed;
  border-radius: 12px;
  padding: 1.25rem;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.04);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.section-header h2 {
  margin: 0;
  color: #1f2d3d;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 0.75rem;
}

.image-card {
  border: 1px solid #e4e9ed;
  border-radius: 12px;
  overflow: hidden;
  background: #fdfefe;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
}

.thumb {
  position: relative;
  background: #eef4f8;
  aspect-ratio: 4 / 3;
  overflow: hidden;
}

.thumb img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
}

.overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  padding: 12px;
  pointer-events: none;
}

.box-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.bbox {
  position: absolute;
  border: 2px solid rgba(0, 0, 0, 0.4);
  box-sizing: border-box;
}

.bbox-correct {
  border-color: #2f9b6f;
}

.bbox-wrong {
  border-color: #d93025;
}

.bbox-pending {
  border-color: #ff9800;
}

.fraction {
  background: rgba(31, 45, 61, 0.8);
  color: white;
  padding: 0.3rem 0.6rem;
  border-radius: 6px;
  font-weight: 700;
}

.fraction.inline {
  background: #eef4f8;
  color: #1f2d3d;
}

.badge {
  padding: 0.35rem 0.65rem;
  border-radius: 6px;
  font-weight: 700;
  font-size: 0.8rem;
  color: white;
}

.badge-graded {
  background: #42b883;
}

.badge-pending {
  background: #ff9800;
}

.card-body {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.card-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.card-title h3 {
  margin: 0;
  font-size: 1.05rem;
  color: #1f2d3d;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.accuracy {
  background: #eef4f8;
  color: #1f2d3d;
  padding: 0.3rem 0.6rem;
  border-radius: 6px;
  font-weight: 700;
  font-size: 0.9rem;
}

.title-metrics {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.card-meta {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  color: #5f6b7a;
  font-size: 0.9rem;
}

.card-meta strong {
  color: #1f2d3d;
}

.answers {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.answer-row {
  display: grid;
  grid-template-columns: 70px 1fr 1fr 90px;
  gap: 0.5rem;
  align-items: center;
  font-size: 0.9rem;
}

.answer-index {
  font-weight: 700;
  color: #1f2d3d;
}

.answer-text {
  color: #4a5563;
}

.answer-chip {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 999px;
  font-weight: 700;
  text-align: center;
}

.chip-correct {
  background: #e8f5e9;
  color: #2f9b6f;
}

.chip-wrong {
  background: #fdecea;
  color: #d93025;
}

.chip-pending {
  background: #fff7e6;
  color: #c47c00;
}

.modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-content {
  background: white;
  border-radius: 12px;
  padding: 1.25rem;
  max-width: 1100px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.2);
}

.modal-close {
  position: absolute;
  top: 10px;
  right: 10px;
  border: none;
  background: #ff5252;
  color: white;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  font-size: 1.2rem;
  cursor: pointer;
}

.modal-image-wrap {
  position: relative;
  background: #f8fafc;
  border: 1px solid #e4e9ed;
  border-radius: 8px;
  overflow: hidden;
  width: 100%;
  max-width: 800px;
  aspect-ratio: 4 / 3;
  margin: 0 auto;
}

.modal-image-wrap img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
}

.bbox-tag {
  position: absolute;
  top: 0;
  left: 0;
  background: rgba(31, 45, 61, 0.8);
  color: white;
  padding: 0.2rem 0.4rem;
  font-size: 0.8rem;
  border-bottom-right-radius: 6px;
}

.modal-answers {
  margin-top: 1rem;
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
  }

  .header-actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
