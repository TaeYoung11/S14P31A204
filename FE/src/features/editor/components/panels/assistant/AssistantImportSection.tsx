import type { ChangeEvent, MutableRefObject } from 'react'

interface AssistantImportSectionProps {
  isImporting: boolean
  ifcFileInputRef: MutableRefObject<HTMLInputElement | null>
  onPickIfcFile: () => void
  onIfcFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>
}

/** IFC import 영역 */
export function AssistantImportSection({
  isImporting,
  ifcFileInputRef,
  onPickIfcFile,
  onIfcFileChange,
}: AssistantImportSectionProps) {
  return (
    <>
      <input
        ref={ifcFileInputRef}
        type="file"
        accept=".ifc,text/plain"
        className="hidden"
        onChange={onIfcFileChange}
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={onPickIfcFile}
          disabled={isImporting}
          className="rounded-lg border border-[#E2E6EF] px-3 py-1.5 text-[11px] font-bold text-[#334155] disabled:opacity-50"
        >
          IFC 파일 불러오기
        </button>
      </div>
    </>
  )
}
