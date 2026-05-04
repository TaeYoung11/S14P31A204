import { useCallback, useState } from 'react'

interface UseEditorExportGuardParams {
  canStartSaveFlow: () => boolean
}

/**
 * 내보내기 진입 가드 훅.
 * - 저장 차단 조건을 통과한 경우에만 Export/IFC 모달을 연다.
 */
export function useEditorExportGuard({ canStartSaveFlow }: UseEditorExportGuardParams) {
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [isExportSelectionModalOpen, setIsExportSelectionModalOpen] = useState(false)
  const [isIFCExportModalOpen, setIsIFCExportModalOpen] = useState(false)

  /** 저장 가능 상태일 때만 모달을 연다. */
  const openGuardedModal = useCallback((open: () => void) => {
    if (!canStartSaveFlow()) return
    open()
  }, [canStartSaveFlow])

  const handleOpenExportSelectionModal = useCallback(() => {
    openGuardedModal(() => setIsExportSelectionModalOpen(true))
  }, [openGuardedModal])

  const handleOpenExportModal = useCallback(() => {
    openGuardedModal(() => setIsExportModalOpen(true))
  }, [openGuardedModal])

  const handleOpenIFCExportModal = useCallback(() => {
    openGuardedModal(() => setIsIFCExportModalOpen(true))
  }, [openGuardedModal])

  return {
    isExportModalOpen,
    isExportSelectionModalOpen,
    isIFCExportModalOpen,
    handleOpenExportSelectionModal,
    handleOpenExportModal,
    handleOpenIFCExportModal,
    closeExportModal: () => setIsExportModalOpen(false),
    closeExportSelectionModal: () => setIsExportSelectionModalOpen(false),
    closeIFCExportModal: () => setIsIFCExportModalOpen(false),
  }
}
