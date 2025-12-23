<template>
  <div class="results-page">
    <div class="page-header">
      <div>
        <p class="eyebrow">批改結果</p>
        <h1>每張照片的正確率</h1>
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
      <div class="summary-grid">
        <div class="summary-card highlight">
          <p class="label">總正確 / 總標籤</p>
          <div class="value">{{ overallCorrect }} / {{ overallTotal }}</div>
          <p class="hint">涵蓋 {{ scoredImages.length }} 張照片</p>
        </div>
        <div class="summary-card">
          <p class="label">平均正確率</p>
          <div class="value">{{ averageAccuracy }}%</div>
          <p class="hint">只計算已批改的照片</p>
        </div>
        <div class="summary-card">
          <p class="label">批改完成 / 全部</p>
          <div class="value">{{ gradedCount }} / {{ scoredImages.length }}</div>
          <p class="hint">未批改的照片顯示為「待批改」</p>
        </div>
        <div class="summary-card">
          <p class="label">最高 / 最低正確率</p>
          <div class="value">{{ maxAccuracy }}% / {{ minAccuracy }}%</div>
          <p class="hint">以每張照片計算</p>
        </div>
      </div>

      <section class="image-section">
        <div class="section-header">
          <div>
            <h2>照片批改列表</h2>
            <p class="subtext">檢視每張照片的正確數量與錯誤標籤。</p>
          </div>
        </div>

        <div class="image-grid">
          <article v-for="img in scoredImages" :key="img.name" class="image-card">
            <div class="thumb">
              <img :src="img.preview || placeholderImage" :alt="img.name" />
              <span class="badge" :class="img.graded ? 'badge-graded' : 'badge-pending'">
                {{ img.graded ? '已批改' : '待批改' }}
              </span>
            </div>
            <div class="card-body">
              <div class="card-title">
                <h3>{{ img.name }}</h3>
                <span class="ratio">{{ img.correctCount }} / {{ img.totalLabels }}</span>
              </div>

              <div class="progress">
                <div class="progress-bar" :style="{ width: (img.graded ? img.accuracy : 0) + '%' }"></div>
                <span class="progress-text">{{ img.graded ? img.accuracy + '%' : '尚未批改' }}</span>
              </div>

              <div class="card-meta">
                <span>正確 <strong>{{ img.correctCount }}</strong></span>
                <span>錯誤 <strong>{{ img.incorrectCount }}</strong></span>
                <span>標籤總數 <strong>{{ img.totalLabels }}</strong></span>
              </div>

              <div v-if="img.labels.length" class="label-table">
                <div class="label-row header">
                  <span>#</span>
                  <span>預測答案</span>
                  <span>正確答案</span>
                  <span>結果</span>
                </div>
                <div v-for="(label, idx) in img.labels" :key="idx" class="label-row">
                  <span class="muted">#{{ idx + 1 }}</span>
                  <span>{{ label.recognizedAnswer || '—' }}</span>
                  <span>{{ label.expectedAnswer || '—' }}</span>
                  <span>
                    <span
                      class="chip"
                      :class="label.isCorrect === true ? 'chip-correct' : label.isCorrect === false ? 'chip-wrong' : 'chip-pending'"
                    >
                      {{ label.isCorrect === undefined ? '未判定' : label.isCorrect ? '✔ 正確' : '✖ 錯誤' }}
                    </span>
                  </span>
                </div>
              </div>
              <p v-else class="muted">此照片目前沒有標籤。</p>
            </div>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

interface LabelResult {
  recognizedAnswer?: string
  expectedAnswer?: string
  isCorrect?: boolean
}

interface IncomingImage {
  name: string
  preview?: string
  labels?: LabelResult[]
  correctCount?: number
  totalLabels?: number
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
const placeholderImage =
  'data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"320\" height=\"200\" viewBox=\"0 0 320 200\" fill=\"none\"><rect width=\"320\" height=\"200\" rx=\"12\" fill=\"%23e8f5e9\"/><text x=\"50%\" y=\"50%\" dominant-baseline=\"middle\" text-anchor=\"middle\" font-family=\"Arial\" font-size=\"16\" fill=\"%23666\">預覽圖片</text></svg>'

const normalizeImage = (img: IncomingImage): NormalizedImage => {
  const labels = img.labels ?? []
  const gradedLabels = labels.filter(label => typeof label.isCorrect === 'boolean')
  const providedCorrect = typeof img.correctCount === 'number' ? img.correctCount : null
  const totalLabels = typeof img.totalLabels === 'number' ? img.totalLabels : labels.length
  const derivedCorrect = gradedLabels.filter(label => label.isCorrect).length
  const correctCount = providedCorrect ?? derivedCorrect
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

const loadResultsFromState = () => {
  const state = history.state as { results?: IncomingImage[]; images?: IncomingImage[] }
  const payload = state?.results || state?.images

  if (payload && payload.length > 0) {
    scoredImages.value = payload.map(normalizeImage)
    return
  }

  scoredImages.value = createSampleResults()
}

const createSampleResults = (): NormalizedImage[] => {
  const samples: IncomingImage[] = [
    {
      name: 'exam-01.jpg',
      correctCount: 14,
      totalLabels: 20,
      labels: [
        { recognizedAnswer: 'A', expectedAnswer: 'A', isCorrect: true },
        { recognizedAnswer: 'B', expectedAnswer: 'C', isCorrect: false },
        { recognizedAnswer: 'D', expectedAnswer: 'D', isCorrect: true },
        { recognizedAnswer: '未辨識', expectedAnswer: 'B', isCorrect: false }
      ]
    },
    {
      name: 'exam-02.jpg',
      correctCount: 18,
      totalLabels: 20,
      labels: [
        { recognizedAnswer: 'C', expectedAnswer: 'C', isCorrect: true },
        { recognizedAnswer: 'B', expectedAnswer: 'B', isCorrect: true },
        { recognizedAnswer: 'A', expectedAnswer: 'D', isCorrect: false }
      ]
    },
    {
      name: 'exam-03.jpg',
      correctCount: 12,
      totalLabels: 22,
      labels: [
        { recognizedAnswer: 'D', expectedAnswer: 'D', isCorrect: true },
        { recognizedAnswer: 'B', expectedAnswer: 'B', isCorrect: true },
        { recognizedAnswer: 'A', expectedAnswer: 'B', isCorrect: false }
      ]
    }
  ]

  return samples.map(normalizeImage)
}

onMounted(() => {
  loadResultsFromState()
})

const overallCorrect = computed(() =>
  scoredImages.value.reduce((sum, img) => sum + (img.correctCount || 0), 0)
)
const overallTotal = computed(() =>
  scoredImages.value.reduce((sum, img) => sum + (img.totalLabels || 0), 0)
)

const gradedAccuracies = computed(() =>
  scoredImages.value
    .filter(img => img.graded && img.totalLabels > 0)
    .map(img => img.accuracy)
)

const averageAccuracy = computed(() => {
  if (gradedAccuracies.value.length === 0) return '0.0'
  const total = gradedAccuracies.value.reduce((sum, acc) => sum + acc, 0)
  return (total / gradedAccuracies.value.length).toFixed(1)
})

const maxAccuracy = computed(() =>
  gradedAccuracies.value.length ? Math.max(...gradedAccuracies.value) : 0
)
const minAccuracy = computed(() =>
  gradedAccuracies.value.length ? Math.min(...gradedAccuracies.value) : 0
)
const gradedCount = computed(() => scoredImages.value.filter(img => img.graded).length)

const goToLabel = () => {
  router.push({
    name: 'label',
    state: { files: scoredImages.value }
  })
}

const goToUpload = () => {
  router.push({ name: 'upload' })
}
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

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
}

.summary-card {
  background: white;
  border: 1px solid #e4e9ed;
  border-radius: 12px;
  padding: 1.25rem;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.04);
}

.summary-card.highlight {
  background: linear-gradient(135deg, #e8f5e9 0%, #f6fffb 100%);
  border-color: #c0e8cf;
}

.summary-card .label {
  margin: 0;
  color: #5f6b7a;
  font-weight: 600;
  font-size: 0.9rem;
}

.summary-card .value {
  font-size: 1.8rem;
  font-weight: 700;
  margin: 0.35rem 0;
  color: #1f2d3d;
}

.summary-card .hint {
  margin: 0;
  color: #7a8795;
  font-size: 0.9rem;
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
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1rem;
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
  height: 180px;
  overflow: hidden;
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.badge {
  position: absolute;
  top: 12px;
  left: 12px;
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

.ratio {
  background: #eef4f8;
  color: #1f2d3d;
  padding: 0.35rem 0.65rem;
  border-radius: 6px;
  font-weight: 700;
  font-size: 0.9rem;
}

.progress {
  position: relative;
  height: 12px;
  background: #f0f4f7;
  border-radius: 999px;
  overflow: hidden;
}

.progress-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 0;
  background: linear-gradient(90deg, #42b883, #2f9b6f);
  transition: width 0.3s ease;
}

.progress-text {
  margin-top: 0.15rem;
  font-size: 0.85rem;
  color: #5f6b7a;
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

.label-table {
  border: 1px solid #e4e9ed;
  border-radius: 10px;
  overflow: hidden;
}

.label-row {
  display: grid;
  grid-template-columns: 60px 1fr 1fr 110px;
  gap: 0.5rem;
  padding: 0.6rem 0.75rem;
  align-items: center;
}

.label-row.header {
  background: #f5f8fb;
  font-weight: 700;
  color: #1f2d3d;
}

.label-row:not(.header) {
  border-top: 1px solid #e4e9ed;
  font-size: 0.95rem;
}

.chip {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 999px;
  font-weight: 700;
  font-size: 0.85rem;
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

.muted {
  color: #7a8795;
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
  }

  .header-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .label-row {
    grid-template-columns: 50px 1fr 1fr 100px;
  }
}
</style>
