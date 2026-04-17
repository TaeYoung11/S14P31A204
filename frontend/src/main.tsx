import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

if (import.meta.env.DEV) {
  const originalWarn = console.warn

  console.warn = (...args: unknown[]) => {
    const [firstArg] = args

    if (
      typeof firstArg === 'string' &&
      firstArg.includes('THREE.WARNING: Multiple instances of Three.js being imported.')
    ) {
      return
    }

    originalWarn(...args)
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
