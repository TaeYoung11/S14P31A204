import { lazy, useMemo } from 'react'
import { useFreshIfcUrl } from '@/features/editor/hooks/useFreshIfcUrl'
import type { EditorCanvasRenderProps } from '../../types/editorCanvasContentProps'
import type { ThreeDCoordinates } from '../canvas-content/buildCanvasSectionProps'

/** ThreeDCanvas는 ThatOpen 기반 Three.js 렌더러를 포함해 무거우므로 lazy 로드한다. */
const ThreeDCanvas = lazy(() =>
  import('@/features/editor/components/canvas/ThreeDCanvas').then((module) => ({
    default: module.ThreeDCanvas,
  })),
)

interface ThreeDModeCanvasProps {
  editorProps: EditorCanvasRenderProps
  scale: number
  isRotationLocked: boolean
  onThreeDCoordinatesChange: (coords: ThreeDCoordinates) => void
}

/**
 * 3D 모드 캔버스 렌더링 전용 컴포넌트.
 *
 * 탭 전환 시 컴포넌트가 언마운트·리마운트되는 구조이므로,
 * `useFreshIfcUrl`을 통해 mount 시마다 presigned URL을 재발급해 만료 오류를 방지한다.
 */
export default function ThreeDModeCanvas({
  editorProps,
  scale,
  isRotationLocked,
  onThreeDCoordinatesChange,
}: ThreeDModeCanvasProps) {
  // mount 시마다 fresh presigned URL 발급 (만료된 URL로 인한 403 방지)
  // assetId가 없거나 재발급 실패 시 mock IFC로 폴백
  const freshIfcUrl = useFreshIfcUrl(
    editorProps.currentIfcAssetId,
    editorProps.currentIfcUrl ?? '/mock/shinchan_house.ifc',
  )

  const overlayIfcStoreyOpacityByExpressId = useMemo(() => {
    const overlayIds = editorProps.overlayIfcStoreyExpressIds ?? []
    if (overlayIds.length === 0) return undefined

    // 층보기 투명도 값이 아직 저장되지 않은 층도 기본값(0.35)으로 전달해
    // IFC 겹쳐보기 렌더 경로가 항상 동일하게 동작하도록 유지한다.
    const entries = overlayIds.map((storeyId) => {
      const key = String(storeyId)
      const stored = editorProps.overlayOpacityByLayerId[key]
      const normalizedStored = Number.isFinite(stored)
        ? (stored > 1 ? stored / 100 : stored)
        : 0.35
      const rawValue = Number.isFinite(normalizedStored) ? normalizedStored : 0.35
      const value = Math.min(Math.max(rawValue, 0.1), 1)
      return [storeyId, value] as const
    })
    return Object.fromEntries(entries) as Record<number, number>
  }, [editorProps.overlayIfcStoreyExpressIds, editorProps.overlayOpacityByLayerId])

  return (
    <ThreeDCanvas
      projectId={editorProps.projectId}
      ifcUrl={freshIfcUrl}
      sitePoints={editorProps.sitePlanPoints}
      isCollaborationMode={editorProps.isCollaborationMode}
      isLibraryOpen={editorProps.isLibraryOpen}
      onToggleLibrary={() => editorProps.setIsLibraryOpen(!editorProps.isLibraryOpen)}
      isGridVisible={editorProps.isGridVisible}
      rooms={editorProps.floorRooms}
      overlayLayers={editorProps.floorLayerOverlayItems}
      selectedId={editorProps.selectedId}
      onSelect={(id) => (id ? editorProps.handleBubbleSelect(id) : editorProps.clearSelection())}
      selectedTool={editorProps.selectedTool}
      scale={scale}
      onWheelZoom={editorProps.handleWheelZoom}
      isRotationLocked={isRotationLocked}
      ifcElementChanges={editorProps.ifcElementChanges}
      selectedIfcElement={editorProps.selectedIfcElement}
      threeDDeleteRequestToken={editorProps.threeDDeleteRequestToken}
      onIfcElementSelect={editorProps.handleSelectIfcElement}
      onIfcElementDelete={editorProps.handleDeleteIfcElement}
      libraryElements={editorProps.libraryElements}
      onAddLibraryPreset={editorProps.handleAddLibraryPreset}
      onLibraryElementChange={editorProps.handleChangeLibraryElement}
      onLibraryElementDelete={editorProps.handleDeleteLibraryElement}
      localFloorData={editorProps.localFloorData}
      onStoreysLoad={editorProps.handleIfcStoreysLoad}
      activeStoreyExpressId={editorProps.activeIfcStoreyExpressId}
      overlayIfcStoreyExpressIds={editorProps.overlayIfcStoreyExpressIds}
      overlayIfcStoreyOpacityByExpressId={overlayIfcStoreyOpacityByExpressId}
      requestedIfcElementLocalId={editorProps.requestedIfcElementLocalId}
      ifcElementSelectionRequestToken={editorProps.ifcElementSelectionRequestToken}
      requestedLibraryElementId={editorProps.requestedLibraryElementId}
      libraryElementSelectionRequestToken={editorProps.libraryElementSelectionRequestToken}
      onThreeDCoordinatesChange={onThreeDCoordinatesChange}
    />
  )
}
