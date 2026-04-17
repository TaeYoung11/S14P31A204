import { useState } from 'react'
import {
  ArrowRight,
  Box,
  Globe,
  Plus,
  ShieldCheck,
  Upload,
  Zap,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useStore } from '../../stores/useStore'

type StartMode = 'upload' | 'blank'

export const LandingPage = () => {
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [startMode, setStartMode] = useState<StartMode>('upload')
  const [storeyCount, setStoreyCount] = useState(1)
  const [storeyHeight, setStoreyHeight] = useState(3000)
  const [baseElevation, setBaseElevation] = useState(0)
  const setCurrentProject = useStore((state) => state.setCurrentProject)

  const handleCreate = async () => {
    if (!name.trim()) return
    if (startMode === 'upload' && !file) return

    setLoading(true)
    try {
      const createRes = await fetch('http://localhost:8000/api/v1/projects/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          start_mode: startMode,
          blank_model:
            startMode === 'blank'
              ? {
                  schema: 'IFC4',
                  storey_count: storeyCount,
                  storey_height_mm: storeyHeight,
                  base_elevation_mm: baseElevation,
                }
              : undefined,
        }),
      })
      if (!createRes.ok) throw new Error('Project creation failed')

      const project = await createRes.json()

      if (startMode === 'upload' && file) {
        const formData = new FormData()
        formData.append('file', file)
        const uploadRes = await fetch(
          `http://localhost:8000/api/v1/projects/${project.id}/upload`,
          {
            method: 'POST',
            body: formData,
          },
        )
        if (!uploadRes.ok) throw new Error('IFC upload failed')
        const updatedProject = await uploadRes.json()
        setCurrentProject(updatedProject)
      } else {
        setCurrentProject(project)
      }
    } catch (error) {
      console.error('Project creation failed:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-[#050505]">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/10 blur-[120px] rounded-full" />
      </div>

      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-12 items-center relative z-10">
        <div className="p-4">
          <div className="w-16 h-16 bg-gradient-to-br from-primary to-accent rounded-3xl flex items-center justify-center shadow-2xl shadow-primary/40 mb-10">
            <Box className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-6xl font-black tracking-tighter text-white mb-6 leading-[1.1]">
            BIM 3D
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
              AUTHORING.
            </span>
          </h1>
          <p className="text-lg text-white/40 font-medium mb-12 max-w-md">
            Start from a blank IFC4 workspace or upload an existing IFC4 model, then author geometry with That Open and a server-side IFC source of truth.
          </p>

          <div className="grid grid-cols-3 gap-6">
            {[
              { icon: Zap, label: 'Preview First' },
              { icon: ShieldCheck, label: 'Revision Lock' },
              { icon: Globe, label: 'Realtime' },
            ].map((item) => (
              <div key={item.label} className="flex flex-col gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center">
                  <item.icon className="w-5 h-5 text-white/40" />
                </div>
                <span className="text-[10px] uppercase font-black tracking-widest text-white/20">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel p-10 rounded-[40px] shadow-[0_32px_120px_rgba(0,0,0,0.5)] border-white/10">
          <div className="mb-8">
            <span className="text-xs font-bold text-primary uppercase tracking-[0.2em]">
              Start a New Session
            </span>
            <h2 className="text-3xl font-bold mt-2">Create Project</h2>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-8">
            <button
              onClick={() => setStartMode('upload')}
              className={clsx(
                'rounded-2xl border px-5 py-4 text-left transition-all',
                startMode === 'upload'
                  ? 'border-primary bg-primary/10 text-white'
                  : 'border-white/10 bg-white/[0.02] text-white/50',
              )}
            >
              <div className="text-xs font-black uppercase tracking-widest mb-1">Upload IFC</div>
              <div className="text-xs text-white/40">Start from an existing model.</div>
            </button>
            <button
              onClick={() => setStartMode('blank')}
              className={clsx(
                'rounded-2xl border px-5 py-4 text-left transition-all',
                startMode === 'blank'
                  ? 'border-primary bg-primary/10 text-white'
                  : 'border-white/10 bg-white/[0.02] text-white/50',
              )}
            >
              <div className="text-xs font-black uppercase tracking-widest mb-1">Blank IFC4</div>
              <div className="text-xs text-white/40">Bootstrap a new authoring model.</div>
            </button>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-[10px] font-black uppercase text-white/30 mb-2 tracking-widest">
                Project Name
              </label>
              <div className="relative">
                <Plus className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Enter project name..."
                  className="w-full bg-white/[0.02] border border-white/10 rounded-2xl px-12 py-4 text-sm focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/5 transition-all"
                />
              </div>
            </div>

            {startMode === 'upload' ? (
              <div>
                <label className="block text-[10px] font-black uppercase text-white/30 mb-2 tracking-widest">
                  IFC Model File
                </label>
                <label className="group relative flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-white/10 rounded-[32px] hover:border-primary/40 hover:bg-primary/[0.02] transition-all cursor-pointer overflow-hidden">
                  {file ? (
                    <div className="flex flex-col items-center">
                      <Box className="w-10 h-10 text-primary mb-2" />
                      <span className="text-sm font-medium">{file.name}</span>
                      <span className="text-[10px] text-white/20">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-10 h-10 text-white/10 group-hover:text-primary/60 transition-colors mb-4" />
                      <span className="text-xs text-white/30 font-medium">
                        Click or drag an IFC file to upload
                      </span>
                    </>
                  )}
                  <input
                    type="file"
                    accept=".ifc"
                    className="hidden"
                    onChange={(event) => setFile(event.target.files?.[0] || null)}
                  />
                </label>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                <NumberField label="Storeys" value={storeyCount} onChange={setStoreyCount} />
                <NumberField label="Storey Height" value={storeyHeight} onChange={setStoreyHeight} />
                <NumberField label="Base Elev." value={baseElevation} onChange={setBaseElevation} />
              </div>
            )}

            <button
              onClick={handleCreate}
              disabled={!name || loading || (startMode === 'upload' && !file)}
              className="w-full group bg-white text-black py-5 rounded-[24px] font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-primary hover:text-white transition-all active:scale-[0.98] disabled:opacity-20 disabled:pointer-events-none shadow-xl"
            >
              {loading ? (
                <Box className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <span>Launch Workspace</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </div>

          <p className="mt-8 text-center text-[10px] text-white/20 font-medium">
            Blank authoring is restricted to IFC4. Uploaded non-IFC4 models stay view-only for direct authoring.
          </p>
        </div>
      </div>
    </div>
  )
}

const NumberField = ({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) => (
  <div>
    <label className="block text-[10px] font-black uppercase text-white/30 mb-2 tracking-widest">
      {label}
    </label>
    <input
      type="number"
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="w-full bg-white/[0.02] border border-white/10 rounded-2xl px-4 py-4 text-sm focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/5 transition-all"
    />
  </div>
)
