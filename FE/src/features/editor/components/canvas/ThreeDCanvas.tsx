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
import { useRef } from 'react'
import type { CommentPin3DCreatePosition, FloorCommentPin, FloorLayerOverlay, FloorRoom, IfcElementChange, IfcElementInfo } from '../../types'
import { useCtrlWheelZoom } from '../../hooks/useCtrlWheelZoom'
import { useThreeDLibraryPresets } from '../../hooks/useThreeDLibraryPresets'
import ThreeDCanvasCollaborationOverlay from './ThreeDCanvasCollaborationOverlay'
import ThreeDCanvasGridOverlay from './ThreeDCanvasGridOverlay'
import ThreeDCanvasScene from './ThreeDCanvasScene'
import ThreeDLibraryPanel from './ThreeDLibraryPanel'
import type { FloorPlan3DData } from '../../utils/floorPlanTo3D'
import type { ThreeDCameraViewPresetCommand } from '@/pages/editor/components/canvas-content/buildCanvasSectionProps'
import { useThreeDLibraryDrop } from './useThreeDLibraryDrop'

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
  overlayLayers?: FloorLayerOverlay[]
  /** 현재 줌 스케일 (1.0 = 100%) */
  scale?: number
  selectedId?: string | null
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
  /** 2D 평면도에서 직접 생성한 로컬 3D 데이터. 있으면 IFC 대신 이를 렌더링한다. */
  localFloorData?: FloorPlan3DData | null
  onThreeDCoordinatesChange?: (coords: ThreeDCoordinates) => void
  cameraViewPresetCommand?: ThreeDCameraViewPresetCommand
  isTransformSnapEnabled?: boolean
  transformSnapIntervalMm?: number
  isEditingLocked?: boolean
}

export function ThreeDCanvas(props: ThreeDCanvasProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const isEditingLocked = props.isEditingLocked ?? false

  // ifcUrl이 null(로딩 중 또는 IFC 없음)이어도 mock으로 폴백해 씬을 항상 표시한다
  // 라이브러리 프리셋 상태 관리 (카테고리 선택, 씬 내 배치 목록, CRUD)
  // onPresetAdded: 프리셋 추가 직후 라이브러리 패널을 닫는다
  const {
    selectedCategory,
    setSelectedCategory,
    libraryElements,
    addLibraryPreset,
    changeLibraryElement,
    deleteLibraryElement,
  } = useThreeDLibraryPresets({
    onPresetAdded: props.onToggleLibrary,
  })

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
        ifcUrl={props.ifcUrl}
        rawIfcUrl={props.ifcUrl}
        localFloorData={props.localFloorData}
        libraryElements={libraryElements}
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
        zoomScale={props.scale ?? 1}
        selectedTool={props.selectedTool}
        selectedIfcElement={props.selectedIfcElement}
        deleteRequestToken={props.threeDDeleteRequestToken ?? 0}
        onIfcElementSelect={props.onIfcElementSelect}
        onIfcElementDelete={props.onIfcElementDelete}
        onLibraryElementChange={changeLibraryElement}
        onLibraryElementDelete={deleteLibraryElement}
        onThreeDCoordinatesChange={props.onThreeDCoordinatesChange}
        cameraViewPresetCommand={props.cameraViewPresetCommand}
        libraryDropRequest={libraryDropRequest}
        onResolveLibraryDrop={handleResolveLibraryDrop}
        isTransformSnapEnabled={props.isTransformSnapEnabled ?? true}
        transformSnapIntervalMm={props.transformSnapIntervalMm ?? 100}
        isEditingLocked={isEditingLocked}
      />

      <ThreeDCanvasGridOverlay isVisible={Boolean(props.isGridVisible)} />

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
