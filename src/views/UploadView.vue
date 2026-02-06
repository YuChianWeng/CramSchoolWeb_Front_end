<template>
  <div class="upload-container">
    <h1>上傳圖片</h1>
    <div class="upload-area">
      <div class="upload-section">
        <h2>標準答案卷（Master Key）</h2>
        <div
          class="drop-zone"
          @dragover.prevent="handleDragOver('master')"
          @dragleave.prevent="handleDragLeave('master')"
          @drop.prevent="handleDrop('master', $event)"
          :class="{ 'drag-over': isDraggingMaster }"
        >
          <div class="upload-icon">📁</div>
          <p>拖曳或點擊上傳 1 張標準答案卷</p>
          <input
            type="file"
            ref="masterInput"
            @change="handleFileSelect('master', $event)"
            accept="image/*"
            style="display: none"
          />
          <button @click="triggerFileInput('master')" class="select-btn">選擇標準答案卷</button>
        </div>
        <div v-if="masterFile" class="file-list">
          <div class="file-grid">
            <div class="file-item">
              <img :src="masterFile.preview" :alt="masterFile.name" class="preview-image" />
              <p class="file-name">{{ masterFile.name }}</p>
              <button @click="clearMaster" class="remove-btn">移除</button>
            </div>
          </div>
        </div>
      </div>

      <div class="upload-section">
        <h2>學生考卷</h2>
        <div
          class="drop-zone"
          @dragover.prevent="handleDragOver('students')"
          @dragleave.prevent="handleDragLeave('students')"
          @drop.prevent="handleDrop('students', $event)"
          :class="{ 'drag-over': isDraggingStudents }"
        >
          <div class="upload-icon">🗂️</div>
          <p>拖曳或點擊上傳多張學生考卷</p>
          <input
            type="file"
            ref="studentInput"
            @change="handleFileSelect('students', $event)"
            multiple
            accept="image/*"
            style="display: none"
          />
          <button @click="triggerFileInput('students')" class="select-btn">選擇學生考卷</button>
        </div>
        <div v-if="studentFiles.length > 0" class="file-list">
          <h3>已選擇圖片 ({{ studentFiles.length }})</h3>
          <div class="file-grid">
            <div v-for="(file, index) in studentFiles" :key="index" class="file-item">
              <img :src="file.preview" :alt="file.name" class="preview-image" />
              <p class="file-name">{{ file.name }}</p>
              <button @click="removeStudent(index)" class="remove-btn">移除</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="masterFile || studentFiles.length > 0" class="file-list">
      <div class="action-buttons">
        <button @click="clearAll" class="clear-btn">清除全部</button>
        <button
          @click="uploadFiles"
          class="upload-btn"
          :disabled="isUploading"
        >
          {{ isUploading ? '上傳中...' : '上傳並標註' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

interface FileWithPreview {
  file: File
  name: string
  preview: string
}

const router = useRouter()
const masterInput = ref<HTMLInputElement | null>(null)
const studentInput = ref<HTMLInputElement | null>(null)
const masterFile = ref<FileWithPreview | null>(null)
const studentFiles = ref<FileWithPreview[]>([])
const isDraggingMaster = ref(false)
const isDraggingStudents = ref(false)
const isUploading = ref(false)

const triggerFileInput = (target: 'master' | 'students') => {
  if (target === 'master') {
    masterInput.value?.click()
  } else {
    studentInput.value?.click()
  }
}

const handleDragOver = (target: 'master' | 'students') => {
  if (target === 'master') {
    isDraggingMaster.value = true
  } else {
    isDraggingStudents.value = true
  }
}

const handleDragLeave = (target: 'master' | 'students') => {
  if (target === 'master') {
    isDraggingMaster.value = false
  } else {
    isDraggingStudents.value = false
  }
}

const handleDrop = (target: 'master' | 'students', event: DragEvent) => {
  if (target === 'master') {
    isDraggingMaster.value = false
  } else {
    isDraggingStudents.value = false
  }
  const files = event.dataTransfer?.files
  if (files) {
    addFiles(target, Array.from(files))
  }
}

const handleFileSelect = (target: 'master' | 'students', event: Event) => {
  const input = event.target as HTMLInputElement
  const files = input.files
  if (files) {
    addFiles(target === 'master' ? 'master' : 'students', Array.from(files))
  }
}

const addFiles = async (target: 'master' | 'students', files: File[]) => {
  // 先按檔名排序
  const sortedFiles = [...files]
    .filter(file => file.type.startsWith('image/'))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

  // 依序讀取，保持順序
  for (const file of sortedFiles) {
    const preview = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target?.result as string)
      reader.readAsDataURL(file)
    })

    const previewData = {
      file,
      name: file.name,
      preview
    }

    if (target === 'master') {
      masterFile.value = previewData
    } else {
      studentFiles.value.push(previewData)
    }
  }
}

const clearMaster = () => {
  masterFile.value = null
}

const removeStudent = (index: number) => {
  studentFiles.value.splice(index, 1)
}

const clearAll = () => {
  masterFile.value = null
  studentFiles.value = []
}

const uploadFiles = () => {
  if (!masterFile.value) {
    alert('請先上傳標準答案卷。')
    return
  }
  if (studentFiles.value.length === 0) {
    alert('請至少上傳一張學生考卷。')
    return
  }
  isUploading.value = true
  // TODO: Replace with actual upload logic in production
  // This is a simulated upload for demonstration purposes
  setTimeout(() => {
    isUploading.value = false
    const masterData = {
      name: masterFile.value!.name,
      preview: masterFile.value!.preview,
      labels: []
    }
    const filesData = studentFiles.value.map(f => ({
      name: f.name,
      preview: f.preview,
      labels: []
    }))
    router.push({ 
      name: 'label',
      state: { masterKey: masterData, files: filesData }
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
  display: grid;
  gap: 2rem;
  margin-bottom: 2rem;
}

.upload-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.upload-section h2 {
  margin: 0;
  color: #2c3e50;
}

.upload-section h3 {
  margin: 0 0 0.75rem;
  color: #2c3e50;
  font-size: 1rem;
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
