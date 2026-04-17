import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Maximize2, MousePointer2, Camera } from 'lucide-react'
import * as OBCF from '@thatopen/components-front'
import type { ModelIdMap } from '@thatopen/components'
import { useBIMModel } from '../../hooks/useBIMModel'
import { useStore } from '../../stores/useStore'
import { RenderPreviewModal } from '../RenderPreviewModal/RenderPreviewModal'

const SUPPORTED_DRAW_TOOLS = new Set(['wall', 'slab', 'column', 'beam', 'door', 'window', 'stair', 'roof', 'move'])

export const Viewer3D = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const {
    components,
    isReady,
    loadIFC,
    getElementProperties,
    pickGroundPoint,
    setPreviewGhost,
    clearPreviewGhost,
    setTargetMarker,
    clearTargetMarker,
    captureScreenshot,
  } = useBIMModel(containerRef)

  const [isRenderModalOpen, setIsRenderModalOpen] = useState(false)

  const currentProject = useStore((state) => state.currentProject)
  const authoringSession = useStore((state) => state.authoringSession)
  const activeTool = useStore((state) => state.activeTool)
  const activeStoreyGuid = useStore((state) => state.activeStoreyGuid)
  const authoringDraft = useStore((state) => state.authoringDraft)
  const setAuthoringDraft = useStore((state) => state.setAuthoringDraft)
  const previews = useStore((state) => state.previews)
  const presence = useStore((state) => state.presence)
  const locks = useStore((state) => state.locks)
  const setSelectedId = useStore((state) => state.setSelectedId)
  const setSelectedElementProperties = useStore((state) => state.setSelectedElementProperties)

  const activePreview = useMemo(() => {
    if (!authoringSession) return null
    return previews.find((preview) => preview.session_id === authoringSession.session_id) ?? null
  }, [authoringSession, previews])

  const activeStorey = useMemo(
    () => currentProject?.meta_info?.storeys?.find((item) => item.guid === activeStoreyGuid) ?? null,
    [activeStoreyGuid, currentProject],
  )
  const activeStoreyElevationMm = typeof activeStorey?.elevation === 'number' ? activeStorey.elevation : 0

  useEffect(() => {
    if (isReady && currentProject?.ifc_uploaded) {
      void loadIFC(`http://localhost:8000/api/v1/projects/${currentProject.id}/model`)
    }
  }, [currentProject, isReady, loadIFC])

  useEffect(() => {
    if (!activePreview) {
      clearPreviewGhost()
      return
    }
    setPreviewGhost(activePreview)
  }, [activePreview, clearPreviewGhost, setPreviewGhost])

  useEffect(() => {
    if (activeTool === 'move' && authoringDraft.position) {
      setTargetMarker(authoringDraft.position)
      return
    }
    clearTargetMarker()
  }, [activeTool, authoringDraft.position, clearTargetMarker, setTargetMarker])

  useEffect(() => {
    if (!isReady || !components) return

    try {
      const highlighter = components.get(OBCF.Highlighter)
      if (!highlighter.events?.select) return

      const handleHighlight = async (selection: ModelIdMap) => {
        const ids = Object.values(selection)[0]
        const id = ids?.values().next().value
        if (typeof id !== 'number') return

        const props = await getElementProperties(id)
        const globalId = props?.GlobalId
        const guid =
          globalId &&
          !Array.isArray(globalId) &&
          typeof globalId === 'object' &&
          'value' in globalId
            ? String(globalId.value)
            : typeof props?.__guid === 'string'
              ? props.__guid
              : null

        setSelectedId(guid ?? id.toString())
        setSelectedElementProperties((props as Record<string, unknown>) ?? null)
      }

      highlighter.events.select.onHighlight.add(handleHighlight)
      return () => {
        highlighter.events.select.onHighlight.remove(handleHighlight)
      }
    } catch (error) {
      console.error('Failed to setup highlighter events:', error)
    }
  }, [components, getElementProperties, isReady, setSelectedElementProperties, setSelectedId])

  const handleCanvasClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!currentProject?.ifc_uploaded || !SUPPORTED_DRAW_TOOLS.has(activeTool)) return

    const point = pickGroundPoint(event.clientX, event.clientY, activeStoreyElevationMm)
    if (!point) return

    if (activeTool === 'wall') {
      if (!authoringDraft.start || authoringDraft.end) {
        setAuthoringDraft({ start: point })
      } else {
        setAuthoringDraft({ ...authoringDraft, end: point })
      }
      return
    }

    setAuthoringDraft({ position: point })
  }

  return (
    <div className="w-full h-full flex flex-col bg-[#050505] relative group">
      <div
        ref={containerRef}
        className="w-full h-full outline-none canvas-container"
        onClick={handleCanvasClick}
      />

      {!currentProject?.ifc_uploaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-10">
          <div className="p-8 rounded-3xl bg-white/5 border border-white/10 flex flex-col items-center">
            <Box className="w-16 h-16 text-primary mb-6 animate-bounce" />
            <h2 className="text-xl font-bold mb-2">No IFC model available</h2>
            <p className="text-white/40 text-sm mb-6">Upload an IFC file or create a blank IFC4 project.</p>
          </div>
        </div>
      )}

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 p-2 glass-panel rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 shadow-2xl z-20">
        <button className="p-3 glass-button rounded-xl text-primary" title="Select Element">
          <MousePointer2 className="w-5 h-5" />
        </button>
        <div className="w-[1px] h-6 bg-white/10 mx-1" />
        <button className="p-3 glass-button rounded-xl" title="Maximize">
          <Maximize2 className="w-5 h-5" />
        </button>

        <div className="w-[1px] h-6 bg-white/10 mx-1" />
        
        <button
          className="p-3 glass-button rounded-xl text-primary hover:bg-white/10 transition-colors"
          title="Photorealistic Render"
          onClick={() => setIsRenderModalOpen(true)}
          disabled={!currentProject?.ifc_uploaded}
        >
          <Camera className="w-5 h-5" />
        </button>
      </div>

      <div className="absolute top-6 left-6 flex flex-col gap-2 z-20">
        <div className="glass-panel px-4 py-2 rounded-full text-[10px] font-bold tracking-widest flex items-center gap-2 uppercase">
          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
          THAT OPEN ENGINE ACTIVE
        </div>
        {currentProject && (
          <div className="glass-panel px-4 py-2 rounded-full text-[10px] font-bold tracking-widest flex items-center gap-2 uppercase text-white/60">
            PROJECT: {currentProject.name}
          </div>
        )}
        {currentProject?.ifc_uploaded && (
          <div className="glass-panel px-4 py-2 rounded-full text-[10px] font-bold tracking-widest uppercase text-sky-200">
            PLACEMENT PLANE: {activeStorey?.name ?? 'Default'} / Z {Math.round(activeStoreyElevationMm)} mm
          </div>
        )}
        {SUPPORTED_DRAW_TOOLS.has(activeTool) && (
          <div className="glass-panel px-4 py-2 rounded-full text-[10px] font-bold tracking-widest uppercase text-amber-300">
            {activeTool === 'wall'
              ? authoringDraft.start && !authoringDraft.end
                ? 'Pick wall end point'
                : 'Pick wall start point'
              : activeTool === 'move'
                ? authoringDraft.position
                  ? `Move target: ${Math.round(authoringDraft.position.x)}, ${Math.round(authoringDraft.position.y)}, ${Math.round(authoringDraft.position.z)} mm`
                  : 'Click a new target point or a new host wall zone'
              : activeTool === 'door' || activeTool === 'window'
                ? `Click on the host wall zone to place ${activeTool}`
                : `Click to place ${activeTool}`}
          </div>
        )}
        {activeTool === 'rotate' && (
          <div className="glass-panel px-4 py-2 rounded-full text-[10px] font-bold tracking-widest uppercase text-amber-300">
            Select an element, then set a Z rotation in the panel
          </div>
        )}
      </div>

      <div className="absolute top-6 right-6 flex flex-col gap-2 z-20 items-end">
        <div className="glass-panel px-4 py-2 rounded-full text-[10px] font-bold tracking-widest uppercase text-white/70">
          COLLABORATORS: {presence.length}
        </div>
        <div className="glass-panel px-4 py-2 rounded-full text-[10px] font-bold tracking-widest uppercase text-white/50">
          LOCKS: {locks.length}
        </div>
      </div>

      {isRenderModalOpen && currentProject && (
        <RenderPreviewModal
          projectId={currentProject.id}
          onClose={() => setIsRenderModalOpen(false)}
          captureScreenshot={captureScreenshot}
        />
      )}
    </div>
  )
}
