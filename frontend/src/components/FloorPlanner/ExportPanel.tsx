import * as React from 'react'
import { useState } from 'react'
import { Download, FileJson, FileBox, FileCode, Check, Palette, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../../stores/useStore'
import { FloorProject, SimulationState } from '../../hooks/useFloorSimulation.ts'

interface ExportPanelProps {
  project: FloorProject
  simulation: SimulationState
}

export const ExportPanel: React.FC<ExportPanelProps> = ({ project, simulation }) => {
  const [exporting, setExporting] = useState<string | null>(null)
  const [applyZoneColors, setApplyZoneColors] = useState(true)
  const [autoTransition, setAutoTransition] = useState(true)
  
  const navigate = useNavigate()
  const setCurrentProject = useStore((state) => state.setCurrentProject)

  const handleExport = async (format: 'ifc' | 'json' | 'dxf') => {
    setExporting(format)
    try {
      const res = await fetch(`/api/v1/floor/projects/${project.id}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id,
          format,
          include_floors: [1],
        }),
      })

      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${project.name}.${format}`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } else {
        const err = await res.json()
        alert(`Export failed: ${err.detail || 'Internal error'}`)
      }
    } catch (error) {
      console.error('Export failed:', error)
    } finally {
      setExporting(null)
    }
  }

  const handleBimExport = async () => {
    setExporting('bim')
    try {
      // Direct integration: Send the internal FloorProject data to the persistent BIM service
      const res = await fetch(`http://localhost:8000/api/v1/projects/export-from-floor?apply_zone_colors=${applyZoneColors}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project), // Send entire FloorProject
      })

      if (res.ok) {
        const data = await res.json()
        // Update global project state with the new persistent project record
        setCurrentProject(data.project)
        
        if (autoTransition) {
          // Switch tab to 3D Viewer
          navigate('/')
        }
      } else {
        const err = await res.json()
        alert(`BIM Export failed: ${err.detail || 'Internal error'}`)
      }
    } catch (error) {
      console.error('BIM Export failed:', error)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="w-full bg-white/[0.02] border border-white/5 rounded-2xl p-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-6">
        <div className="flex flex-col">
          <span className="text-[10px] text-white/40 uppercase font-black tracking-widest">Simulation Status</span>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs font-bold ${simulation.converged ? 'text-green-500' : 'text-yellow-500'}`}>
              {simulation.converged ? 'CONVERGED' : 'CALCULATING...'}
            </span>
            <span className="text-[10px] font-mono text-white/20 uppercase tracking-tighter">
              {simulation.iterationCount} iterations
            </span>
          </div>
        </div>

        <div className="w-px h-8 bg-white/5" />

        {/* Export Options */}
        <div className="flex items-center gap-4 bg-white/[0.03] px-4 py-2 rounded-xl border border-white/5">
          <label className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              className="hidden"
              checked={applyZoneColors}
              onChange={(e) => setApplyZoneColors(e.target.checked)}
            />
            <div className={`w-8 h-4 rounded-full transition-all relative ${applyZoneColors ? 'bg-primary' : 'bg-white/10'}`}>
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${applyZoneColors ? 'left-4' : 'left-0.5'}`} />
            </div>
            <span className="text-[10px] font-bold text-white/40 group-hover:text-white/60 uppercase tracking-widest transition-colors">
              Apply Zone Colors
            </span>
          </label>

          <div className="w-px h-4 bg-white/5" />

          <label className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              className="hidden"
              checked={autoTransition}
              onChange={(e) => setAutoTransition(e.target.checked)}
            />
            <div className={`w-8 h-4 rounded-full transition-all relative ${autoTransition ? 'bg-indigo-500' : 'bg-white/10'}`}>
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${autoTransition ? 'left-4' : 'left-0.5'}`} />
            </div>
            <span className="text-[10px] font-bold text-white/40 group-hover:text-white/60 uppercase tracking-widest transition-colors">
              Auto-View 3D
            </span>
          </label>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => handleExport('json')}
          disabled={exporting !== null}
          className="flex items-center gap-2 px-5 py-2 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 hover:border-white/10 text-white/80 transition-all disabled:opacity-50"
        >
          {exporting === 'json' ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <FileJson className="w-4 h-4 text-yellow-500" />}
          <span className="text-xs font-bold uppercase tracking-wider">JSON</span>
        </button>

        <button
          onClick={handleBimExport}
          disabled={exporting !== null}
          className="flex items-center gap-2 px-6 py-2 bg-primary/20 hover:bg-primary/30 rounded-xl border border-primary/20 hover:border-primary/40 text-primary transition-all disabled:opacity-50 shadow-lg shadow-primary/5 group"
        >
          {exporting === 'bim' ? (
            <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
          ) : (
            <FileBox className="w-4 h-4" />
          )}
          <div className="flex flex-col items-start leading-none">
            <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Phase 4</span>
            <span className="text-xs font-black uppercase tracking-wider">BIM 3D EXPORT</span>
          </div>
          {!exporting && autoTransition && <ArrowRight className="w-3 h-3 opacity-50 group-hover:translate-x-1 transition-transform" />}
        </button>
      </div>
    </div>
  )
}
