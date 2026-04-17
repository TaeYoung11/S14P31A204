import * as React from 'react'
import { useState, useEffect } from 'react'
import { Plus, Trash2, Lock, Unlock, Link, Info, Search, Bed, Utensils, Bath, Briefcase, Sofa, Navigation, Square } from 'lucide-react'
import { FloorProject, Room, RoomType, Zone } from '../../hooks/useFloorSimulation.ts'

interface RoomMatrixPanelProps {
  project: FloorProject
  currentFloor: number
  selectedRoomId: string | null
  onSelectRoom: (id: string | null) => void
  onUpdateAdjacency: (fromId: string, toId: string, strength: number) => void
  onToggleLock: (id: string) => void
  onAddRoom: (room: Omit<Room, 'id' | 'x' | 'y' | 'angle' | 'locked'>) => void
  onDeleteRoom: (id: string) => void
  zones: Zone[]
  onCreateZone: (name: string, color: string) => void
  onDeleteZone: (id: string) => void
  onAssignRoomToZone: (roomId: string, zoneId: string | null) => void
}

const ROOM_ICONS: Record<string, any> = {
  living: Sofa,
  bedroom: Bed,
  kitchen: Utensils,
  bathroom: Bath,
  office: Briefcase,
  corridor: Navigation,
  other: Square,
}

const ROOM_COLORS: Record<string, string> = {
  living: '#4d88e6',
  bedroom: '#9966cc',
  kitchen: '#f59e0b',
  bathroom: '#33b3b3',
  office: '#3399cc',
  corridor: '#8c8c8c',
  other: '#737373',
}
export const RoomMatrixPanel: React.FC<RoomMatrixPanelProps> = ({
  project,
  currentFloor,
  selectedRoomId,
  onSelectRoom,
  onUpdateAdjacency,
  onToggleLock,
  onAddRoom,
  onDeleteRoom,
  zones,
  onCreateZone,
  onDeleteZone,
  onAssignRoomToZone,
}) => {
  const [activeTab, setActiveTab] = useState<'rooms' | 'zones'>('rooms')
  const [isAdding, setIsAdding] = useState(false)
  const [isAddingZone, setIsAddingZone] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [newRoom, setNewRoom] = useState({
    name: '',
    type: 'living' as RoomType,
    width: 4,
    height: 4,
    floor: currentFloor,
  })
  const [newZone, setNewZone] = useState({ name: '', color: '#4d88e6' })

  // Sync newRoom floor with currentFloor when selector opens
  useEffect(() => {
    if (isAdding) setNewRoom(prev => ({ ...prev, floor: currentFloor }))
  }, [isAdding, currentFloor])

  const handleAddRoom = async () => {
    if (!newRoom.name || isSubmitting) return
    setIsSubmitting(true)
    try {
      await onAddRoom({ ...newRoom, floor: currentFloor })
      setIsAdding(false)
      setNewRoom({ name: '', type: 'living', width: 4, height: 4, floor: currentFloor })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCreateZone = () => {
    if (!newZone.name) return
    onCreateZone(newZone.name, newZone.color)
    setIsAddingZone(false)
    setNewZone({ name: '', color: '#4d88e6' })
  }

  const filteredRooms = project.rooms.filter(r => 
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.type.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort((a, b) => {
    // Current floor first, then others
    if (a.floor === currentFloor && b.floor !== currentFloor) return -1
    if (a.floor !== currentFloor && b.floor === currentFloor) return 1
    return b.floor - a.floor
  })

  const selectedRoom = project.rooms.find(r => r.id === selectedRoomId)

  return (
    <div className="w-full h-full flex flex-col min-h-0 animate-in fade-in slide-in-from-left-4 duration-500">
      {/* Header */}
      <div className="bg-white/[0.03] border-b border-white/5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
            Rooms & Adjacency
          </h3>
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="p-1 hover:bg-white/10 rounded-md text-primary transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-white/20 uppercase tracking-widest">
          {project.rooms.length} Rooms Total
        </p>

        {/* Tab Switcher */}
        <div className="flex bg-white/5 rounded-xl p-1 mt-4">
          <button
            onClick={() => setActiveTab('rooms')}
            className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${activeTab === 'rooms' ? 'bg-primary text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
          >
            ROOMS
          </button>
          <button
            onClick={() => setActiveTab('zones')}
            className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${activeTab === 'zones' ? 'bg-primary text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
          >
            ZONING
          </button>
        </div>

        {/* Search Bar - only for rooms */}
        {activeTab === 'rooms' && (
          <div className="mt-4 relative animate-in fade-in duration-300">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" />
            <input
              type="text"
              placeholder="Search rooms..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/5 rounded-xl pl-9 pr-4 py-2 text-[11px] text-white placeholder:text-white/20 focus:outline-none focus:border-primary/40 transition-all"
            />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Room List Section */}
        {activeTab === 'rooms' && (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6 animate-in slide-in-from-right-4 duration-300">
            {/* Add Room Form */}
            {isAdding && (
              <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 space-y-3 animate-in zoom-in-95 duration-200">
                {/* ... existing form ... */}
                <input
                  type="text"
                  placeholder="Room Name"
                  value={newRoom.name}
                  onChange={e => setNewRoom(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-primary"
                />
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[9px] text-white/40 uppercase">Width (m)</label>
                    <input
                      type="number"
                      value={newRoom.width}
                      onChange={e => setNewRoom(prev => ({ ...prev, width: Number(e.target.value) }))}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] text-white/40 uppercase">Height (m)</label>
                    <input
                      type="number"
                      value={newRoom.height}
                      onChange={e => setNewRoom(prev => ({ ...prev, height: Number(e.target.value) }))}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white"
                    />
                  </div>
                </div>
                <select
                  value={newRoom.type}
                  onChange={e => setNewRoom(prev => ({ ...prev, type: e.target.value as RoomType }))}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                >
                  <option value="living">Living Room</option>
                  <option value="bedroom">Bedroom</option>
                  <option value="kitchen">Kitchen</option>
                  <option value="bathroom">Bathroom</option>
                  <option value="office">Office</option>
                  <option value="corridor">Corridor</option>
                  <option value="other">Other</option>
                </select>
                <button
                  type="button"
                  onClick={handleAddRoom}
                  disabled={!newRoom.name || isSubmitting}
                  className="w-full py-2 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : (
                    'ADD ROOM'
                  )}
                </button>
              </div>
            )}

            {/* Room List */}
            <div className="space-y-2">
              {filteredRooms.map(room => {
                const Icon = ROOM_ICONS[room.type] || Square
                const isCurrentFloor = room.floor === currentFloor
                const zone = zones.find(z => z.id === room.zoneId)

                return (
                  <div
                    key={room.id}
                    onClick={() => onSelectRoom(room.id)}
                    className={`group relative flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                      selectedRoomId === room.id
                        ? 'bg-primary/20 border-primary/50 shadow-lg shadow-primary/10'
                        : isCurrentFloor
                          ? 'bg-white/[0.04] border-white/10 hover:border-white/20'
                          : 'bg-white/[0.01] border-transparent opacity-40 hover:opacity-100 hover:bg-white/[0.02]'
                    }`}
                  >
                    {/* Zone Indicator Bar */}
                    {zone && (
                      <div 
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-2/3 rounded-r-full"
                        style={{ backgroundColor: zone.color }}
                      />
                    )}

                    <div className="flex items-center gap-3 overflow-hidden">
                      <div
                        className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center bg-white/5 border border-white/5"
                        style={{ color: ROOM_COLORS[room.type] || '#737373' }}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="overflow-hidden text-left">
                        <div className="flex items-center gap-2">
                          <p className={`text-xs font-bold truncate ${selectedRoomId === room.id ? 'text-white' : 'text-white/80'}`}>
                            {room.name}
                          </p>
                          {zone && (
                            <span 
                              className="text-[7px] px-1 py-0.5 rounded-sm font-black uppercase tracking-tighter"
                              style={{ backgroundColor: zone.color + '20', color: zone.color }}
                            >
                              {zone.name}
                            </span>
                          )}
                          {!isCurrentFloor && (
                            <span className="text-[8px] px-1 bg-white/10 rounded text-white/40 font-mono">
                              {room.floor === 0 ? 'B1' : room.floor > 0 ? `${room.floor}F` : `B${Math.abs(room.floor) + 1}`}
                            </span>
                          )}
                        </div>
                        <p className="text-[9px] text-white/30 uppercase font-mono italic">
                          {(room.width * room.height).toFixed(1)} m² <span className="mx-1 text-white/10">|</span> {room.width} × {room.height}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          onToggleLock(room.id)
                        }}
                        className={`p-1.5 rounded-md hover:bg-white/10 ${room.locked ? 'text-primary' : 'text-white/20'}`}
                        title={room.locked ? "Unlock" : "Lock position"}
                      >
                        {room.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          onDeleteRoom(room.id)
                        }}
                        className="p-1.5 rounded-md hover:bg-rose-500/20 text-white/20 hover:text-rose-400"
                        title="Delete Room"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            {project.rooms.length === 0 && !isAdding && (
              <div className="flex flex-col items-center justify-center py-10 opacity-20">
                <Info className="w-8 h-8 mb-2" />
                <p className="text-[10px] uppercase font-bold text-center">No rooms created yet</p>
              </div>
            )}
          </div>
        )}

        {/* Zoning Management Section */}
        {activeTab === 'zones' && (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6 animate-in slide-in-from-left-4 duration-300">
            {/* Analytics Dashboard */}
            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Spatial Analytics</h4>
                <div className="px-2 py-0.5 bg-primary/20 rounded-full text-[8px] font-bold text-primary">
                  {project.rooms.length} Rooms
                </div>
              </div>

              {/* Area Distribution Chart */}
              <div className="space-y-2">
                <div className="flex justify-between text-[9px] text-white/40 uppercase font-black">
                  <span>Zone Distribution</span>
                  <span>Total {project.rooms.reduce((acc, r) => acc + (r.width * r.height), 0).toFixed(1)}m²</span>
                </div>
                <div className="flex h-2 w-full bg-white/5 rounded-full overflow-hidden">
                  {zones.map(zone => {
                    const zoneArea = project.rooms
                      .filter(r => r.zoneId === zone.id)
                      .reduce((acc, r) => acc + (r.width * r.height), 0)
                    const totalArea = project.rooms.reduce((acc, r) => acc + (r.width * r.height), 0)
                    const percentage = totalArea > 0 ? (zoneArea / totalArea) * 100 : 0
                    
                    if (percentage === 0) return null
                    return (
                      <div 
                        key={zone.id}
                        className="h-full transition-all duration-500"
                        style={{ width: `${percentage}%`, backgroundColor: zone.color }}
                        title={`${zone.name}: ${percentage.toFixed(1)}%`}
                      />
                    )
                  })}
                </div>
              </div>

              {/* Spatial Insight */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-2 bg-black/20 rounded-xl border border-white/5">
                  <p className="text-[8px] text-white/20 uppercase font-black mb-1">Public Ratio</p>
                  <p className="text-sm font-black text-white">
                    {(() => {
                      const publicRooms = project.rooms.filter(r => ['living', 'kitchen', 'corridor'].includes(r.type))
                      const publicArea = publicRooms.reduce((acc, r) => acc + (r.width * r.height), 0)
                      const totalArea = project.rooms.reduce((acc, r) => acc + (r.width * r.height), 0)
                      return totalArea > 0 ? `${Math.round((publicArea / totalArea) * 100)}%` : '0%'
                    })()}
                  </p>
                </div>
                <div className="p-2 bg-black/20 rounded-xl border border-white/5">
                  <p className="text-[8px] text-white/20 uppercase font-black mb-1">Efficiency</p>
                  <p className="text-sm font-black text-white">
                    {(() => {
                      const netArea = project.rooms.filter(r => r.type !== 'corridor').reduce((acc, r) => acc + (r.width * r.height), 0)
                      const totalArea = project.rooms.reduce((acc, r) => acc + (r.width * r.height), 0)
                      return totalArea > 0 ? `${Math.round((netArea / totalArea) * 100)}%` : '0%'
                    })()}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-[10px] text-white/40 font-black uppercase tracking-widest">Zone List</p>
              <button
                onClick={() => setIsAddingZone(!isAddingZone)}
                className="text-[10px] font-bold text-primary hover:text-primary-hover flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                NEW ZONE
              </button>
            </div>

            {isAddingZone && (
              <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 space-y-3 animate-in fade-in duration-200">
                <input
                  type="text"
                  placeholder="Zone Name (e.g. Public Zone)"
                  value={newZone.name}
                  onChange={e => setNewZone(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-primary"
                />
                <div className="flex items-center gap-3">
                  <div className="flex-1 space-y-1">
                    <label className="text-[8px] text-white/40 uppercase">Zone Color</label>
                    <input
                      type="color"
                      value={newZone.color}
                      onChange={e => setNewZone(prev => ({ ...prev, color: e.target.value }))}
                      className="w-full h-8 bg-transparent border-none cursor-pointer"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsAddingZone(false)}
                    className="flex-1 py-1.5 bg-white/5 hover:bg-white/10 text-white/40 text-[10px] font-bold rounded-lg"
                  >
                    CANCEL
                  </button>
                  <button
                    onClick={handleCreateZone}
                    className="flex-1 py-1.5 bg-primary hover:bg-primary-hover text-white text-[10px] font-bold rounded-lg"
                  >
                    SAVE ZONE
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {zones.length === 0 ? (
                <div className="text-center py-10 opacity-20 italic">
                  <p className="text-[10px]">No functional zones defined.</p>
                </div>
              ) : (
                zones.map(zone => {
                  const zoneRooms = project.rooms.filter(r => r.zoneId === zone.id)
                  
                  return (
                    <div key={zone.id} className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: zone.color }} />
                          <h4 className="text-[11px] font-black text-white/80 uppercase tracking-tighter">{zone.name}</h4>
                        </div>
                        <button 
                          onClick={() => onDeleteZone(zone.id)}
                          className="p-1 text-white/10 hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[9px] text-white/20 uppercase font-black">
                          <span>Rooms in Zone</span>
                          <span>{zoneRooms.length}</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {zoneRooms.length === 0 ? (
                            <span className="text-[8px] text-white/10 italic">Empty zone. Assign rooms via inspector.</span>
                          ) : (
                            zoneRooms.map(r => (
                              <span key={r.id} className="px-1.5 py-0.5 bg-white/5 rounded border border-white/5 text-[8px] text-white/40">
                                {r.name}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            
            <p className="text-[9px] text-white/30 italic text-center px-4">
              Tip: Select a room on the canvas and use the inspector to assign it to a zone.
            </p>
          </div>
        )}

        {/* Adjacency Management Section (Scrollable independently or integrated carefully) */}
        {selectedRoom && (
          <div className="h-[40%] min-h-[250px] flex flex-col border-t border-white/10 bg-black/20 animate-in slide-in-from-bottom-4 duration-300">
            <div className="p-4 flex items-center justify-between bg-white/[0.02] border-b border-white/5">
              <div className="flex items-center gap-2 text-primary">
                <Link className="w-4 h-4" />
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em]">Adjacency Matrix</h4>
              </div>
              <span className="text-[9px] text-white/40 uppercase font-mono px-2 py-0.5 bg-white/5 rounded-full">
                Target: {selectedRoom.name}
              </span>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 pb-32 space-y-4">
              {project.rooms
                .filter(r => r.id !== selectedRoomId)
                .map(other => {
                  const adj = project.adjacency.find(
                    a => (a.from_room_id === selectedRoomId && a.to_room_id === other.id) ||
                         (a.from_room_id === other.id && a.to_room_id === selectedRoomId)
                  )
                  const strength = adj ? adj.strength : 0

                  return (
                    <div key={other.id} className="space-y-1.5 bg-white/[0.02] p-2 rounded-lg border border-white/5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-white/40 uppercase truncate max-w-[120px]">
                          {other.name}
                        </span>
                        <span className="text-[10px] font-mono text-primary font-bold">
                          {Math.round(strength * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={strength}
                        onChange={e => onUpdateAdjacency(selectedRoomId!, other.id, parseFloat(e.target.value))}
                        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                    </div>
                  )
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
