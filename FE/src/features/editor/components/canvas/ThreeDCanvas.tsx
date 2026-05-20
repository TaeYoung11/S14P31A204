/**
 * ThreeDCanvas — 3D 편집 캔버스 루트 컴포넌트
 *
 * ThatOpenIfcCanvas(IFC 뷰어)와 FloorPlan3DCanvas(로컬 3D) 중 하나를 렌더링하고,
 * 라이브러리 패널·그리드 오버레이·협업 모드 오버레이를 조합한다.
 *
 * 렌더링 우선순위:
 *  1. ifcUrl이 없고 localFloorData가 있으면 → FloorPlan3DCanvas
 *  2. 그 외 → ThatOpenIfcCanvas (ifcUrl 없을 시 mock IFC로 폴백)
 */
import { useCallback, useRef, useState } from 'react'
import type { CommentPin3DCreatePosition, FloorCommentPin, FloorLayer, FloorLayerOverlay, FloorRoom, IfcElementChange, IfcElementInfo } from '../../types'
import type { IfcStoreyInfo } from './thatopen/ifcPropertyParser'
import { useCtrlWheelZoom } from '../../hooks/useCtrlWheelZoom'
import ThreeDCanvasCollaborationOverlay from './ThreeDCanvasCollaborationOverlay'
import ThreeDCanvasScene from './ThreeDCanvasScene'
import ThreeDLibraryPanel from './ThreeDLibraryPanel'
import type { FloorPlan3DData } from '../../utils/floorPlanTo3D'
import { DEFAULT_MOCK_IFC_URL } from './threeDCanvas.utils'
import type { ThreeDCameraViewPresetCommand } from '@/pages/editor/components/canvas-content/buildCanvasSectionProps'
import { useThreeDLibraryDrop } from './useThreeDLibraryDrop'
import type { ThreeDLibraryPreset } from './threeDLibrary.types'

type ThreeDCoordinates = { x: number; y: number; z: number }

/** ThreeDCanvas 컴포넌트 props */
interface ThreeDCanvasProps {
  projectId?: string | null
  /** WS 또는 초기 로드에서 발급된 IFC presigned URL */
  ifcUrl?: string | null
  sitePoints?: number[]
  isCollaborationMode?: boolean
  commentPins?: FloorCommentPin[]
  selectedPinId?: string | null
  currentUserId?: string | null
  onPinClick?: (id: string) => void
  onPinCreate?: (x: number, y: number, content?: string, threeDPosition?: CommentPin3DCreatePosition) => void
  onPinDelete?: (id: string) => void
  deletingPinId?: string | null
  /** 라이브러리 패널 표시 여부 */
  isLibraryOpen?: boolean
  onToggleLibrary?: () => void
  isGridVisible?: boolean
  rooms?: FloorRoom[]
  floorLayers?: FloorLayer[]
  activeFloorLayerId?: string | null
  overlayLayers?: FloorLayerOverlay[]
  /** 현재 줌 스케일 (1.0 = 100%) */
  scale?: number
  selectedId?: string | null
  preferredSelectedElementId?: string | null
  onSelect?: (id: string | null) => void
  /** 현재 선택 도구 (selection / hand / rotate / scale) */
  selectedTool?: string
  onWheelZoom?: (factor: number) => void
  isRotationLocked?: boolean
  ifcElementChanges?: IfcElementChange[]
  selectedIfcElement?: IfcElementInfo | null
  threeDDeleteRequestToken?: number
  onIfcElementSelect?: (element: IfcElementInfo | null) => void
  onIfcElementDelete?: (element: IfcElementInfo) => void
  onSelectWallForChat?: (wallId: string) => void
  onIfcElementTransformCommit?: (
    element: IfcElementInfo,
    patch: Omit<IfcElementChange, 'expressId'>,
  ) => void
  libraryElements: ThreeDLibraryPreset[]
  onAddLibraryPreset: (preset: ThreeDLibraryPreset, options?: { closePanel?: boolean }) => void
  onLibraryElementChange: (id: string, patch: Partial<ThreeDLibraryPreset>) => void
  onLibraryElementDelete: (id: string) => void
  /** 2D 평면도에서 직접 생성한 로컬 3D 데이터. 있으면 IFC 대신 이를 렌더링한다. */
  localFloorData?: FloorPlan3DData | null
  onThreeDCoordinatesChange?: (coords: ThreeDCoordinates) => void
  /** IFC 로드 완료 시 파싱된 건물 층 목록을 전달하는 콜백 */
  onStoreysLoad?: (storeys: IfcStoreyInfo[]) => void
  /** 현재 표시할 층의 expressId. null이면 전체 표시 */
  activeStoreyExpressId?: number | null
  /** 겹쳐보기로 함께 표시할 IFC 층 expressId 목록 */
  overlayIfcStoreyExpressIds?: number[]
  /** IFC 겹쳐보기 층별 투명도 (0.1~1) */
  overlayIfcStoreyOpacityByExpressId?: Record<number, number>
  hiddenIfcElementLocalIds?: number[]
  /** 계층구조에서 선택 요청한 IFC 요소 localId */
  requestedIfcElementLocalId?: number | null
  /** 계층구조 IFC 요소 선택 요청 토큰 */
  ifcElementSelectionRequestToken?: number
  /** 계층구조에서 선택 요청한 라이브러리 요소 id */
  requestedLibraryElementId?: string | null
  /** 계층구조 라이브러리 요소 선택 요청 토큰 */
  libraryElementSelectionRequestToken?: number
  cameraViewPresetCommand?: ThreeDCameraViewPresetCommand
  isTransformSnapEnabled?: boolean
  transformSnapIntervalMm?: number
  isEditingLocked?: boolean
  onPreviewCapture?: (imageUrl: string) => void
}

export function ThreeDCanvas(props: ThreeDCanvasProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const isEditingLocked = props.isEditingLocked ?? false
  // 실제 IFC URL이 없으면 ThreeDCanvasScene에서 localFloorData를 먼저 사용한다.
  // local 3D 데이터도 없을 때만 mock IFC를 fallback으로 사용한다.
  const effectiveIfcUrl = props.ifcUrl ?? DEFAULT_MOCK_IFC_URL

  const { onAddLibraryPreset } = props
  const addLibraryPreset = useCallback(
    (preset: ThreeDLibraryPreset, options?: { closePanel?: boolean }) => {
      if (isEditingLocked) return
      onAddLibraryPreset(preset, options)
    },
    [isEditingLocked, onAddLibraryPreset],
  )

  useCtrlWheelZoom({
    rootRef,
    onWheelZoom: props.onWheelZoom,
  })

  const {
    libraryDropRequest,
    handleLibraryDragOver,
    handleLibraryDrop,
    handleResolveLibraryDrop,
  } = useThreeDLibraryDrop({
    isEditingLocked,
    addLibraryPreset,
  })

  return (
    <div
      ref={rootRef}
      onDragOver={handleLibraryDragOver}
      onDrop={handleLibraryDrop}
      className="absolute inset-0 overflow-hidden bg-[#F0F2F9] select-none"
    >
      <ThreeDCanvasScene
        projectId={props.projectId}
        ifcUrl={effectiveIfcUrl}
        rawIfcUrl={props.ifcUrl}
        localFloorData={props.localFloorData}
        floorLayers={props.floorLayers ?? []}
        activeFloorLayerId={props.activeFloorLayerId ?? null}
        overlayLayers={props.overlayLayers ?? []}
        libraryElements={props.libraryElements}
        commentPins={props.commentPins ?? []}
        isCollaborationMode={Boolean(props.isCollaborationMode)}
        selectedPinId={props.selectedPinId ?? null}
        currentUserId={props.currentUserId ?? null}
        onPinClick={props.onPinClick}
        onPinCreate={props.onPinCreate}
        onPinDelete={props.onPinDelete}
        deletingPinId={props.deletingPinId ?? null}
        ifcElementChanges={props.ifcElementChanges ?? []}
        isRotationLocked={props.isRotationLocked ?? false}
        isGridVisible={Boolean(props.isGridVisible)}
        zoomScale={props.scale ?? 1}
        selectedTool={props.selectedTool}
        selectedIfcElement={props.selectedIfcElement}
        preferredSelectedElementId={props.preferredSelectedElementId ?? null}
        deleteRequestToken={props.threeDDeleteRequestToken ?? 0}
        onIfcElementSelect={props.onIfcElementSelect}
        onIfcElementDelete={props.onIfcElementDelete}
        onSelectWallForChat={props.onSelectWallForChat}
        onIfcElementTransformCommit={props.onIfcElementTransformCommit}
        onLibraryElementChange={props.onLibraryElementChange}
        onLibraryElementDelete={props.onLibraryElementDelete}
        onThreeDCoordinatesChange={props.onThreeDCoordinatesChange}
        onStoreysLoad={props.onStoreysLoad}
        activeStoreyExpressId={props.activeStoreyExpressId}
        overlayIfcStoreyExpressIds={props.overlayIfcStoreyExpressIds}
        overlayIfcStoreyOpacityByExpressId={props.overlayIfcStoreyOpacityByExpressId}
        hiddenIfcElementLocalIds={props.hiddenIfcElementLocalIds}
        requestedIfcElementLocalId={props.requestedIfcElementLocalId}
        ifcElementSelectionRequestToken={props.ifcElementSelectionRequestToken}
        requestedLibraryElementId={props.requestedLibraryElementId}
        libraryElementSelectionRequestToken={props.libraryElementSelectionRequestToken}
        cameraViewPresetCommand={props.cameraViewPresetCommand}
        libraryDropRequest={libraryDropRequest}
        onResolveLibraryDrop={handleResolveLibraryDrop}
        isTransformSnapEnabled={props.isTransformSnapEnabled ?? true}
        transformSnapIntervalMm={props.transformSnapIntervalMm ?? 100}
        isEditingLocked={isEditingLocked}
        onPreviewCapture={props.onPreviewCapture}
      />

      <ThreeDCanvasCollaborationOverlay isVisible={Boolean(props.isCollaborationMode)} />

      {props.isLibraryOpen && (
        <ThreeDLibraryPanel
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          onClose={props.onToggleLibrary ?? (() => {})}
          isEditingLocked={isEditingLocked}
          onAddPreset={(preset) => {
            if (isEditingLocked) return
            addLibraryPreset(preset, { closePanel: true })
          }}
        />
      )}

    </div>
  )
}
