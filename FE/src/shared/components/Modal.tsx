import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: React.ReactNode
  children: React.ReactNode
  maxWidth?: string
}

let nextModalId = 0
const modalStack: number[] = []

const removeModalFromStack = (modalId: number) => {
  const index = modalStack.lastIndexOf(modalId)
  if (index >= 0) {
    modalStack.splice(index, 1)
  }
}

export default function Modal({ isOpen, onClose, title, children, maxWidth = 'max-w-[480px]' }: ModalProps) {
  const modalIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!isOpen) return undefined

    if (modalIdRef.current === null) {
      nextModalId += 1
      modalIdRef.current = nextModalId
    }

    const modalId = modalIdRef.current
    modalStack.push(modalId)

    return () => {
      removeModalFromStack(modalId)
    }
  }, [isOpen])

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const modalId = modalIdRef.current
      if (modalId === null) return
      if (modalStack[modalStack.length - 1] !== modalId) return
      onClose()
    }
    if (isOpen) document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="modal-overlay" role="dialog" aria-modal onClick={onClose}>
      <div
        className={`modal-content ${maxWidth}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-6 flex items-center justify-between border-b border-[#eef2f7] pb-5">
          <h2 className="text-xl font-black tracking-tight text-[#111827]">{title}</h2>
          <button id="modal-close-btn" className="project-icon-button h-10 w-10 rounded-xl" onClick={onClose} title="닫기">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
