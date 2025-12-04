<template>
  <div class="results-container">
    <h1>Labeling Results</h1>
    
    <div v-if="images.length === 0" class="no-results">
      <p>No results to display. Please label images first.</p>
      <button @click="goToLabel" class="label-link-btn">Go to Label Page</button>
    </div>

    <div v-else class="results-content">
      <div class="summary">
        <h2>Summary</h2>
        <div class="stats">
          <div class="stat-item">
            <span class="stat-label">Total Images:</span>
            <span class="stat-value">{{ images.length }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Total Labels:</span>
            <span class="stat-value">{{ totalLabels }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Average Labels per Image:</span>
            <span class="stat-value">{{ averageLabels }}</span>
          </div>
        </div>

        <div class="class-distribution">
          <h3>Class Distribution</h3>
          <div class="chart">
            <div 
              v-for="(count, className) in classDistribution" 
              :key="className"
              class="chart-bar"
            >
              <div class="bar-label">{{ className }}</div>
              <div class="bar-wrapper">
                <div 
                  class="bar-fill" 
                  :style="{ width: (count / maxClassCount * 100) + '%' }"
                ></div>
                <span class="bar-count">{{ count }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="image-results">
        <h2>Labeled Images</h2>
        <div class="image-grid">
          <div 
            v-for="(img, index) in images" 
            :key="index"
            class="result-item"
            @click="viewDetails(index)"
          >
            <div class="result-image">
              <img :src="img.preview" :alt="img.name" />
              <div class="label-overlay">
                {{ img.labels?.length || 0 }} labels
              </div>
            </div>
            <div class="result-info">
              <h4>{{ img.name }}</h4>
              <div v-if="img.labels && img.labels.length > 0" class="label-tags">
                <span 
                  v-for="(label, labelIndex) in img.labels" 
                  :key="labelIndex"
                  class="label-tag"
                >
                  {{ label.class }}
                </span>
              </div>
              <p v-else class="no-labels-text">No labels</p>
            </div>
          </div>
        </div>
      </div>

      <div class="actions">
        <button @click="downloadResults" class="download-btn">
          📥 Download YOLO Format
        </button>
        <button @click="downloadJSON" class="download-btn">
          📄 Download JSON
        </button>
        <button @click="goToLabel" class="back-btn">
          ← Back to Labeling
        </button>
        <button @click="goToUpload" class="upload-btn">
          📁 Upload New Images
        </button>
      </div>
    </div>

    <!-- Details Modal -->
    <div v-if="selectedImage !== null && images[selectedImage]" class="modal" @click="closeModal">
      <div class="modal-content" @click.stop>
        <button class="modal-close" @click="closeModal">×</button>
        <h3>{{ images[selectedImage]!.name }}</h3>
        <img :src="images[selectedImage]!.preview" :alt="images[selectedImage]!.name" class="modal-image" />
        <div class="modal-labels">
          <h4>Labels ({{ images[selectedImage]!.labels?.length || 0 }}):</h4>
          <div v-if="images[selectedImage]!.labels && images[selectedImage]!.labels!.length > 0">
            <div 
              v-for="(label, index) in images[selectedImage]!.labels" 
              :key="index"
              class="modal-label-item"
            >
              <span class="modal-label-class">{{ label.class }}</span>
              <span class="modal-label-coords">
                Position: ({{ Math.round(label.x) }}, {{ Math.round(label.y) }}) | 
                Size: {{ Math.round(label.width) }}×{{ Math.round(label.height) }}px
              </span>
            </div>
          </div>
          <p v-else>No labels for this image</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { CANVAS_WIDTH, CANVAS_HEIGHT, CLASS_MAP } from '../constants'

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
const images = ref<ImageData[]>([])
const selectedImage = ref<number | null>(null)

onMounted(() => {
  // Try to get images from router state
  const state = history.state as { images?: ImageData[] }
  if (state?.images && state.images.length > 0) {
    images.value = state.images
  }
})

const totalLabels = computed(() => {
  return images.value.reduce((sum, img) => sum + (img.labels?.length || 0), 0)
})

const averageLabels = computed(() => {
  if (images.value.length === 0) return '0.0'
  return (totalLabels.value / images.value.length).toFixed(1)
})

const classDistribution = computed(() => {
  const distribution: Record<string, number> = {}
  images.value.forEach(img => {
    img.labels?.forEach(label => {
      distribution[label.class] = (distribution[label.class] || 0) + 1
    })
  })
  return distribution
})

const maxClassCount = computed(() => {
  const counts = Object.values(classDistribution.value)
  return counts.length > 0 ? Math.max(...counts) : 1
})

const viewDetails = (index: number) => {
  selectedImage.value = index
}

const closeModal = () => {
  selectedImage.value = null
}

const goToLabel = () => {
  router.push({ 
    name: 'label',
    state: { files: images.value }
  })
}

const goToUpload = () => {
  router.push({ name: 'upload' })
}

const downloadResults = () => {
  // Convert to YOLO format (normalized coordinates)
  let yoloContent = ''
  
  images.value.forEach(img => {
    const labels = img.labels || []
    const fileName = img.name.replace(/\.[^/.]+$/, '.txt')
    
    let fileContent = ''
    labels.forEach(label => {
      // For YOLO format: class_id center_x center_y width height (all normalized 0-1)
      // Using canvas dimensions for normalization
      const centerX = (label.x + label.width / 2) / CANVAS_WIDTH
      const centerY = (label.y + label.height / 2) / CANVAS_HEIGHT
      const normWidth = label.width / CANVAS_WIDTH
      const normHeight = label.height / CANVAS_HEIGHT
      
      const classId = CLASS_MAP[label.class] ?? CLASS_MAP['other']
      
      fileContent += `${classId} ${centerX.toFixed(6)} ${centerY.toFixed(6)} ${normWidth.toFixed(6)} ${normHeight.toFixed(6)}\n`
    })
    
    yoloContent += `\n=== ${fileName} ===\n${fileContent}`
  })
  
  // Create and download file
  const blob = new Blob([yoloContent], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'yolo_annotations.txt'
  a.click()
  URL.revokeObjectURL(url)
}

const downloadJSON = () => {
  const jsonData = images.value.map(img => ({
    image: img.name,
    labels: img.labels || [],
    label_count: img.labels?.length || 0
  }))
  
  const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'annotations.json'
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.results-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
}

h1 {
  text-align: center;
  color: #2c3e50;
  margin-bottom: 2rem;
}

.no-results {
  text-align: center;
  padding: 4rem;
}

.no-results p {
  font-size: 1.2rem;
  color: #666;
  margin-bottom: 1rem;
}

.label-link-btn {
  background-color: #42b883;
  color: white;
  border: none;
  padding: 0.75rem 2rem;
  font-size: 1rem;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.label-link-btn:hover {
  background-color: #35945d;
}

.results-content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.summary {
  background-color: #f5f5f5;
  border-radius: 8px;
  padding: 2rem;
}

.summary h2 {
  color: #2c3e50;
  margin-bottom: 1rem;
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.stat-item {
  background-color: white;
  padding: 1.5rem;
  border-radius: 8px;
  text-align: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.stat-label {
  display: block;
  font-size: 0.875rem;
  color: #666;
  margin-bottom: 0.5rem;
}

.stat-value {
  display: block;
  font-size: 2rem;
  font-weight: bold;
  color: #42b883;
}

.class-distribution h3 {
  color: #2c3e50;
  margin-bottom: 1rem;
}

.chart {
  background-color: white;
  padding: 1rem;
  border-radius: 8px;
}

.chart-bar {
  margin-bottom: 1rem;
}

.bar-label {
  font-size: 0.875rem;
  color: #666;
  margin-bottom: 0.25rem;
  text-transform: capitalize;
}

.bar-wrapper {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.bar-fill {
  height: 24px;
  background-color: #42b883;
  border-radius: 4px;
  transition: width 0.3s ease;
  min-width: 2px;
}

.bar-count {
  font-weight: bold;
  color: #2c3e50;
}

.image-results h2 {
  color: #2c3e50;
  margin-bottom: 1rem;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
}

.result-item {
  background-color: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: transform 0.3s, box-shadow 0.3s;
}

.result-item:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.result-image {
  position: relative;
  width: 100%;
  height: 200px;
}

.result-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.label-overlay {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  background-color: rgba(66, 184, 131, 0.9);
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: bold;
}

.result-info {
  padding: 1rem;
}

.result-info h4 {
  color: #2c3e50;
  margin-bottom: 0.5rem;
  font-size: 1rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.label-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.label-tag {
  background-color: #e8f5e9;
  color: #42b883;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: bold;
  text-transform: capitalize;
}

.no-labels-text {
  color: #999;
  font-style: italic;
  font-size: 0.875rem;
}

.actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
}

.download-btn,
.back-btn,
.upload-btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  transition: background-color 0.3s;
}

.download-btn {
  background-color: #2196f3;
  color: white;
}

.download-btn:hover {
  background-color: #1976d2;
}

.back-btn {
  background-color: #666;
  color: white;
}

.back-btn:hover {
  background-color: #555;
}

.upload-btn {
  background-color: #42b883;
  color: white;
}

.upload-btn:hover {
  background-color: #35945d;
}

/* Modal Styles */
.modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background-color: white;
  border-radius: 8px;
  padding: 2rem;
  max-width: 800px;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
}

.modal-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background-color: #ff5252;
  color: white;
  border: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  font-size: 1.5rem;
  cursor: pointer;
  line-height: 1;
  transition: background-color 0.3s;
}

.modal-close:hover {
  background-color: #d32f2f;
}

.modal-content h3 {
  color: #2c3e50;
  margin-bottom: 1rem;
}

.modal-image {
  width: 100%;
  max-height: 400px;
  object-fit: contain;
  border-radius: 4px;
  margin-bottom: 1rem;
}

.modal-labels h4 {
  color: #2c3e50;
  margin-bottom: 0.5rem;
}

.modal-label-item {
  background-color: #f5f5f5;
  padding: 0.75rem;
  border-radius: 4px;
  margin-bottom: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.modal-label-class {
  font-weight: bold;
  color: #42b883;
  text-transform: capitalize;
}

.modal-label-coords {
  font-size: 0.875rem;
  color: #666;
}
</style>
