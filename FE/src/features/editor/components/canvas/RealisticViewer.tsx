// 뷰어 모드에서 렌더링 이미지와 줌 UI를 표시한다.
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrowLeft, ArrowRight, Minus, Plus } from 'lucide-react'
import { useProjectViewRender, VIEW_RENDER_PRESETS } from '../../hooks/useProjectViewRender'
import { useFloatingPanelDrag } from '../../hooks/useFloatingPanelDrag'
import { useCtrlWheelZoom } from '../../hooks/useCtrlWheelZoom'
import { useSpacePanning } from '../../hooks/useSpacePanning'
import RenderHistorySidebar from './RenderHistorySidebar'

interface RealisticViewerProps {
  projectId?: string
}

const RENDER_PANEL_INITIAL_GAP_PX = 40

const getRenderPanelInitialOffset = () => ({
  x: RENDER_PANEL_INITIAL_GAP_PX,
  y: RENDER_PANEL_INITIAL_GAP_PX,
})

type RenderImageView = 'frontLeft' | 'frontRight'

interface RenderViewState {
  renderId: string | null
  view: RenderImageView
}

interface PanState {
  renderId: string | null
  offset: { x: number; y: number }
}

const clampPanOffset = (value: number, zoom: number, viewportSize: number): number => {
  if (zoom <= 1) return 0
  const maxOffset = (viewportSize * (zoom - 1)) / 2
  return Math.max(-maxOffset, Math.min(maxOffset, value))
}

export function RealisticViewer({ projectId }: RealisticViewerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const activePreset = VIEW_RENDER_PRESETS[0]
  const [timeOfDay, setTimeOfDay] = useState('DAY')
  const [season, setSeason] = useState('SPRING')
  const [imageSize] = useState(activePreset.request.width ?? 1024)
  const [zoom, setZoom] = useState(1)
  const [panState, setPanState] = useState<PanState>({ renderId: null, offset: { x: 0, y: 0 } })
  const [renderViewState, setRenderViewState] = useState<RenderViewState>({ renderId: null, view: 'frontLeft' })
  const isSpacePressed = useSpacePanning()
  const panDragRef = useRef<{
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)
  const {
    panelRef: renderPanelRef,
    offset: renderPanelOffset,
    setOffset: setRenderPanelOffset,
    startDrag: startRenderPanelDrag,
  } = useFloatingPanelDrag(getRenderPanelInitialOffset(), 12)
  const {
    imageUrl,
    renderUrls,
    renders,
    selectedRenderId,
    errorMessage,
    isRequesting,
    requestRender,
    selectRender,
  } = useProjectViewRender(projectId, 0)
  const activeRenderView = renderViewState.renderId === selectedRenderId ? renderViewState.view : 'frontLeft'
  const panOffset = zoom > 1 && panState.renderId === selectedRenderId ? panState.offset : { x: 0, y: 0 }
  const displayedImageUrl = (
    activeRenderView === 'frontRight'
      ? renderUrls?.frontDiagonalRightUrl
      : renderUrls?.frontDiagonalLeftUrl
  ) ?? imageUrl ?? '/mock/rendering_mock.png'
  const canUseFrontLeftView = Boolean(renderUrls?.frontDiagonalLeftUrl)
  const canUseFrontRightView = Boolean(renderUrls?.frontDiagonalRightUrl)
  const canRequestRender = Boolean(projectId && !isRequesting)
  const isPanEnabled = zoom > 1 && isSpacePressed

  const handleWheelZoom = useCallback((factor: number) => {
    setZoom((prev) => Math.max(1, Math.min(2.5, Number((prev * factor).toFixed(2)))))
  }, [])

  useCtrlWheelZoom({
    rootRef,
    onWheelZoom: handleWheelZoom,
  })

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
      prompt: 'default',
      negativePrompt: 'default',
      style: {
        timeOfDay,
        viewpoint: null,
        season,
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

  const handleImageDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isPanEnabled) return

    panDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: panOffset.x,
      originY: panOffset.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleImageDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = panDragRef.current
    if (!dragState || !isPanEnabled) return

    const rect = event.currentTarget.getBoundingClientRect()
    const nextX = dragState.originX + event.clientX - dragState.startX
    const nextY = dragState.originY + event.clientY - dragState.startY
    setPanState({
      renderId: selectedRenderId,
      offset: {
        x: clampPanOffset(nextX, zoom, rect.width),
        y: clampPanOffset(nextY, zoom, rect.height),
      },
    })
  }

  const handleImageDragEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!panDragRef.current) return

    panDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 flex items-center justify-center overflow-hidden bg-[#0A0A0B] animate-in fade-in duration-700"
    >
      <div
        className={`absolute inset-0 ${isPanEnabled ? 'cursor-grab active:cursor-grabbing' : ''}`}
        onPointerDown={handleImageDragStart}
        onPointerMove={handleImageDragMove}
        onPointerUp={handleImageDragEnd}
        onPointerCancel={handleImageDragEnd}
      >
        <img
          src={displayedImageUrl}
          alt="프로젝트 렌더링 이미지"
          draggable={false}
          className="h-full w-full select-none object-cover opacity-90 transition-transform duration-200 ease-out"
          style={{ transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) scale(${zoom})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />
      </div>

      <RenderHistorySidebar
        panelRef={renderPanelRef}
        offset={renderPanelOffset}
        renders={renders}
        selectedRenderId={selectedRenderId}
        timeOfDay={timeOfDay}
        season={season}
        isRequesting={isRequesting}
        canRequestRender={canRequestRender}
        errorMessage={errorMessage}
        onTimeOfDayChange={setTimeOfDay}
        onSeasonChange={setSeason}
        onRequestRender={handleRequestRender}
        onSelectRender={(renderId) => {
          void selectRender(renderId)
        }}
        onDragStart={startRenderPanelDrag}
      />

      <div className="absolute bottom-12 left-1/2 flex -translate-x-1/2 items-center gap-3">
        <button
          type="button"
          onClick={() => setRenderViewState({ renderId: selectedRenderId, view: 'frontLeft' })}
          disabled={!canUseFrontLeftView}
          aria-label="좌측 시점 보기"
          className={`flex h-12 w-12 items-center justify-center rounded-full border border-white/10 shadow-2xl backdrop-blur-xl transition-colors disabled:cursor-not-allowed disabled:bg-[#1C1C1E]/35 disabled:text-white/30 ${
            canUseFrontLeftView && activeRenderView === 'frontLeft'
              ? 'bg-white text-[#111113]'
              : 'bg-[#1C1C1E]/70 text-white/75 hover:bg-white/10 hover:text-white'
          }`}
        >
          <ArrowLeft size={22} />
        </button>
        <button
          type="button"
          onClick={() => setRenderViewState({ renderId: selectedRenderId, view: 'frontRight' })}
          disabled={!canUseFrontRightView}
          aria-label="우측 시점 보기"
          className={`flex h-12 w-12 items-center justify-center rounded-full border border-white/10 shadow-2xl backdrop-blur-xl transition-colors disabled:cursor-not-allowed disabled:bg-[#1C1C1E]/35 disabled:text-white/30 ${
            canUseFrontRightView && activeRenderView === 'frontRight'
              ? 'bg-white text-[#111113]'
              : 'bg-[#1C1C1E]/70 text-white/75 hover:bg-white/10 hover:text-white'
          }`}
        >
          <ArrowRight size={22} />
        </button>
      </div>

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
