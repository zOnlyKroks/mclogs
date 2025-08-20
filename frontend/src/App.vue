<template>
  <div id="app">
    <header class="header">
      <div class="container">
        <h1>
          <router-link to="/" class="logo">MCLogs</router-link>
        </h1>
        <nav>
          <div class="nav-links">
            <router-link to="/">Submit</router-link>
            <router-link to="/search">Search</router-link>
            <router-link v-if="authStore.user" to="/dashboard">Dashboard</router-link>
          </div>
          
          <div class="auth-section">
            <div v-if="authStore.user" class="user-menu">
              <img v-if="authStore.user?.picture" :src="authStore.user.picture" :alt="authStore.user.name" class="user-avatar">
              <span class="user-name">{{ authStore.user?.name }}</span>
              <button @click="authStore.logout" class="btn-logout">Logout</button>
            </div>
          </div>
        </nav>
      </div>
    </header>

    <main class="main">
      <div class="container">
        <router-view />
      </div>
    </main>

    <footer class="footer">
      <div class="container">
        <p>Minecraft crash log sharing - Logs are stored for 30 days</p>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from './stores/auth'

const route = useRoute()
const authStore = useAuthStore()

// Handle OAuth callback
onMounted(() => {
  const urlParams = new URLSearchParams(window.location.search)
  const token = urlParams.get('token')
  const error = urlParams.get('error')

  if (token) {
    // Extract user info from JWT (basic decode, no verification needed client-side)
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      authStore.setAuth(token, {
        id: payload.id,
        email: payload.email,
        name: payload.name,
        picture: payload.picture
      })
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname)
    } catch (err) {
      console.error('Failed to parse auth token:', err)
    }
  } else if (error) {
    console.error('Auth error:', error)
    // Could show a toast notification here
  }
})
</script>

<style scoped>
#app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  background: rgba(44, 62, 80, 0.95);
  backdrop-filter: blur(10px);
  color: white;
  padding: 1rem 0;
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.1);
}

.header .container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: nowrap;
}

.logo {
  color: #42b883;
  text-decoration: none;
  font-size: 1.5rem;
  font-weight: bold;
  white-space: nowrap;
  flex-shrink: 0;
}

.logo:hover {
  color: #369870;
}

nav {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: nowrap;
  min-width: 0;
}

.nav-links {
  display: flex;
  align-items: center;
}

.nav-links a {
  color: white;
  text-decoration: none;
  margin-left: 1.5rem;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  transition: background-color 0.2s;
  white-space: nowrap;
}

.nav-links a:hover,
.nav-links a.router-link-active {
  background-color: rgba(255, 255, 255, 0.1);
}

.auth-section {
  flex-shrink: 0;
}

.btn-auth {
  background: #4285f4;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background-color 0.2s;
  white-space: nowrap;
}

.btn-auth:hover {
  background: #3367d6;
}

.user-menu {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: nowrap;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.2);
  flex-shrink: 0;
}

.user-name {
  color: white;
  font-size: 0.875rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 150px;
}

.btn-logout {
  background: transparent;
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
  transition: all 0.2s;
  white-space: nowrap;
  flex-shrink: 0;
}

.btn-logout:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.5);
}

.main {
  flex: 1;
  padding: 2rem 0;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1rem;
}

.footer {
  background: rgba(52, 73, 94, 0.95);
  backdrop-filter: blur(10px);
  color: white;
  text-align: center;
  padding: 1rem 0;
  box-shadow: 0 -2px 20px rgba(0, 0, 0, 0.1);
}

.footer p {
  margin: 0;
  opacity: 0.8;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .header .container {
    flex-wrap: wrap;
    gap: 1rem;
  }
  
  nav {
    width: 100%;
    justify-content: space-between;
  }
  
  .nav-links a {
    margin-left: 0;
    margin-right: 1rem;
  }
  
  .user-name {
    display: none;
  }
}

@media (max-width: 480px) {
  .nav-links {
    order: 2;
    width: 100%;
  }
  
  .auth-section {
    order: 1;
  }
}
</style>