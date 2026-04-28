import type { ChangeEvent, MutableRefObject } from 'react'

interface AssistantImportSectionProps {
  isImporting: boolean
  fileInputRef: MutableRefObject<HTMLInputElement | null>
  onSampleImport: () => void
  onPickJsonFile: () => void
  onJsonFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>
}

/** BATANG 2D JSON 임시 import 영역 */
export function AssistantImportSection({
  isImporting,
  fileInputRef,
  onSampleImport,
  onPickJsonFile,
  onJsonFileChange,
}: AssistantImportSectionProps) {
  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={onJsonFileChange}
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={onSampleImport}
          disabled={isImporting}
          className="rounded-lg border border-[#E2E6EF] px-3 py-1.5 text-[11px] font-bold text-[#334155] disabled:opacity-50"
        >
          샘플 2D 불러오기
        </button>
        <button
          onClick={onPickJsonFile}
          disabled={isImporting}
          className="rounded-lg border border-[#E2E6EF] px-3 py-1.5 text-[11px] font-bold text-[#334155] disabled:opacity-50"
        >
          2D JSON 파일 불러오기
        </button>
      </div>
    </>
  )
}
