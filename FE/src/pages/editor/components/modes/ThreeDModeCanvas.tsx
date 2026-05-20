import { useCallback, useMemo } from 'react'
import { useFreshIfcUrl } from '@/features/editor/hooks/useFreshIfcUrl'
import { saveProjectWorkspaceThumbnail } from '@/features/project/services/projectWorkspaceThumbnail.service'
import { DEFAULT_MOCK_IFC_URL } from '@/features/editor/components/canvas/threeDCanvas.utils'
import { ThreeDCanvas } from '@/features/editor/components/canvas/ThreeDCanvas'
import type { EditorCanvasRenderProps } from '../../types/editorCanvasContentProps'
import type { ThreeDCameraViewPresetCommand, ThreeDCoordinates } from '../canvas-content/buildCanvasSectionProps'

/** ThreeDCanvas는 ThatOpen 기반 Three.js 렌더러를 포함해 무거우므로 lazy 로드한다. */
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
 * 탭 전환 등으로 3D 캔버스가 다시 마운트될 때 현재 IFC URL을 우선 사용하고,
 * 직접 fetch 불가능한 IFC source는 최신 IFC URL로 보강한다.
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

  // 현재 IFC URL이 직접 fetch 가능하면 그대로 쓰고, 만료되었거나 접근 불가능하면 최신 IFC source로 보강한다.
  // IFC source가 없으면 mock IFC를 fallback으로 사용한다.
  const freshIfcUrl = useFreshIfcUrl(
    editorProps.currentIfcAssetId,
    editorProps.currentIfcUrl ?? DEFAULT_MOCK_IFC_URL,
    editorProps.projectId ?? null,
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
  const shouldUseSavedFloorLayerFilter = editorProps.floorLayers.length > 0
  const handlePreviewCapture = useCallback((imageUrl: string) => {
    saveProjectWorkspaceThumbnail(editorProps.projectId, '3d', imageUrl)
  }, [editorProps.projectId])

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
      onSelectWallForChat={editorProps.selectWallForChat}
      onIfcElementTransformCommit={editorProps.handleCommitIfcElementTransform}
      libraryElements={editorProps.libraryElements}
      onAddLibraryPreset={editorProps.handleAddLibraryPreset}
      onLibraryElementChange={editorProps.handleChangeLibraryElement}
      onLibraryElementDelete={editorProps.handleDeleteLibraryElement}
      localFloorData={editorProps.localFloorData}
      onStoreysLoad={editorProps.handleIfcStoreysLoad}
      activeStoreyExpressId={shouldUseSavedFloorLayerFilter ? undefined : editorProps.activeIfcStoreyExpressId}
      overlayIfcStoreyExpressIds={shouldUseSavedFloorLayerFilter ? undefined : editorProps.overlayIfcStoreyExpressIds}
      overlayIfcStoreyOpacityByExpressId={shouldUseSavedFloorLayerFilter ? undefined : overlayIfcStoreyOpacityByExpressId}
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
      onPreviewCapture={handlePreviewCapture}
    />
  )
}
