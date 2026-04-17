import * as React from 'react'
import { X, Lock, Unlock, Trash2 } from 'lucide-react'
import { Room, Zone } from '../../hooks/useFloorSimulation.ts'

interface FloorInspectorProps {
  room: Room
  onClose: () => void
  onToggleLock: (id: string) => void
  onDeleteRoom: (id: string) => void
  onUpdateRoom: (room: Room) => void
  zones: Zone[]
  onAssignZone: (roomId: string, zoneId: string | null) => void
}

export const FloorRoomInspector: React.FC<FloorInspectorProps> = ({
  room,
  onClose,
  onToggleLock,
  onDeleteRoom,
  onUpdateRoom,
  zones,
  onAssignZone,
}) => {
  const handleFloorChange = (delta: number) => {
    onUpdateRoom({ ...room, floor: room.floor + delta })
  }

  const currentZone = zones.find(z => z.id === room.zoneId)

  return (
    <div 
      className="absolute top-6 right-6 w-72 glass-panel rounded-3xl border-white/10 shadow-2xl animate-in slide-in-from-right-4 duration-300 overflow-hidden"
      style={{ zIndex: 100 }}
    >
      <div className="p-4 bg-primary/10 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-2 h-2 rounded-full shrink-0 bg-primary shadow-lg shadow-primary/50" />
          <h4 className="text-xs font-black uppercase tracking-widest truncate text-white">{room.name}</h4>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-5 space-y-6">
        <section>
          <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20 mb-3">Specifications</h5>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="space-y-1">
              <p className="text-[9px] text-white/40 uppercase font-bold">Width (m)</p>
              <div className="px-3 py-2 bg-black/40 border border-white/5 rounded-xl text-xs font-mono text-white/80">
                {room.width.toFixed(2)}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[9px] text-white/40 uppercase font-bold">Height (m)</p>
              <div className="px-3 py-2 bg-black/40 border border-white/5 rounded-xl text-xs font-mono text-white/80">
                {room.height.toFixed(2)}
              </div>
            </div>
          </div>
          <div className="p-3 bg-primary/5 rounded-xl border border-primary/10 flex items-center justify-between">
            <span className="text-[10px] text-white/40 uppercase font-bold">Total Area</span>
            <span className="text-sm font-mono font-bold text-primary">{(room.width * room.height).toFixed(2)} m²</span>
          </div>
        </section>

        <section>
          <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20 mb-3">Level assignment</h5>
          <div className="flex items-center justify-between p-3 bg-black/40 border border-white/5 rounded-2xl">
            <button 
              onClick={() => handleFloorChange(-1)}
              className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all"
            >
              -
            </button>
            <div className="text-center">
              <p className="text-[8px] text-white/20 uppercase font-black mb-0.5">Floor</p>
              <p className="text-sm font-black text-white">
                {room.floor === 0 ? 'B1' : room.floor > 0 ? `${room.floor}F` : `B${Math.abs(room.floor) + 1}`}
              </p>
            </div>
            <button 
              onClick={() => handleFloorChange(1)}
              className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all"
            >
              +
            </button>
          </div>
        </section>

        <section>
          <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20 mb-3">Zoning</h5>
          {currentZone && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-white/5 rounded-xl border border-white/5 animate-in fade-in zoom-in-95 duration-200">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: currentZone.color }} />
              <span className="text-[10px] font-black text-white uppercase tracking-widest">{currentZone.name}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onAssignZone(room.id, null)}
              className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${
                !room.zoneId 
                  ? 'bg-white/20 text-white' 
                  : 'bg-white/5 text-white/20 hover:text-white/40'
              }`}
            >
              NONE
            </button>
            {zones.map(zone => (
              <button
                key={zone.id}
                onClick={() => onAssignZone(room.id, zone.id)}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all border ${
                  room.zoneId === zone.id
                    ? 'text-white'
                    : 'text-white/20 hover:text-white/40 border-transparent'
                }`}
                style={{ 
                  backgroundColor: room.zoneId === zone.id ? zone.color : 'rgba(255,255,255,0.05)',
                  borderColor: room.zoneId === zone.id ? zone.color : 'transparent'
                }}
              >
                {zone.name}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20 mb-3">Position</h5>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-[9px] text-white/40 uppercase">X Coord</p>
              <div className="px-3 py-2 bg-black/40 border border-white/5 rounded-xl text-xs font-mono text-white/80">
                {(room.x || 0).toFixed(2)}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[9px] text-white/40 uppercase">Y Coord</p>
              <div className="px-3 py-2 bg-black/40 border border-white/5 rounded-xl text-xs font-mono text-white/80">
                {(room.y || 0).toFixed(2)}
              </div>
            </div>
          </div>
        </section>

        <div className="pt-2 flex gap-2">
          <button
            onClick={() => onToggleLock(room.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border transition-all text-[10px] font-bold ${
              room.locked 
              ? 'bg-primary/20 border-primary/40 text-primary shadow-lg shadow-primary/10' 
              : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10 hover:border-white/10'
            }`}
          >
            {room.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            {room.locked ? 'LOCKED' : 'UNLOCK'}
          </button>
          
          <button
            onClick={() => {
              onDeleteRoom(room.id)
              onClose()
            }}
            className="flex items-center justify-center p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-500 hover:bg-rose-500/20 transition-all shadow-lg shadow-rose-500/5"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="px-5 py-4 bg-white/[0.02] border-t border-white/5 text-center">
        <p className="text-[10px] text-white/20 uppercase tracking-[0.1em]">
          Express ID: <span className="font-mono">{room.id}</span>
        </p>
      </div>
    </div>
  )
}
