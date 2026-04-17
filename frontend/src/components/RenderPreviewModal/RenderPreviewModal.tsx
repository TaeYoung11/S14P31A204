import { useState } from 'react'
import { X, Download, Camera, Loader2, SlidersHorizontal, Info } from 'lucide-react'

interface RenderStyle {
  time_of_day: 'golden_hour' | 'noon' | 'dusk' | 'night'
  viewpoint: 'exterior_front' | 'exterior_side' | 'interior' | 'aerial'
  season: 'spring' | 'summer' | 'autumn' | 'winter'
  weather: 'clear' | 'cloudy' | 'overcast'
}

interface Props {
  projectId: string
  onClose: () => void
  captureScreenshot: () => string | null
}

export const RenderPreviewModal = ({ projectId, onClose, captureScreenshot }: Props) => {
  const [style, setStyle] = useState<RenderStyle>({
    time_of_day: 'golden_hour',
    viewpoint: 'exterior_front',
    season: 'spring',
    weather: 'clear',
  })
  const [denoising, setDenoising] = useState(0.65)
  const [isLoading, setIsLoading] = useState(false)
  const [resultImage, setResultImage] = useState<string | null>(null)
  const [beforeImage, setBeforeImage] = useState<string | null>(null)
  const [prompt, setPrompt] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [genTime, setGenTime] = useState<number | null>(null)

  const handleGenerate = async () => {
    const screenshot = captureScreenshot()
    if (!screenshot) {
      setError('Failed to capture 3D view screenshot.')
      return
    }

    setIsLoading(true)
    setError(null)
    setBeforeImage(screenshot)

    try {
      const res = await fetch(`http://localhost:8000/api/v1/projects/${projectId}/render-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_b64: screenshot.replace(/^data:image\/png;base64,/, ''),
          style,
          denoising_strength: denoising,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Render failed')
      }

      const data = await res.json()
      setResultImage(`data:image/png;base64,${data.image_b64}`)
      setPrompt(data.prompt)
      setGenTime(data.generation_time_sec)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownload = () => {
    if (!resultImage) return
    const link = document.createElement('a')
    link.href = resultImage
    link.download = `bim-render-${Date.now()}.png`
    link.click()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="w-full max-w-5xl h-[85vh] bg-[#0a0a0a] border border-white/10 rounded-[32px] overflow-hidden flex flex-col shadow-[0_0_100px_rgba(0,0,0,0.8)]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-xl">
              <Camera className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-bold tracking-tight text-lg text-white/90">Photorealistic Rendering</h2>
              <p className="text-[10px] text-white/30 uppercase tracking-[0.2em] font-medium">Stable Diffusion img2img Pipeline</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2.5 hover:bg-white/5 rounded-2xl transition-colors text-white/40 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Options Side Panel */}
          <div className="w-80 shrink-0 p-8 border-r border-white/5 flex flex-col gap-8 bg-black/40 overflow-y-auto custom-scrollbar">
            
            <OptionGroup label="Time of Day" value={style.time_of_day}
              options={[
                { value: 'golden_hour', label: '🌅 Golden Hour' },
                { value: 'noon',        label: '☀️ Midday Sun' },
                { value: 'dusk',        label: '🌆 Twilight Dusk' },
                { value: 'night',       label: '🌙 Night Scene' },
              ]}
              onChange={(v) => setStyle({ ...style, time_of_day: v as RenderStyle['time_of_day'] })}
            />

            <OptionGroup label="Camera Perspective" value={style.viewpoint}
              options={[
                { value: 'exterior_front', label: '🏠 Exterior Front' },
                { value: 'exterior_side',  label: '🏠 Exterior Side' },
                { value: 'interior',       label: '🛋️ Interior View' },
                { value: 'aerial',         label: '🚁 Aerial / Birdseye' },
              ]}
              onChange={(v) => setStyle({ ...style, viewpoint: v as RenderStyle['viewpoint'] })}
            />

            <OptionGroup label="Season & Atmosphere" value={style.season}
              options={[
                { value: 'spring', label: '🌸 Fresh Spring' },
                { value: 'summer', label: '🌿 Lush Summer' },
                { value: 'autumn', label: '🍂 Warm Autumn' },
                { value: 'winter', label: '❄️ Snowy Winter' },
              ]}
              onChange={(v) => setStyle({ ...style, season: v as RenderStyle['season'] })}
            />

            {/* Creativity Slider */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/40">
                  <SlidersHorizontal className="inline w-3.5 h-3.5 mr-2 opacity-50" />
                  Creativity Level
                </label>
                <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-md">{denoising.toFixed(2)}</span>
              </div>
              <input type="range" min="0.3" max="0.9" step="0.05"
                value={denoising}
                onChange={(e) => setDenoising(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-primary"
              />
              <div className="flex justify-between text-[10px] text-white/20 font-medium">
                <span>STRUCTURAL FOCUS</span>
                <span>ARTISTIC FREEDOM</span>
              </div>
            </div>

            {/* Generate Action */}
            <div className="mt-auto pt-6">
              <button
                onClick={handleGenerate}
                disabled={isLoading}
                className="w-full bg-primary hover:bg-primary/90 text-black font-bold py-4 rounded-2xl flex items-center justify-center gap-3 transition-all disabled:opacity-30 disabled:cursor-not-allowed group shadow-[0_8px_32px_rgba(var(--primary-rgb),0.3)]"
              >
                {isLoading
                  ? <><Loader2 className="w-5 h-5 animate-spin" /> GENERATING...</>
                  : <>
                      <Camera className="w-5 h-5 group-hover:scale-110 transition-transform" /> 
                      GENERATE RENDER
                    </>
                }
              </button>
              {genTime && (
                <p className="text-[10px] text-white/30 text-center mt-3 font-medium">
                  Last render completed in <span className="text-white/50">{genTime}s</span>
                </p>
              )}
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 p-10 flex flex-col gap-6 bg-gradient-to-b from-white/[0.03] to-transparent overflow-y-auto">
            {error && (
              <div className="p-5 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 text-sm flex items-start gap-4 animate-in slide-in-from-top-4 duration-300">
                <Info className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold mb-1">Rendering Encountered an Error</p>
                  <p className="opacity-80">{error}</p>
                </div>
              </div>
            )}

            {isLoading && (
              <div className="flex-1 flex flex-col items-center justify-center gap-8 animate-pulse">
                <div className="relative">
                  <div className="w-24 h-24 border-4 border-primary/20 rounded-full" />
                  <div className="absolute inset-0 w-24 h-24 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                  <Camera className="absolute inset-0 m-auto w-8 h-8 text-primary/50" />
                </div>
                <div className="text-center">
                  <p className="text-white/80 font-bold text-xl mb-2">Architectural Vision in Progress</p>
                  <p className="text-white/30 text-sm max-w-sm">
                    Processing your BIM model through Stable Diffusion on <span className="text-primary/60">RTX 4050</span>. 
                    This typically takes 25 to 45 seconds.
                  </p>
                </div>
              </div>
            )}

            {resultImage && !isLoading && (
              <div className="flex-1 flex flex-col gap-6 animate-in zoom-in-95 duration-500">
                <div className="grid grid-cols-2 gap-4">
                  {/* Original Input Preview */}
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Original View</span>
                    <div className="relative rounded-2xl overflow-hidden border border-white/10 aspect-video bg-black/50">
                      <img src={beforeImage || ''} alt="Original BIM View" className="w-full h-full object-cover opacity-50" />
                    </div>
                  </div>
                  
                  {/* Generated Result */}
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Enhanced Render</span>
                    <div className="relative rounded-2xl overflow-hidden border border-primary/20 shadow-2xl aspect-video bg-black group">
                      <img src={resultImage} alt="Photorealistic architectural render" className="w-full h-full object-cover" />
                      
                      {/* Download overlay */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                        <button
                          onClick={handleDownload}
                          className="bg-white text-black px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:scale-105 active:scale-95 transition-all"
                        >
                          <Download className="w-4 h-4" />
                          Save Render
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {prompt && (
                  <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-6">
                    <h3 className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                       Generated Prompt Context
                    </h3>
                    <p className="text-xs text-white/70 leading-relaxed font-mono selection:bg-primary selection:text-black">
                      {prompt}
                    </p>
                  </div>
                )}
              </div>
            )}

            {!resultImage && !isLoading && !error && (
              <div className="flex-1 flex flex-col items-center justify-center text-white/10 gap-6">
                <div className="w-32 h-32 rounded-full border-2 border-dashed border-white/10 flex items-center justify-center">
                  <Camera className="w-12 h-12" />
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-white/20">Awaiting Render Command</p>
                  <p className="text-sm">Configure your environmental options and click 'Generate'</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Option selection group
const OptionGroup = ({
  label, value, options, onChange
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) => (
  <div className="flex flex-col gap-3">
    <label className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/40">{label}</label>
    <div className="grid grid-cols-1 gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`text-left px-4 py-3 rounded-xl text-sm font-medium transition-all group relative overflow-hidden ${
            value === opt.value
              ? 'bg-primary/10 border border-primary/30 text-primary'
              : 'bg-white/[0.02] border border-white/5 text-white/50 hover:text-white/80 hover:bg-white/[0.05] hover:border-white/10'
          }`}
        >
          {opt.label}
          {value === opt.value && (
            <div className="absolute inset-y-0 right-0 w-1 bg-primary" />
          )}
        </button>
      ))}
    </div>
  </div>
)
