import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import { Layout, Box, Map as MapIcon } from 'lucide-react'
import { BIMViewer } from './components/BIMViewer/BIMViewer'
import { FloorPlanner } from './components/FloorPlanner'
import { useStore } from './stores/useStore'

function AppContent() {
  const currentProject = useStore((state) => state.currentProject)
  const setCurrentProject = useStore((state) => state.setCurrentProject)
  const [isInitializing, setIsInitializing] = useState(true)
  const hasAttemptedAutoLoad = useRef(false)
  const location = useLocation()

  useEffect(() => {
    if (hasAttemptedAutoLoad.current) {
      setIsInitializing(false)
      return
    }

    const params = new URLSearchParams(window.location.search)
    const projectIdFromUrl = params.get('projectId')
    if (projectIdFromUrl && !currentProject) {
      hasAttemptedAutoLoad.current = true
      fetch(`http://localhost:8000/api/v1/projects/${projectIdFromUrl}`)
        .then((response) => {
          if (!response.ok) throw new Error('Project not found')
          return response.json()
        })
        .then((data) => {
          if (data?.id) {
            setCurrentProject(data)
          }
          setIsInitializing(false)
        })
        .catch((error) => {
          console.error('Failed to auto-load project:', error)
          setIsInitializing(false)
        })
    } else {
      setIsInitializing(false)
    }
  }, [currentProject, setCurrentProject])

  if (isInitializing) {
    return (
      <div className="w-full h-screen bg-background flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-white/60">Initializing BIM workspace...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-screen bg-background flex flex-col p-4 gap-4 overflow-hidden text-white">
      {/* Global Navigation Bar */}
      <nav className="flex items-center gap-2 p-1 bg-white/5 rounded-2xl border border-white/5 w-fit self-center">
        <Link
          to="/"
          className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-bold transition-all ${
            location.pathname === '/' 
              ? 'bg-primary text-white shadow-lg' 
              : 'text-white/40 hover:text-white hover:bg-white/5'
          }`}
        >
          <Box className="w-4 h-4" />
          BIM VIEWER (3D)
        </Link>
        <Link
          to="/floor-planner"
          className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-bold transition-all ${
            location.pathname === '/floor-planner' 
              ? 'bg-indigo-600 text-white shadow-lg' 
              : 'text-white/40 hover:text-white hover:bg-white/5'
          }`}
        >
          <MapIcon className="w-4 h-4" />
          FLOOR PLANNER (2D)
        </Link>
      </nav>

      <div className="flex-1 flex overflow-hidden min-h-0">
        <Routes>
          <Route path="/" element={<BIMViewer />} />
          <Route path="/floor-planner" element={<FloorPlanner />} />
        </Routes>
      </div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}

export default App
