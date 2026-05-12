// 뷰어 모드에서 렌더링 이미지와 줌 UI를 표시한다.
import { useEffect, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { useProjectViewRender, VIEW_RENDER_PRESETS } from '../../hooks/useProjectViewRender'
import { useFloatingPanelDrag } from '../../hooks/useFloatingPanelDrag'
import RenderHistorySidebar from './RenderHistorySidebar'

interface RealisticViewerProps {
  projectId?: string
}

const RENDER_PANEL_INITIAL_GAP_PX = 40

const getRenderPanelInitialOffset = () => ({
  x: RENDER_PANEL_INITIAL_GAP_PX,
  y: RENDER_PANEL_INITIAL_GAP_PX,
})

export function RealisticViewer({ projectId }: RealisticViewerProps) {
  const activePreset = VIEW_RENDER_PRESETS[0]
  const [prompt] = useState(activePreset.request.prompt)
  const [negativePrompt] = useState(activePreset.request.negativePrompt ?? '')
  const [timeOfDay, setTimeOfDay] = useState('DAY')
  const [season, setSeason] = useState('SPRING')
  const [imageSize] = useState(activePreset.request.width ?? 1024)
  const [zoom, setZoom] = useState(1)
  const {
    panelRef: renderPanelRef,
    offset: renderPanelOffset,
    setOffset: setRenderPanelOffset,
    startDrag: startRenderPanelDrag,
  } = useFloatingPanelDrag(getRenderPanelInitialOffset(), 12)
  const {
    imageUrl,
    renders,
    errorMessage,
    isRequesting,
    requestRender,
  } = useProjectViewRender(projectId, 0)
  const displayedImageUrl = imageUrl ?? '/mock/rendering_mock.png'
  const canRequestRender = Boolean(projectId && prompt.trim() && !isRequesting)

  useEffect(() => {
    const panelEl = renderPanelRef.current
    const parentEl =
      (panelEl?.offsetParent as HTMLElement | null) ??
      panelEl?.parentElement
    if (!panelEl || !parentEl) return

    const parentRect = parentEl.getBoundingClientRect()
    const panelRect = panelEl.getBoundingClientRect()
    setRenderPanelOffset({
      x: Math.max(RENDER_PANEL_INITIAL_GAP_PX, parentRect.width - panelRect.width - RENDER_PANEL_INITIAL_GAP_PX),
      y: RENDER_PANEL_INITIAL_GAP_PX,
    })
  }, [renderPanelRef, setRenderPanelOffset])

  const handleRequestRender = () => {
    void requestRender({
      prompt: prompt.trim(),
      negativePrompt: negativePrompt.trim() || undefined,
      style: {
        timeOfDay,
        viewpoint: null,
        season: null,
        weather: null,
      },
      sourceImageStorageUrl: null,
      width: imageSize,
      height: imageSize,
    })
  }

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(2.5, Number((prev + 0.15).toFixed(2))))
  }

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(1, Number((prev - 0.15).toFixed(2))))
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-[#0A0A0B] animate-in fade-in duration-700">
      <div className="absolute inset-0">
        <img
          src={displayedImageUrl}
          alt="프로젝트 렌더링 이미지"
          className="h-full w-full object-cover opacity-90 transition-transform duration-200 ease-out"
          style={{ transform: `scale(${zoom})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />
      </div>

      <RenderHistorySidebar
        panelRef={renderPanelRef}
        offset={renderPanelOffset}
        renders={renders}
        timeOfDay={timeOfDay}
        season={season}
        isRequesting={isRequesting}
        canRequestRender={canRequestRender}
        errorMessage={errorMessage}
        onTimeOfDayChange={setTimeOfDay}
        onSeasonChange={setSeason}
        onRequestRender={handleRequestRender}
        onDragStart={startRenderPanelDrag}
      />

      <div className="absolute bottom-12 left-12 flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-500 delay-300">
        <div className="flex flex-col overflow-hidden rounded-[20px] border border-white/10 bg-[#1C1C1E]/60 shadow-2xl backdrop-blur-xl">
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoom >= 2.5}
            aria-label="확대"
            className="border-b border-white/5 p-3.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={22} />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoom <= 1}
            aria-label="축소"
            className="p-3.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Minus size={22} />
          </button>
        </div>
      </div>
    </div>
  )
}
