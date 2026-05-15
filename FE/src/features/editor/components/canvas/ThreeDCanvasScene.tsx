import type { CommentPin3DCreatePosition, FloorCommentPin, IfcElementChange, IfcElementInfo } from '../../types'
import type { FloorPlan3DData } from '../../utils/floorPlanTo3D'
import type { ThreeDLibraryDropRequest, ThreeDLibraryPreset } from './threeDLibrary.types'
import type { ThreeDCameraViewPresetCommand } from '@/pages/editor/components/canvas-content/buildCanvasSectionProps'
import ThatOpenIfcCanvas from './ThatOpenIfcCanvas'
import { FloorPlan3DCanvas } from './FloorPlan3DCanvas'
import { resolveTransformMode, shouldRenderLocalFloorPlan } from './threeDCanvas.utils'

interface ThreeDCanvasSceneProps {
  projectId?: string | null
  ifcUrl?: string | null
  rawIfcUrl?: string | null
  localFloorData?: FloorPlan3DData | null
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
  zoomScale: number
  selectedTool?: string
  selectedIfcElement?: IfcElementInfo | null
  deleteRequestToken: number
  onIfcElementSelect?: (element: IfcElementInfo | null) => void
  onIfcElementDelete?: (element: IfcElementInfo) => void
  onLibraryElementChange: (id: string, patch: Partial<ThreeDLibraryPreset>) => void
  onLibraryElementDelete: (id: string) => void
  onThreeDCoordinatesChange?: (coords: { x: number; y: number; z: number }) => void
  libraryDropRequest?: ThreeDLibraryDropRequest | null
  onResolveLibraryDrop?: (token: number, patch?: Partial<ThreeDLibraryPreset>) => void
  cameraViewPresetCommand?: ThreeDCameraViewPresetCommand
  isTransformSnapEnabled: boolean
  transformSnapIntervalMm: number
  isEditingLocked: boolean
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
  zoomScale,
  selectedTool,
  selectedIfcElement,
  deleteRequestToken,
  onIfcElementSelect,
  onIfcElementDelete,
  onLibraryElementChange,
  onLibraryElementDelete,
  onThreeDCoordinatesChange,
  libraryDropRequest,
  onResolveLibraryDrop,
  cameraViewPresetCommand,
  isTransformSnapEnabled,
  transformSnapIntervalMm,
  isEditingLocked,
}: ThreeDCanvasSceneProps) {
  const transformMode = resolveTransformMode(selectedTool)

  if (import.meta.env.DEV) {
    console.log('[3d-scene-route]', {
      ifcUrl,
      rawIfcUrl,
      hasLocalFloorData: Boolean(localFloorData),
      renderLocalFloorPlan: shouldRenderLocalFloorPlan(rawIfcUrl, localFloorData),
    })
  }

  // IFC URL이 아직 없고 로컬 평면도 데이터가 있으면 3D 폴백 씬을 우선 렌더링한다.
  if (shouldRenderLocalFloorPlan(rawIfcUrl, localFloorData) && localFloorData) {
    return (
      <FloorPlan3DCanvas
        data={localFloorData}
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
        deleteRequestToken={deleteRequestToken}
        isRotationLocked={isRotationLocked}
        onLibraryElementChange={onLibraryElementChange}
        onLibraryElementDelete={onLibraryElementDelete}
        onIfcElementSelect={onIfcElementSelect}
        transformMode={transformMode}
        selectedTool={selectedTool}
        libraryDropRequest={libraryDropRequest}
        onResolveLibraryDrop={onResolveLibraryDrop}
        cameraViewPresetCommand={cameraViewPresetCommand}
        transformSnapEnabled={isTransformSnapEnabled}
        transformSnapIntervalMm={transformSnapIntervalMm}
        isEditingLocked={isEditingLocked}
      />
    )
  }

  if (!ifcUrl) {
    if (import.meta.env.DEV) {
      console.warn('[3d-scene-route] skip ThatOpen render: missing ifcUrl')
    }
    return null
  }

  return (
    <ThatOpenIfcCanvas
      ifcUrl={ifcUrl}
      projectId={projectId}
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
      zoomScale={zoomScale}
      selectedIfcElement={selectedIfcElement}
      deleteRequestToken={deleteRequestToken}
      onIfcElementSelect={onIfcElementSelect}
      onIfcElementDelete={onIfcElementDelete}
      onLibraryElementChange={onLibraryElementChange}
      onLibraryElementDelete={onLibraryElementDelete}
      onThreeDCoordinatesChange={onThreeDCoordinatesChange}
      transformMode={transformMode}
      selectedTool={selectedTool}
      libraryDropRequest={libraryDropRequest}
      onResolveLibraryDrop={onResolveLibraryDrop}
      cameraViewPresetCommand={cameraViewPresetCommand}
      transformSnapEnabled={isTransformSnapEnabled}
      transformSnapIntervalMm={transformSnapIntervalMm}
      isEditingLocked={isEditingLocked}
    />
  )
}
