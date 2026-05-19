import { lazy, useEffect, useMemo } from 'react'
import { useFreshIfcUrl } from '@/features/editor/hooks/useFreshIfcUrl'
import { DEFAULT_MOCK_IFC_URL } from '@/features/editor/components/canvas/threeDCanvas.utils'
import type { EditorCanvasRenderProps } from '../../types/editorCanvasContentProps'
import type { ThreeDCameraViewPresetCommand, ThreeDCoordinates } from '../canvas-content/buildCanvasSectionProps'

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
  cameraViewPresetCommand: ThreeDCameraViewPresetCommand
}

const isLikelyLocalEditorId = (value: string | null | undefined): boolean => {
  if (!value) return true
  const normalized = value.trim().toLowerCase()
  return (
    normalized.startsWith('opening-') ||
    normalized.startsWith('wall-') ||
    normalized.startsWith('auto-')
  )
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
  cameraViewPresetCommand,
}: ThreeDModeCanvasProps) {
  const selectedOpening = editorProps.selectedFloorOpeningId
    ? (editorProps.floorOpenings.find((opening) => opening.id === editorProps.selectedFloorOpeningId) ?? null)
    : null
  const selectedOpeningWall = selectedOpening
    ? (editorProps.floorWallsForHierarchy.find((wall) => wall.id === selectedOpening.wallId) ?? null)
    : null
  const selectedOpeningPreferredElementId = selectedOpening
    ? (
      selectedOpening.globalId ??
      (!isLikelyLocalEditorId(selectedOpening.hostWallGlobalId) ? selectedOpening.hostWallGlobalId : null) ??
      (!isLikelyLocalEditorId(selectedOpeningWall?.globalId) ? selectedOpeningWall?.globalId ?? null : null) ??
      (!isLikelyLocalEditorId(selectedOpening.wallId) ? selectedOpening.wallId : null) ??
      (!isLikelyLocalEditorId(selectedOpening.id) ? selectedOpening.id : null)
    )
    : null
  const selectedWallPreferredElementId = editorProps.selectedFloorWallId
    ? (
      editorProps.floorWallsForHierarchy.find((wall) => wall.id === editorProps.selectedFloorWallId)?.globalId ??
      editorProps.selectedFloorWallId
    )
    : null
  const shouldUseRoomPreferredElementId =
    Boolean(editorProps.selectedId) &&
    !editorProps.selectedFloorOpeningId &&
    !editorProps.selectedFloorWallId &&
    !editorProps.selectedIfcElement
  const preferredSelectedElementId =
    selectedOpeningPreferredElementId ??
    selectedWallPreferredElementId ??
    (shouldUseRoomPreferredElementId ? editorProps.selectedId : null) ??
    null

  // mount 시마다 fresh presigned URL 발급 (만료된 URL로 인한 403 방지)
  // assetId가 없거나 재발급 실패 시 mock IFC로 폴백
  const freshIfcUrl = useFreshIfcUrl(
    editorProps.currentIfcAssetId,
    editorProps.currentIfcUrl ?? DEFAULT_MOCK_IFC_URL,
  )

  useEffect(() => {
    if (!import.meta.env.DEV) return
    console.log('[3d-ifc-url]', {
      currentIfcUrl: editorProps.currentIfcUrl,
      currentIfcAssetId: editorProps.currentIfcAssetId,
      freshIfcUrl,
      selectedFloorOpeningId: editorProps.selectedFloorOpeningId,
      selectedFloorWallId: editorProps.selectedFloorWallId,
      selectedId: editorProps.selectedId,
      preferredSelectedElementId,
    })
  }, [
    editorProps.currentIfcAssetId,
    editorProps.currentIfcUrl,
    editorProps.selectedFloorOpeningId,
    editorProps.selectedFloorWallId,
    editorProps.selectedId,
    freshIfcUrl,
    preferredSelectedElementId,
  ])

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
      commentPins={editorProps.commentPins}
      selectedPinId={editorProps.selectedPinId}
      currentUserId={editorProps.currentCollaborationUserId}
      onPinClick={editorProps.handlePinClick}
      onPinCreate={editorProps.handleCreateCommentPin}
      onPinDelete={editorProps.handleDeletePin}
      deletingPinId={editorProps.deletingPinId}
      isLibraryOpen={editorProps.isLibraryOpen}
      onToggleLibrary={() => editorProps.setIsLibraryOpen(!editorProps.isLibraryOpen)}
      isGridVisible={editorProps.isGridVisible}
      rooms={editorProps.floorRooms}
      floorLayers={editorProps.floorLayers}
      activeFloorLayerId={editorProps.activeFloorLayerId}
      overlayLayers={editorProps.floorLayerOverlayItems}
      selectedId={editorProps.selectedId}
      preferredSelectedElementId={preferredSelectedElementId}
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
      onIfcElementTransformCommit={editorProps.handleCommitIfcElementTransform}
      libraryElements={editorProps.libraryElements}
      onAddLibraryPreset={editorProps.handleAddLibraryPreset}
      onLibraryElementChange={editorProps.handleChangeLibraryElement}
      onLibraryElementDelete={editorProps.handleDeleteLibraryElement}
      localFloorData={editorProps.localFloorData}
      onStoreysLoad={editorProps.handleIfcStoreysLoad}
      activeStoreyExpressId={editorProps.activeIfcStoreyExpressId}
      overlayIfcStoreyExpressIds={editorProps.overlayIfcStoreyExpressIds}
      overlayIfcStoreyOpacityByExpressId={overlayIfcStoreyOpacityByExpressId}
      hiddenIfcElementLocalIds={editorProps.hiddenIfcElementLocalIds}
      requestedIfcElementLocalId={editorProps.requestedIfcElementLocalId}
      ifcElementSelectionRequestToken={editorProps.ifcElementSelectionRequestToken}
      requestedLibraryElementId={editorProps.requestedLibraryElementId}
      libraryElementSelectionRequestToken={editorProps.libraryElementSelectionRequestToken}
      onThreeDCoordinatesChange={onThreeDCoordinatesChange}
      cameraViewPresetCommand={cameraViewPresetCommand}
      isTransformSnapEnabled={editorProps.isGridSnapEnabled}
      transformSnapIntervalMm={editorProps.gridSnapIntervalMm}
      isEditingLocked={editorProps.isThreeDEditingLocked}
    />
  )
}
