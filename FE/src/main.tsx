import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App'

const queryClient = new QueryClient()

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
