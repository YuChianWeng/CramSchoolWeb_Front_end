<template>
  <div class="upload-container">
    <h1>Upload Images</h1>
    <div class="upload-area">
      <div 
        class="drop-zone" 
        @dragover.prevent="handleDragOver"
        @dragleave.prevent="handleDragLeave"
        @drop.prevent="handleDrop"
        :class="{ 'drag-over': isDragging }"
      >
        <div class="upload-icon">📁</div>
        <p>Drag and drop images here or click to select</p>
        <input
          type="file"
          ref="fileInput"
          @change="handleFileSelect"
          multiple
          accept="image/*"
          style="display: none"
        />
        <button @click="triggerFileInput" class="select-btn">Select Images</button>
      </div>
    </div>

    <div class="action-buttons top-actions">
      <button @click="clearAll" class="clear-btn">Clear All</button>
      <button
        @click="uploadFiles"
        class="upload-btn"
        :disabled="isUploading || isReading || selectedFiles.length === 0"
      >
        {{ isUploading ? 'Uploading...' : isReading ? 'Loading...' : 'Upload & Label' }}
      </button>
    </div>
    <p v-if="isUploading || isReading" class="loading-text">loading...</p>

    <div v-if="selectedFiles.length > 0" class="file-list">
      <h2>Selected Images ({{ selectedFiles.length }})</h2>
      <div class="file-grid">
        <div v-for="(file, index) in selectedFiles" :key="index" class="file-item">
          <img :src="file.preview" :alt="file.name" class="preview-image" />
          <p class="file-name">{{ file.name }}</p>
          <button @click="removeFile(index)" class="remove-btn">Remove</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { setLabelData } from '../stores/labelStore'

interface FileWithPreview {
  file: File
  name: string
  preview: string
}

const router = useRouter()
const fileInput = ref<HTMLInputElement | null>(null)
const selectedFiles = ref<FileWithPreview[]>([])
const isDragging = ref(false)
const isUploading = ref(false)
const LABEL_STORAGE_KEY = 'label-page-data'
const pendingReads = ref(0)
const isReading = computed(() => pendingReads.value > 0)

const persistSelection = () => {
  const filesData = selectedFiles.value.map(f => ({
    name: f.name,
    preview: f.preview,
    labels: []
  }))
  setLabelData(filesData)
  try {
    if (filesData.length === 0) {
      sessionStorage.removeItem(LABEL_STORAGE_KEY)
      return
    }
    sessionStorage.setItem(LABEL_STORAGE_KEY, JSON.stringify(filesData))
  } catch (err) {
    console.warn('Unable to persist selection', err)
  }
}

watch(
  selectedFiles,
  () => {
    persistSelection()
  },
  { deep: true }
)

const waitForReads = () =>
  new Promise<void>((resolve) => {
    if (pendingReads.value === 0) {
      resolve()
      return
    }
    const stop = watch(pendingReads, (value) => {
      if (value === 0) {
        stop()
        resolve()
      }
    })
  })

const triggerFileInput = () => {
  fileInput.value?.click()
}

const handleDragOver = () => {
  isDragging.value = true
}

const handleDragLeave = () => {
  isDragging.value = false
}

const handleDrop = (event: DragEvent) => {
  isDragging.value = false
  const files = event.dataTransfer?.files
  if (files) {
    addFiles(Array.from(files))
  }
}

const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  const files = target.files
  if (files) {
    addFiles(Array.from(files))
  }
}

const addFiles = (files: File[]) => {
  files.forEach(file => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      pendingReads.value += 1
      reader.onload = (e) => {
        selectedFiles.value.push({
          file,
          name: file.name,
          preview: e.target?.result as string
        })
      }
      reader.onerror = () => {
        console.warn(`Unable to read file: ${file.name}`)
      }
      reader.onloadend = () => {
        pendingReads.value = Math.max(0, pendingReads.value - 1)
      }
      reader.readAsDataURL(file)
    }
  })
}

const removeFile = (index: number) => {
  selectedFiles.value.splice(index, 1)
}

const clearAll = () => {
  selectedFiles.value = []
}

const uploadFiles = async () => {
  if (isUploading.value) return
  if (pendingReads.value > 0) {
    await waitForReads()
  }
  if (selectedFiles.value.length === 0) return
  persistSelection()

  isUploading.value = true
  // TODO: Replace with actual upload logic in production
  // This is a simulated upload for demonstration purposes
  setTimeout(() => {
    isUploading.value = false
    // Navigate to label page with uploaded files (without File objects, just metadata)
    const filesData = selectedFiles.value.map(f => ({
      name: f.name,
      preview: f.preview,
      labels: []
    }))
    router.push({ 
      name: 'label',
      state: { files: filesData }
    })
  }, 1000)
}
</script>

<style scoped>
.upload-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1rem 2rem 2rem 2rem;
}

h1 {
  text-align: center;
  color: #2c3e50;
  margin-bottom: 1rem;
}

.upload-area {
  margin-bottom: 2rem;
}

.drop-zone {
  border: 3px dashed #ccc;
  border-radius: 8px;
  padding: 3rem;
  text-align: center;
  background-color: #f9f9f9;
  transition: all 0.3s ease;
  cursor: pointer;
}

.drop-zone.drag-over {
  border-color: #42b883;
  background-color: #e8f5e9;
}

.upload-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.drop-zone p {
  color: #666;
  margin-bottom: 1rem;
}

.select-btn {
  background-color: #42b883;
  color: white;
  border: none;
  padding: 0.75rem 2rem;
  font-size: 1rem;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.select-btn:hover {
  background-color: #35945d;
}

.file-list {
  margin-top: 2rem;
}

.file-list h2 {
  color: #2c3e50;
  margin-bottom: 1rem;
}

.file-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.file-item {
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 1rem;
  text-align: center;
  background-color: white;
}

.preview-image {
  width: 100%;
  height: 150px;
  object-fit: cover;
  border-radius: 4px;
  margin-bottom: 0.5rem;
}

.file-name {
  font-size: 0.875rem;
  color: #666;
  margin: 0.5rem 0;
  word-break: break-all;
}

.remove-btn {
  background-color: #ff5252;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.remove-btn:hover {
  background-color: #d32f2f;
}

.action-buttons {
  display: flex;
  gap: 1rem;
  justify-content: center;
}

.top-actions {
  margin-top: 1.25rem;
  margin-bottom: 1rem;
}

.loading-text {
  margin: 0 0 1rem;
  text-align: center;
  color: #9aa3ad;
  font-size: 0.9rem;
}

.clear-btn,
.upload-btn {
  padding: 0.75rem 2rem;
  font-size: 1rem;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  transition: background-color 0.3s;
}

.clear-btn {
  background-color: #666;
  color: white;
}

.clear-btn:hover {
  background-color: #555;
}

.upload-btn {
  background-color: #42b883;
  color: white;
}

.upload-btn:hover:not(:disabled) {
  background-color: #35945d;
}

.upload-btn:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}
</style>
