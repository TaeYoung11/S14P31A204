import { useState, useEffect, useRef, useCallback } from 'react'

export type RoomType = 'living' | 'bedroom' | 'kitchen' | 'bathroom' | 'office' | 'corridor' | 'other'

export interface Room {
  id: string
  name: string
  type: RoomType
  width: number
  height: number
  floor: number
  x: number | null
  y: number | null
  angle: number
  locked: boolean
  zoneId?: string | null
}

export interface Zone {
  id: string
  name: string
  color: string
}

export interface AdjacencyEntry {
  from_room_id: string
  to_room_id: string
  strength: number
}

export interface FloorProject {
  id: string
  name: string
  rooms: Room[]
  adjacency: AdjacencyEntry[]
  zones?: Zone[]
  boundaries: Array<{ floor: number; polygon: [number, number][] }>
}

export interface SimulationState {
  running: boolean
  energy: number
  converged: boolean
  iterationCount: number
}

export interface CreativeSettings {
  viewMode: 'rigid' | 'organic'
  traceImage: string | null
  traceOpacity: number
  physics: {
    gravity: number
    friction: number
    collisionStrength: number
    linkDistanceMultiplier: number
  }
}

export function useFloorSimulation(projectId: string | null) {
  const [project, setProject] = useState<FloorProject | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [simulation, setSimulation] = useState<SimulationState>({
    running: false,
    energy: Infinity,
    converged: false,
    iterationCount: 0,
  })
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [creativeSettings, setCreativeSettings] = useState<CreativeSettings>({
    viewMode: 'rigid',
    traceImage: null,
    traceOpacity: 0.5,
    physics: {
      gravity: -120,
      friction: 0.0228,
      collisionStrength: 1,
      linkDistanceMultiplier: 1,
    }
  })
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)

  const fetchProject = useCallback(async () => {
    if (!projectId) return
    setIsLoading(true)
    try {
      const res = await fetch(`/api/v1/floor/projects/${projectId}`)
      if (res.ok) {
        const data = await res.json()
        setProject(data)
      }
    } catch (error) {
      console.error('Failed to fetch floor project:', error)
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  const connectWS = useCallback(() => {
    if (!projectId) return

    // Prevent multiple simultaneous connections
    if (wsRef.current && (wsRef.current.readyState === WebSocket.CONNECTING || wsRef.current.readyState === WebSocket.OPEN)) {
      return
    }

    // Vite proxy '/floor' handles ws://localhost:8000
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const wsUrl = `${protocol}//${host}/floor/projects/${projectId}/ws`
    
    const ws = new WebSocket(wsUrl)

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'room_update') {
        setProject((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            rooms: prev.rooms.map((r) =>
              r.id === data.room_id ? { ...r, x: data.x, y: data.y, locked: true } : r
            ),
          }
        })
      }
    }

    ws.onclose = () => {
      reconnectTimerRef.current = window.setTimeout(connectWS, 3000)
    }

    wsRef.current = ws
  }, [projectId])

  useEffect(() => {
    fetchProject()
    connectWS()
    return () => {
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
    }
  }, [connectWS, fetchProject])

  const saveProject = useCallback(async (updatedProject: FloorProject) => {
    if (!projectId) return
    try {
      await fetch(`/api/v1/floor/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProject),
      })
    } catch (error) {
      console.error('Failed to save floor project:', error)
    }
  }, [projectId])

  const startSimulation = useCallback(async () => {
    if (!projectId || !project) return
    setSimulation((prev) => ({ ...prev, running: true, iterationCount: 0 }))
    
    try {
      const res = await fetch(`/api/v1/floor/projects/${projectId}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, iterations: 300 }),
      })
      
      if (res.ok) {
        const result = await res.json()
        setProject((prev) => (prev ? { ...prev, rooms: result.rooms } : prev))
        setSimulation({
          running: false,
          energy: result.energy,
          converged: result.converged,
          iterationCount: 300,
        })
      }
    } catch (error) {
      console.error('Simulation failed:', error)
    } finally {
      setSimulation((prev) => ({ ...prev, running: false }))
    }
  }, [projectId, project])

  const dragRoom = useCallback((roomId: string, x: number, y: number) => {
    setProject((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        rooms: prev.rooms.map((r) =>
          r.id === roomId ? { ...r, x, y, locked: true } : r
        ),
      }
    })
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'room_drag', room_id: roomId, x, y }))
    }
  }, [])

  const toggleLock = useCallback((roomId: string) => {
    setProject((prev) => {
      if (!prev) return prev
      const newRooms = prev.rooms.map((r) =>
        r.id === roomId ? { ...r, locked: !r.locked } : r
      )
      const next = { ...prev, rooms: newRooms }
      // Side effect should be outside setter, but for quick sync we keep it 
      // or move to a useEffect. For now, calling it after return is better.
      setTimeout(() => saveProject(next), 0) 
      return next
    })
  }, [saveProject])

  const updateAdjacency = useCallback((fromId: string, toId: string, strength: number) => {
    setProject((prev) => {
      if (!prev) return prev
      const filtered = prev.adjacency.filter(
        (a) =>
          !(a.from_room_id === fromId && a.to_room_id === toId) &&
          !(a.from_room_id === toId && a.to_room_id === fromId)
      )
      const next = {
        ...prev,
        adjacency: strength > 0 ? [...filtered, { from_room_id: fromId, to_room_id: toId, strength }] : filtered,
      }
      setTimeout(() => saveProject(next), 0)
      return next
    })
  }, [saveProject])

  const addRoom = useCallback(async (room: Omit<Room, 'id' | 'x' | 'y' | 'angle' | 'locked'>) => {
    if (!projectId) return
    const newRoom: Room = {
      ...room,
      id: Math.random().toString(36).slice(2, 11),
      x: (Math.random() - 0.5) * 5,
      y: (Math.random() - 0.5) * 5,
      angle: 0,
      locked: false,
    }

    let updatedProject: FloorProject | null = null
    setProject((prev) => {
      if (!prev) return prev
      updatedProject = { ...prev, rooms: [...prev.rooms, newRoom] }
      return updatedProject
    })

    if (updatedProject) {
      await saveProject(updatedProject)
    }
    return newRoom.id
  }, [projectId, saveProject])

  const deleteRoom = useCallback(async (roomId: string) => {
    if (!projectId) return
    
    let updatedProject: FloorProject | null = null
    setProject((prev) => {
      if (!prev) return prev
      updatedProject = {
        ...prev,
        rooms: prev.rooms.filter(r => r.id !== roomId),
        adjacency: prev.adjacency.filter(a => a.from_room_id !== roomId && a.to_room_id !== roomId)
      }
      return updatedProject
    })

    if (updatedProject) {
      await saveProject(updatedProject)
    }
    if (selectedRoomId === roomId) setSelectedRoomId(null)
  }, [projectId, saveProject, selectedRoomId])

  const updateRoom = useCallback(async (updatedRoom: Room) => {
    if (!projectId) return
    
    let updatedProject: FloorProject | null = null
    setProject((prev) => {
      if (!prev) return prev
      updatedProject = {
        ...prev,
        rooms: prev.rooms.map(r => r.id === updatedRoom.id ? updatedRoom : r)
      }
      return updatedProject
    })

    if (updatedProject) {
      await saveProject(updatedProject)
    }
  }, [projectId, saveProject])

  const updateCreativeSettings = useCallback((settings: Partial<CreativeSettings>) => {
    setCreativeSettings(prev => ({
      ...prev,
      ...settings,
      physics: settings.physics ? { ...prev.physics, ...settings.physics } : prev.physics
    }))
  }, [])

  const uploadTraceImage = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      setCreativeSettings(prev => ({ ...prev, traceImage: e.target?.result as string }))
    }
    reader.readAsDataURL(file)
  }, [])

  const createZone = useCallback(async (name: string, color: string) => {
    if (!projectId) return
    const newZone: Zone = {
      id: Math.random().toString(36).slice(2, 11),
      name,
      color,
    }
    
    setProject(prev => {
      if (!prev) return prev
      const next = { ...prev, zones: [...(prev.zones || []), newZone] }
      setTimeout(() => saveProject(next), 0)
      return next
    })
    return newZone.id
  }, [projectId, saveProject])

  const assignRoomToZone = useCallback(async (roomId: string, zoneId: string | null) => {
    if (!projectId) return
    setProject(prev => {
      if (!prev) return prev
      const next = {
        ...prev,
        rooms: prev.rooms.map(r => r.id === roomId ? { ...r, zoneId } : r)
      }
      setTimeout(() => saveProject(next), 0)
      return next
    })
  }, [projectId, saveProject])

  const deleteZone = useCallback(async (zoneId: string) => {
    if (!projectId) return
    setProject(prev => {
      if (!prev) return prev
      const next = {
        ...prev,
        zones: (prev.zones || []).filter(z => z.id !== zoneId),
        rooms: prev.rooms.map(r => r.zoneId === zoneId ? { ...r, zoneId: null } : r)
      }
      setTimeout(() => saveProject(next), 0)
      return next
    })
  }, [projectId, saveProject])

  return {
    project,
    setProject,
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
    refresh: fetchProject
  }
}
