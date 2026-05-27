import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App'

const queryClient = new QueryClient()

if (typeof window !== 'undefined') {
  const preloadErrorReloadKey = '__vite_preload_error_reloaded__'
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault()
    const alreadyReloaded = window.sessionStorage.getItem(preloadErrorReloadKey) === '1'
    if (alreadyReloaded) return
    window.sessionStorage.setItem(preloadErrorReloadKey, '1')
    window.location.reload()
  })
  window.addEventListener('load', () => {
    window.sessionStorage.removeItem(preloadErrorReloadKey)
  })
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          registration.unregister()
        })
      })
    }

    if ('caches' in window) {
      caches.keys().then((keys) => {
        keys
          .filter((key) => key.includes('workbox') || key.includes('precache'))
          .forEach((key) => {
            caches.delete(key)
          })
      })
    }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
