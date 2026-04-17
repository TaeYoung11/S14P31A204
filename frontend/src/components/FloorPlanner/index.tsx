import * as React from 'react'
import { useState, useEffect } from 'react'
import { Layout, Play, Plus, MousePointer2, Layers, Search, Eye, EyeOff, Settings } from 'lucide-react'
import { useFloorSimulation } from '../../hooks/useFloorSimulation'
import { FloorCanvas } from './FloorCanvas.tsx'
import { RoomMatrixPanel } from './RoomMatrixPanel.tsx'
import { ExportPanel } from './ExportPanel.tsx'
import { FloorRoomInspector } from './FloorRoomInspector.tsx'
import { CreativePanel } from './CreativePanel.tsx'

export const FloorPlanner: React.FC = () => {
  const [projectId, setProjectId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('floorProjectId')
  })

  // Usability Upgrade: Multi-floor state
  const [currentFloor, setCurrentFloor] = useState(1)
  const [xRayFloors, setXRayFloors] = useState<number[]>([]) // Reference floors to show as ghosts
  const [isXRayEnabled, setIsXRayEnabled] = useState(false)

  const {
    project,
    isLoading,
    simulation,
    selectedRoomId,
    setSelectedRoomId,
    startSimulation,
    dragRoom,
    toggleLock,
    updateAdjacency,
    addRoom,
    deleteRoom,
    updateRoom,
    creativeSettings,
    updateCreativeSettings,
    uploadTraceImage,
    createZone,
    assignRoomToZone,
    deleteZone,
    refresh
  } = useFloorSimulation(projectId)

  // Calculate stats
  const currentRooms = project?.rooms.filter(r => r.floor === currentFloor) || []
  const totalArea = currentRooms.reduce((sum, r) => sum + (r.width * r.height), 0)

  const handleCreateProject = async () => {
    const res = await fetch('/api/v1/floor/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Floor Plan' }),
    })
    if (res.ok) {
      const data = await res.json()
      setProjectId(data.id)
      const newUrl = new URL(window.location.href)
      newUrl.searchParams.set('floorProjectId', data.id)
      window.history.pushState({}, '', newUrl)
    }
  }

  // Usability Upgrade: Keyboard Shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedRoomId) {
        // Don't delete if user is typing in an input
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return
        deleteRoom(selectedRoomId)
      }
      if (e.key === 'Escape') {
        setSelectedRoomId(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedRoomId, deleteRoom, setSelectedRoomId])

  if (!projectId) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center text-white">
        <Layout className="w-16 h-16 mb-6 text-primary/40" />
        <h2 className="text-2xl font-bold mb-2">No Floor Project Selected</h2>
        <p className="text-white/40 mb-8 max-w-md">
          Create a new floor plan project to start designing room adjacencies and automatic layouts.
        </p>
        <button
          onClick={handleCreateProject}
          className="px-8 py-3 bg-primary hover:bg-primary-hover text-white font-bold rounded-xl shadow-lg shadow-primary/20 transition-all"
        >
          CREATE NEW PROJECT
        </button>
      </div>
    )
  }

  if (isLoading || !project) {
    return (
      <div className="w-full h-full flex items-center justify-center text-white/60">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-medium uppercase tracking-widest">Loading Floor Project...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col gap-4 p-6 overflow-hidden animate-in fade-in duration-500 bg-[#0f172a]">
      {/* Upper Toolbar */}
      <header className="flex items-center justify-between px-2 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
            <Layout className="w-6 h-6 text-white" />
          </div>
            <div className="flex flex-col">
              <h1 className="text-sm font-black text-white tracking-widest uppercase truncate max-w-[200px]">
                {project.name || 'Architecture Project'}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[9px] text-white/30 uppercase font-bold tracking-tighter">Project Active</span>
                <span className="text-[9px] font-mono text-primary font-bold">
                  {project.rooms.reduce((acc, r) => acc + (r.width * r.height), 0).toFixed(1)} m²
                </span>
              </div>
            </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/10 shrink-0">
            <div className={`w-2 h-2 rounded-full ${simulation.converged ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
            <span className="text-[10px] font-bold text-white/60 uppercase">
              ENERGY: {simulation.energy.toFixed(4)}
            </span>
          </div>
          
          <button
            onClick={startSimulation}
            disabled={simulation.running}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              simulation.running ? 'bg-white/5 text-white/20' : 'bg-primary hover:bg-primary-hover text-white shadow-lg'
            }`}
          >
            <Play className={`w-4 h-4 ${simulation.running ? 'animate-spin' : ''}`} />
            {simulation.running ? 'SIMULATING...' : 'RUN SIMULATION'}
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 flex overflow-hidden min-h-0 gap-4">
        {/* Left Panel */}
        <div className="w-80 shrink-0 flex flex-col glass-panel rounded-3xl overflow-hidden border-white/5">
          <div className="p-5 border-b border-white/5 bg-white/[0.02]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold tracking-tight">Project Summary</h2>
              <span className="text-[10px] px-2 py-0.5 bg-primary/20 text-primary rounded-full font-bold">
                {currentFloor}F
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-black/20 rounded-xl border border-white/5">
                <p className="text-[9px] text-white/30 uppercase font-black tracking-widest mb-1">Total Rooms</p>
                <p className="text-xl font-mono font-bold">{currentRooms.length}</p>
              </div>
              <div className="p-3 bg-black/20 rounded-xl border border-white/5">
                <p className="text-[9px] text-white/30 uppercase font-black tracking-widest mb-1">Floor Area</p>
                <p className="text-xl font-mono font-bold text-primary">{totalArea.toFixed(1)} <span className="text-[10px] font-normal text-white/40">m²</span></p>
              </div>
            </div>
          </div>
          
          <div className="flex-1 min-h-0">
            <RoomMatrixPanel
              project={project}
              currentFloor={currentFloor}
              selectedRoomId={selectedRoomId}
              onSelectRoom={setSelectedRoomId}
              onUpdateAdjacency={updateAdjacency}
              onToggleLock={toggleLock}
              onAddRoom={addRoom}
              onDeleteRoom={deleteRoom}
              zones={project.zones || []}
              onCreateZone={createZone}
              onDeleteZone={deleteZone}
              onAssignRoomToZone={assignRoomToZone}
            />
          </div>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 relative rounded-[32px] overflow-hidden border border-white/5 shadow-2xl bg-slate-900/50">
          <FloorCanvas
            project={project}
            currentFloor={currentFloor}
            xRayFloors={isXRayEnabled ? xRayFloors : []}
            selectedRoomId={selectedRoomId}
            creativeSettings={creativeSettings}
            onSelectRoom={setSelectedRoomId}
            onDragRoom={dragRoom}
          />
          
          <CreativePanel
            settings={creativeSettings}
            onUpdateSettings={updateCreativeSettings}
            onUploadImage={uploadTraceImage}
          />
          
          {selectedRoomId && (
            <FloorRoomInspector
              room={project.rooms.find(r => r.id === selectedRoomId)!}
              onClose={() => setSelectedRoomId(null)}
              onToggleLock={toggleLock}
              onDeleteRoom={deleteRoom}
              onUpdateRoom={updateRoom}
              zones={project.zones || []}
              onAssignZone={assignRoomToZone}
            />
          )}

          {/* Usability Upgrade: Floor Selector (Google Map Style) */}
          <div className="absolute top-6 left-6 flex flex-col gap-2 p-1 bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 z-20">
            {[3, 2, 1, 0, -1].map((f) => (
              <button
                key={f}
                onClick={() => {
                  setCurrentFloor(f)
                  // Toggle X-Ray for the previous floor automatically or let user decide
                }}
                className={`w-10 h-10 flex items-center justify-center rounded-xl text-xs font-black transition-all ${
                  currentFloor === f 
                    ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-105' 
                    : 'text-white/40 hover:text-white hover:bg-white/5'
                }`}
              >
                {f === 0 ? 'B1' : f > 0 ? `${f}F` : `B${Math.abs(f) + 1}`}
              </button>
            ))}
          </div>

          {/* Usability Upgrade: X-Ray Controls */}
          <div className="absolute top-6 right-[300px] flex items-center gap-2 p-1.5 bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 z-20">
            <button
              onClick={() => setIsXRayEnabled(!isXRayEnabled)}
              className={`p-2 rounded-xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                isXRayEnabled ? 'bg-indigo-500 text-white' : 'text-white/40 hover:text-white'
              }`}
            >
              {isXRayEnabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              X-RAY MODE
            </button>
            {isXRayEnabled && (
              <div className="flex items-center gap-1 border-l border-white/10 pl-2">
                {[-1, 0, 1, 2, 3].filter(f => f !== currentFloor).map(f => (
                  <button
                    key={f}
                    onClick={() => {
                      setXRayFloors(prev => 
                        prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]
                      )
                    }}
                    className={`px-2 py-1 rounded-lg text-[9px] font-bold ${
                      xRayFloors.includes(f) ? 'bg-white/20 text-white' : 'text-white/20 hover:text-white/40'
                    }`}
                  >
                    {f === 0 ? 'B1' : f > 0 ? `${f}F` : `B${Math.abs(f) + 1}`}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Canvas Floating controls */}
          <div className="absolute bottom-6 left-6 flex flex-col gap-2 p-1 bg-black/40 backdrop-blur-md rounded-xl border border-white/10 z-20">
            <button className="p-2 hover:bg-white/10 rounded-lg text-white/60 hover:text-white transition-colors">
              <MousePointer2 className="w-5 h-5" />
            </button>
            <button className="p-2 hover:bg-white/10 rounded-lg text-white/60 hover:text-white transition-colors">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </main>

      {/* Footer / Export */}
      <footer className="shrink-0">
        <ExportPanel
          project={project}
          simulation={simulation}
        />
      </footer>
    </div>
  )
}
