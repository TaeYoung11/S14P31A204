import { useEffect, useState } from 'react'
import { CheckCircle2, Download, FileCode2, X } from 'lucide-react'
import type { IfcElementChange } from '../../types'
import { applyIfcElementChanges, downloadIfcText } from '../../services/ifcChange.service'

interface IFCExportModalProps {
  isOpen: boolean
  onClose: () => void
  ifcElementChanges?: IfcElementChange[]
}

export function IFCExportModal({ isOpen, onClose, ifcElementChanges = [] }: IFCExportModalProps) {
  const [progress, setProgress] = useState(0)
  const [isDownloading, setIsDownloading] = useState(false)
  const done = progress >= 100

  useEffect(() => {
    if (!isOpen) return

    const interval = window.setInterval(() => {
      setProgress((prev) => {
        const next = Math.min(prev + 8, 100)
        if (next === 100) {
          window.clearInterval(interval)
        }
        return next
      })
    }, 80)

    return () => window.clearInterval(interval)
  }, [isOpen])

  if (!isOpen) return null

  const handleDownload = async () => {
    setIsDownloading(true)
    try {
      const response = await fetch('/mock/shinchan_house.ifc')
      const sourceIfcText = await response.text()
      const nextIfcText = ifcElementChanges.length > 0
        ? await applyIfcElementChanges(sourceIfcText, ifcElementChanges)
        : sourceIfcText
      downloadIfcText('project_export.ifc', nextIfcText)
      onClose()
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-[#0A0A0B]/70 backdrop-blur-md" />
      <div className="relative w-[460px] overflow-hidden rounded-[28px] bg-white shadow-[0_50px_120px_rgba(0,0,0,0.35)]">
        <div className="flex items-center justify-between border-b border-[#F0F2F9] px-8 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F0F2FF]">
              <FileCode2 size={20} className="text-[#3B45B3]" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ADB5BD]">IFC Export</p>
              <h2 className="text-[17px] font-black text-[#1C1C1E]">Export edited model</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8E95A3] transition-colors hover:bg-[#F3F6FD] hover:text-[#3B45B3]"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col items-center px-8 py-9">
          <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-[#F0F2FF]">
            {done ? (
              <CheckCircle2 size={42} className="text-[#3B45B3]" />
            ) : (
              <span className="text-[28px] font-black tabular-nums text-[#3B45B3]">{progress}%</span>
            )}
          </div>

          <div className="mb-7 h-2 w-full overflow-hidden rounded-full bg-[#F0F2F9]">
            <div
              className="h-full rounded-full bg-[#3B45B3] transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>

          <p className="mb-8 text-center text-[13px] font-bold text-[#6B7A99]">
            {done
              ? `${ifcElementChanges.length} edited element changes are ready.`
              : 'Applying FE edit state to the IFC export.'}
          </p>

          <button
            type="button"
            disabled={!done || isDownloading}
            onClick={handleDownload}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#3B45B3] py-4 text-[14px] font-black text-white shadow-xl shadow-[#3B45B3]/30 transition-all hover:bg-[#2D3691] disabled:cursor-not-allowed disabled:bg-[#C5CAD3] disabled:shadow-none"
          >
            <Download size={16} />
            {isDownloading ? 'Exporting IFC...' : 'Download IFC'}
          </button>
        </div>
      </div>
    </div>
  )
}
