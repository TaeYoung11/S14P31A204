import type { IfcElementChange, IfcElementInfo } from '../../types'
import type { FloorPlan3DData } from '../../utils/floorPlanTo3D'
import type { ThreeDLibraryPreset } from './threeDLibrary.types'
import type { IfcStoreyInfo } from './thatopen/ifcPropertyParser'
import ThatOpenIfcCanvas from './ThatOpenIfcCanvas'
import { FloorPlan3DCanvas } from './FloorPlan3DCanvas'
import { resolveTransformMode, shouldRenderLocalFloorPlan } from './threeDCanvas.utils'

interface ThreeDCanvasSceneProps {
  projectId?: string | null
  ifcUrl: string
  rawIfcUrl?: string | null
  localFloorData?: FloorPlan3DData | null
  libraryElements: ThreeDLibraryPreset[]
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
  onStoreysLoad?: (storeys: IfcStoreyInfo[]) => void
  activeStoreyExpressId?: number | null
  /** 겹쳐보기로 함께 표시할 IFC 층 expressId 목록 */
  overlayIfcStoreyExpressIds?: number[]
  /** IFC 겹쳐보기 층별 투명도 (0.1~1) */
  overlayIfcStoreyOpacityByExpressId?: Record<number, number>
  /** 계층구조에서 선택 요청한 IFC 요소 localId */
  requestedIfcElementLocalId?: number | null
  /** 계층구조 IFC 요소 선택 요청 토큰 */
  ifcElementSelectionRequestToken?: number
  /** 계층구조에서 선택 요청한 라이브러리 요소 id */
  requestedLibraryElementId?: string | null
  /** 계층구조 라이브러리 요소 선택 요청 토큰 */
  libraryElementSelectionRequestToken?: number
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
  onStoreysLoad,
  activeStoreyExpressId,
  overlayIfcStoreyExpressIds,
  overlayIfcStoreyOpacityByExpressId,
  requestedIfcElementLocalId,
  ifcElementSelectionRequestToken,
  requestedLibraryElementId,
  libraryElementSelectionRequestToken,
}: ThreeDCanvasSceneProps) {
  const useLocalFloorPlan = shouldRenderLocalFloorPlan(rawIfcUrl, localFloorData) && Boolean(localFloorData)

  // IFC URL이 아직 없고 로컬 평면도 데이터가 있으면 3D 폴백 씬을 우선 렌더링한다.
  if (useLocalFloorPlan && localFloorData) {
    return (
      <FloorPlan3DCanvas
        data={localFloorData}
        selectedTool={selectedTool}
        libraryElements={libraryElements}
        deleteRequestToken={deleteRequestToken}
        onLibraryElementChange={onLibraryElementChange}
        onLibraryElementDelete={onLibraryElementDelete}
        onIfcElementSelect={onIfcElementSelect}
      />
    )
  }

  return (
    <ThatOpenIfcCanvas
      ifcUrl={ifcUrl}
      projectId={projectId}
      libraryElements={libraryElements}
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
      onStoreysLoad={onStoreysLoad}
      activeStoreyExpressId={activeStoreyExpressId}
      overlayIfcStoreyExpressIds={overlayIfcStoreyExpressIds}
      overlayIfcStoreyOpacityByExpressId={overlayIfcStoreyOpacityByExpressId}
      requestedIfcElementLocalId={requestedIfcElementLocalId}
      ifcElementSelectionRequestToken={ifcElementSelectionRequestToken}
      requestedLibraryElementId={requestedLibraryElementId}
      libraryElementSelectionRequestToken={libraryElementSelectionRequestToken}
      transformMode={resolveTransformMode(selectedTool)}
    />
  )
}
