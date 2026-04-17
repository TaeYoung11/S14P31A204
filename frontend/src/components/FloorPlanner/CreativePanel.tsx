import * as React from 'react'
import { useState } from 'react'
import { Sparkles, Wind, Layers, Activity, MousePointer2, Image as ImageIcon, Sliders, ChevronRight, ChevronLeft, Trash2 } from 'lucide-react'
import { CreativeSettings } from '../../hooks/useFloorSimulation.ts'

interface CreativePanelProps {
  settings: CreativeSettings
  onUpdateSettings: (settings: Partial<CreativeSettings>) => void
  onUploadImage: (file: File) => void
}

export const CreativePanel: React.FC<CreativePanelProps> = ({
  settings,
  onUpdateSettings,
  onUploadImage
}) => {
  const [isOpen, setIsOpen] = useState(true)
  const [activeTab, setActiveTab] = useState<'visual' | 'physics' | 'trace'>('visual')

  const fileInputRef = React.useRef<HTMLInputElement>(null)

  return (
    <div 
      className={`fixed bottom-24 left-6 z-40 flex flex-col transition-all duration-500 ease-in-out ${
        isOpen ? 'w-80' : 'w-12'
      }`}
    >
      <div className="flex items-center">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-10 h-10 flex items-center justify-center bg-primary text-white rounded-xl shadow-lg z-50 hover:scale-105 transition-all"
        >
          {isOpen ? <ChevronLeft className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
        </button>
        {isOpen && (
          <div className="ml-3 px-3 py-1 bg-primary/20 backdrop-blur-md border border-primary/30 rounded-full">
            <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Creative Toolkit</span>
          </div>
        )}
      </div>

      <div 
        className={`mt-3 bg-black/60 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden transition-all duration-500 shadow-2xl ${
          isOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-10 pointer-events-none'
        }`}
      >
        {/* Tabs */}
        <div className="flex border-b border-white/5 bg-white/5">
          <button
            onClick={() => setActiveTab('visual')}
            className={`flex-1 py-3 flex flex-col items-center gap-1 transition-all ${activeTab === 'visual' ? 'text-primary bg-white/5' : 'text-white/40 hover:text-white/60'}`}
          >
            <Activity className="w-4 h-4" />
            <span className="text-[8px] font-bold uppercase tracking-widest">Visual</span>
          </button>
          <button
            onClick={() => setActiveTab('physics')}
            className={`flex-1 py-3 flex flex-col items-center gap-1 transition-all ${activeTab === 'physics' ? 'text-primary bg-white/5' : 'text-white/40 hover:text-white/60'}`}
          >
            <Wind className="w-4 h-4" />
            <span className="text-[8px] font-bold uppercase tracking-widest">Physics</span>
          </button>
          <button
            onClick={() => setActiveTab('trace')}
            className={`flex-1 py-3 flex flex-col items-center gap-1 transition-all ${activeTab === 'trace' ? 'text-primary bg-white/5' : 'text-white/40 hover:text-white/60'}`}
          >
            <Layers className="w-4 h-4" />
            <span className="text-[8px] font-bold uppercase tracking-widest">Trace</span>
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Visual Mode Section */}
          {activeTab === 'visual' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="space-y-2">
                <label className="text-[10px] text-white/40 font-black uppercase tracking-widest">Display Mode</label>
                <div className="grid grid-cols-2 gap-2 bg-white/5 p-1 rounded-xl border border-white/5">
                  <button
                    onClick={() => onUpdateSettings({ viewMode: 'rigid' })}
                    className={`py-2 rounded-lg text-[10px] font-bold transition-all ${settings.viewMode === 'rigid' ? 'bg-primary text-white' : 'text-white/40 hover:text-white'}`}
                  >
                    RIGID (RECT)
                  </button>
                  <button
                    onClick={() => onUpdateSettings({ viewMode: 'organic' })}
                    className={`py-2 rounded-lg text-[10px] font-bold transition-all ${settings.viewMode === 'organic' ? 'bg-primary text-white' : 'text-white/40 hover:text-white'}`}
                  >
                    ORGANIC (CIRC)
                  </button>
                </div>
              </div>
              <p className="text-[9px] text-white/30 italic">
                Toggle between architectural rectangles and conceptual organic bubbles to explore flow.
              </p>
            </div>
          )}

          {/* Physics Section */}
          {activeTab === 'physics' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[9px] text-white/40 font-black uppercase tracking-widest">Gravity (ManyBody)</label>
                    <span className="text-[9px] font-mono text-primary">{settings.physics.gravity}</span>
                  </div>
                  <input
                    type="range"
                    min="-500"
                    max="0"
                    step="10"
                    value={settings.physics.gravity}
                    onChange={(e) => onUpdateSettings({ physics: { ...settings.physics, gravity: Number(e.target.value) } })}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[9px] text-white/40 font-black uppercase tracking-widest">Friction (Decay)</label>
                    <span className="text-[9px] font-mono text-primary">{settings.physics.friction.toFixed(3)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.001"
                    max="0.1"
                    step="0.001"
                    value={settings.physics.friction}
                    onChange={(e) => onUpdateSettings({ physics: { ...settings.physics, friction: Number(e.target.value) } })}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[9px] text-white/40 font-black uppercase tracking-widest">Link Distance</label>
                    <span className="text-[9px] font-mono text-primary">{settings.physics.linkDistanceMultiplier.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="3"
                    step="0.1"
                    value={settings.physics.linkDistanceMultiplier}
                    onChange={(e) => onUpdateSettings({ physics: { ...settings.physics, linkDistanceMultiplier: Number(e.target.value) } })}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Trace Image Section */}
          {activeTab === 'trace' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              {!settings.traceImage ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="group h-32 flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-2xl hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-all"
                >
                  <ImageIcon className="w-8 h-8 text-white/20 group-hover:text-primary transition-colors mb-2" />
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Upload Site Map</p>
                  <p className="text-[8px] text-white/20 mt-1">PNG, JPG recommended</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative h-32 rounded-xl overflow-hidden border border-white/10">
                    <img src={settings.traceImage} className="w-full h-full object-cover" />
                    <button 
                      onClick={() => onUpdateSettings({ traceImage: null })}
                      className="absolute top-2 right-2 p-1.5 bg-rose-500 text-white rounded-lg shadow-lg hover:scale-110 transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-2 px-3">
                      <span className="text-[9px] font-bold text-white uppercase opacity-60">Site Plan Active</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[9px] text-white/40 font-black uppercase tracking-widest">Opacity</label>
                      <span className="text-[9px] font-mono text-primary">{Math.round(settings.traceOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={settings.traceOpacity}
                      onChange={(e) => onUpdateSettings({ traceOpacity: Number(e.target.value) })}
                      className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                  </div>
                </div>
              )}
              <input 
                ref={fileInputRef}
                type="file" 
                className="hidden" 
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) onUploadImage(file)
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
