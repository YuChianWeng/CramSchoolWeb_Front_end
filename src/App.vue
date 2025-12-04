<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div id="app">
    <header>
      <div class="header-content">
        <h1 class="app-title">🎓 Cram School - YOLO Image Labeling</h1>
        <nav>
          <RouterLink to="/">📁 Upload</RouterLink>
          <RouterLink to="/label">🏷️ Label</RouterLink>
          <RouterLink to="/results">📊 Results</RouterLink>
        </nav>
      </div>
    </header>

    <main>
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
#app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

header {
  background: linear-gradient(135deg, #42b883 0%, #35945d 100%);
  color: white;
  padding: 1.5rem 2rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.header-content {
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}

.app-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
}

nav {
  display: flex;
  gap: 1rem;
}

nav a {
  color: white;
  text-decoration: none;
  padding: 0.75rem 1.5rem;
  border-radius: 4px;
  transition: all 0.3s;
  background-color: rgba(255, 255, 255, 0.1);
  font-weight: 500;
}

nav a:hover {
  background-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
}

nav a.router-link-active {
  background-color: rgba(255, 255, 255, 0.3);
  font-weight: 600;
}

main {
  flex: 1;
  background-color: #fafafa;
}

@media (max-width: 768px) {
  .header-content {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .app-title {
    font-size: 1.25rem;
  }
  
  nav {
    width: 100%;
    justify-content: space-between;
  }
  
  nav a {
    flex: 1;
    text-align: center;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
  }
}
</style>
