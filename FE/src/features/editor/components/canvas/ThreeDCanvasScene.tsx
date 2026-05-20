import type { CommentPin3DCreatePosition, FloorCommentPin, FloorLayer, FloorLayerOverlay, IfcElementChange, IfcElementInfo } from '../../types'
import type { FloorPlan3DData } from '../../utils/floorPlanTo3D'
import type { ThreeDLibraryDropRequest, ThreeDLibraryPreset } from './threeDLibrary.types'
import type { IfcStoreyInfo } from './thatopen/ifcPropertyParser'
import type { ThreeDCameraViewPresetCommand } from '@/pages/editor/components/canvas-content/buildCanvasSectionProps'
import ThatOpenIfcCanvas from './ThatOpenIfcCanvas'
import { FloorPlan3DCanvas } from './FloorPlan3DCanvas'
import { resolveTransformMode, shouldRenderLocalFloorPlan } from './threeDCanvas.utils'

interface ThreeDCanvasSceneProps {
  projectId?: string | null
  ifcUrl?: string | null
  rawIfcUrl?: string | null
  localFloorData?: FloorPlan3DData | null
  floorLayers: FloorLayer[]
  activeFloorLayerId: string | null
  overlayLayers: FloorLayerOverlay[]
  libraryElements: ThreeDLibraryPreset[]
  commentPins: FloorCommentPin[]
  isCollaborationMode: boolean
  selectedPinId: string | null
  currentUserId: string | null
  onPinClick?: (id: string) => void
  onPinCreate?: (x: number, y: number, content?: string, threeDPosition?: CommentPin3DCreatePosition) => void
  onPinDelete?: (id: string) => void
  deletingPinId: string | null
  ifcElementChanges: IfcElementChange[]
  isRotationLocked: boolean
  isGridVisible: boolean
  zoomScale: number
  selectedTool?: string
  selectedIfcElement?: IfcElementInfo | null
  preferredSelectedElementId: string | null
  deleteRequestToken: number
  onIfcElementSelect?: (element: IfcElementInfo | null) => void
  onIfcElementDelete?: (element: IfcElementInfo) => void
  onSelectWallForChat?: (wallId: string) => void
  onIfcElementTransformCommit?: (
    element: IfcElementInfo,
    patch: Omit<IfcElementChange, 'expressId'>,
  ) => void
  onLibraryElementChange: (id: string, patch: Partial<ThreeDLibraryPreset>) => void
  onLibraryElementDelete: (id: string) => void
  onThreeDCoordinatesChange?: (coords: { x: number; y: number; z: number }) => void
  onStoreysLoad?: (storeys: IfcStoreyInfo[]) => void
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
  libraryDropRequest?: ThreeDLibraryDropRequest | null
  onResolveLibraryDrop?: (token: number, patch?: Partial<ThreeDLibraryPreset>) => void
  cameraViewPresetCommand?: ThreeDCameraViewPresetCommand
  isTransformSnapEnabled: boolean
  transformSnapIntervalMm: number
  isEditingLocked: boolean
  onPreviewCapture?: (imageUrl: string) => void
}

/**
 * 3D 캔버스 본문 렌더러.
 * IFC 씬과 로컬 평면도 변환 씬 중 하나를 조건에 맞게 선택한다.
 */
export default function ThreeDCanvasScene({
  projectId,
  ifcUrl,
  rawIfcUrl,
  localFloorData,
  floorLayers,
  activeFloorLayerId,
  overlayLayers,
  libraryElements,
  commentPins,
  isCollaborationMode,
  selectedPinId,
  currentUserId,
  onPinClick,
  onPinCreate,
  onPinDelete,
  deletingPinId,
  ifcElementChanges,
  isRotationLocked,
  isGridVisible,
  zoomScale,
  selectedTool,
  selectedIfcElement,
  preferredSelectedElementId,
  deleteRequestToken,
  onIfcElementSelect,
  onIfcElementDelete,
  onSelectWallForChat,
  onIfcElementTransformCommit,
  onLibraryElementChange,
  onLibraryElementDelete,
  onThreeDCoordinatesChange,
  onStoreysLoad,
  activeStoreyExpressId,
  overlayIfcStoreyExpressIds,
  overlayIfcStoreyOpacityByExpressId,
  hiddenIfcElementLocalIds,
  requestedIfcElementLocalId,
  ifcElementSelectionRequestToken,
  requestedLibraryElementId,
  libraryElementSelectionRequestToken,
  libraryDropRequest,
  onResolveLibraryDrop,
  cameraViewPresetCommand,
  isTransformSnapEnabled,
  transformSnapIntervalMm,
  isEditingLocked,
  onPreviewCapture,
}: ThreeDCanvasSceneProps) {
  const hasAuthoritativeFloorLayers =
    floorLayers.some((layer) => layer.rooms.length > 0) &&
    Boolean(localFloorData)
  const useLocalFloorPlan = shouldRenderLocalFloorPlan(
    rawIfcUrl,
    localFloorData,
    hasAuthoritativeFloorLayers,
  )

  const transformMode = resolveTransformMode(selectedTool)

  // IFC URL이 아직 없고 로컬 평면도 데이터가 있으면 3D 폴백 씬을 우선 렌더링한다.
  if (useLocalFloorPlan && localFloorData) {
    return (
      <FloorPlan3DCanvas
        data={localFloorData}
        overlayLayers={overlayLayers}
        selectedTool={selectedTool}
        libraryElements={libraryElements}
        commentPins={commentPins}
        isCollaborationMode={isCollaborationMode}
        selectedPinId={selectedPinId}
        currentUserId={currentUserId}
        onPinClick={onPinClick}
        onPinCreate={onPinCreate}
        onPinDelete={onPinDelete}
        deletingPinId={deletingPinId}
        selectedIfcElement={selectedIfcElement}
        preferredSelectedElementId={preferredSelectedElementId}
        deleteRequestToken={deleteRequestToken}
        isRotationLocked={isRotationLocked}
        onLibraryElementChange={onLibraryElementChange}
        onLibraryElementDelete={onLibraryElementDelete}
        onIfcElementSelect={onIfcElementSelect}
        onIfcElementTransformCommit={onIfcElementTransformCommit}
        transformMode={transformMode}
        libraryDropRequest={libraryDropRequest}
        onResolveLibraryDrop={onResolveLibraryDrop}
        cameraViewPresetCommand={cameraViewPresetCommand}
        transformSnapEnabled={isTransformSnapEnabled}
        transformSnapIntervalMm={transformSnapIntervalMm}
        isEditingLocked={isEditingLocked}
        onPreviewCapture={onPreviewCapture}
      />
    )
  }

  if (!ifcUrl) {
    return null
  }

  return (
    <ThatOpenIfcCanvas
      ifcUrl={ifcUrl}
      projectId={projectId}
      floorLayers={floorLayers}
      activeFloorLayerId={activeFloorLayerId}
      overlayLayers={overlayLayers}
      libraryElements={libraryElements}
      commentPins={commentPins}
      isCollaborationMode={isCollaborationMode}
      selectedPinId={selectedPinId}
      currentUserId={currentUserId}
      onPinClick={onPinClick}
      onPinCreate={onPinCreate}
      onPinDelete={onPinDelete}
      deletingPinId={deletingPinId}
      ifcElementChanges={ifcElementChanges}
      isRotationLocked={isRotationLocked}
      isGridVisible={isGridVisible}
      zoomScale={zoomScale}
      selectedIfcElement={selectedIfcElement}
      preferredSelectedElementId={preferredSelectedElementId}
      deleteRequestToken={deleteRequestToken}
      onIfcElementSelect={onIfcElementSelect}
      onIfcElementDelete={onIfcElementDelete}
      onSelectWallForChat={onSelectWallForChat}
      onIfcElementTransformCommit={onIfcElementTransformCommit}
      onLibraryElementChange={onLibraryElementChange}
      onLibraryElementDelete={onLibraryElementDelete}
      onThreeDCoordinatesChange={onThreeDCoordinatesChange}
      onStoreysLoad={onStoreysLoad}
      activeStoreyExpressId={activeStoreyExpressId}
      overlayIfcStoreyExpressIds={overlayIfcStoreyExpressIds}
      overlayIfcStoreyOpacityByExpressId={overlayIfcStoreyOpacityByExpressId}
      hiddenIfcElementLocalIds={hiddenIfcElementLocalIds}
      requestedIfcElementLocalId={requestedIfcElementLocalId}
      ifcElementSelectionRequestToken={ifcElementSelectionRequestToken}
      requestedLibraryElementId={requestedLibraryElementId}
      libraryElementSelectionRequestToken={libraryElementSelectionRequestToken}
      transformMode={transformMode}
      selectedTool={selectedTool}
      libraryDropRequest={libraryDropRequest}
      onResolveLibraryDrop={onResolveLibraryDrop}
      cameraViewPresetCommand={cameraViewPresetCommand}
      transformSnapEnabled={isTransformSnapEnabled}
      transformSnapIntervalMm={transformSnapIntervalMm}
      isEditingLocked={isEditingLocked}
      onPreviewCapture={onPreviewCapture}
    />
  )
}
