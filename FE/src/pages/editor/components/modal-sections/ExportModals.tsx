import { ExportModal } from '@/features/editor/components/modals/ExportModal'
import { ExportSelectionModal } from '@/features/editor/components/modals/ExportSelectionModal'
import { IFCExportModal } from '@/features/editor/components/modals/IFCExportModal'
import type { EditorModalLayerProps } from '../../types/editorModalLayerProps'

type ExportModalsProps = Pick<
  EditorModalLayerProps,
  | 'isExportModalOpen'
  | 'onCloseExportModal'
  | 'isExportSelectionModalOpen'
  | 'onCloseExportSelectionModal'
  | 'onOpenExportModal'
  | 'isIFCExportModalOpen'
  | 'onCloseIFCExportModal'
  | 'ifcElementChanges'
  | 'currentIfcUrl'
  | 'currentIfcAssetId'
>

/** 내보내기 관련 모달 묶음 */
export default function ExportModals({
  isExportModalOpen,
  onCloseExportModal,
  isExportSelectionModalOpen,
  onCloseExportSelectionModal,
  onOpenExportModal,
  isIFCExportModalOpen,
  onCloseIFCExportModal,
  ifcElementChanges,
  currentIfcUrl,
  currentIfcAssetId,
}: ExportModalsProps) {
  return (
    <>
      {isExportModalOpen && (
        <ExportModal isOpen onClose={onCloseExportModal} />
      )}

      {isExportSelectionModalOpen && (
        <ExportSelectionModal
          isOpen
          onClose={onCloseExportSelectionModal}
          onStartExport={() => {
            onCloseExportSelectionModal()
            onOpenExportModal()
          }}
        />
      )}

      {isIFCExportModalOpen && (
        <IFCExportModal
          isOpen
          onClose={onCloseIFCExportModal}
          ifcElementChanges={ifcElementChanges}
          sourceIfcUrl={currentIfcUrl}
          sourceIfcAssetId={currentIfcAssetId}
        />
      )}
    </>
  )
}
