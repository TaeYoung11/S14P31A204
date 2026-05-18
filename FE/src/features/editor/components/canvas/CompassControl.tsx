import { useRef, useState } from 'react'

interface CompassControlProps {
  rotationRadians: number
  onRotationChange: (radians: number) => void
}

interface CompassDragState {
  pointerId: number
  centerX: number
  centerY: number
  startMouseAngle: number
  startRotation: number
}

function getPointerAngle(event: Pick<PointerEvent, 'clientX' | 'clientY'>, centerX: number, centerY: number) {
  return Math.atan2(event.clientY - centerY, event.clientX - centerX)
}

function formatDegrees(radians: number) {
  const degrees = (radians * 180) / Math.PI
  return `${Math.round(degrees)} deg`
}

export function CompassControl({ rotationRadians, onRotationChange }: CompassControlProps) {
  const controlRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<CompassDragState | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const endDrag = (pointerId?: number) => {
    const dragState = dragStateRef.current
    if (pointerId !== undefined && dragState && dragState.pointerId !== pointerId) return
    dragStateRef.current = null
    setIsDragging(false)
  }

  return (
    <div
      ref={controlRef}
      role="slider"
      tabIndex={0}
      aria-label={'\uC2DC\uC810 \uD68C\uC804'}
      aria-valuetext={formatDegrees(rotationRadians)}
      className={`flex h-14 w-14 select-none items-center justify-center rounded-full border border-[#D8E0F2] bg-white text-[#3B45B3] shadow-[0_8px_18px_rgba(15,23,42,0.16)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#3B45B3]/35 ${
        isDragging ? 'cursor-grabbing' : 'cursor-grab'
      }`}
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const rect = e.currentTarget.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        dragStateRef.current = {
          pointerId: e.pointerId,
          centerX,
          centerY,
          startMouseAngle: getPointerAngle(e.nativeEvent, centerX, centerY),
          startRotation: rotationRadians,
        }
        e.currentTarget.setPointerCapture(e.pointerId)
        setIsDragging(true)
      }}
      onPointerMove={(e) => {
        const dragState = dragStateRef.current
        if (!dragState || dragState.pointerId !== e.pointerId) return
        e.preventDefault()
        e.stopPropagation()
        const currentMouseAngle = getPointerAngle(e.nativeEvent, dragState.centerX, dragState.centerY)
        onRotationChange(dragState.startRotation + currentMouseAngle - dragState.startMouseAngle)
      }}
      onPointerUp={(e) => {
        e.stopPropagation()
        endDrag(e.pointerId)
      }}
      onPointerCancel={(e) => {
        e.stopPropagation()
        endDrag(e.pointerId)
      }}
      onLostPointerCapture={(e) => {
        endDrag(e.pointerId)
      }}
      onClick={(e) => {
        e.stopPropagation()
      }}
      onDoubleClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onRotationChange(0)
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        e.stopPropagation()
        onRotationChange(0)
      }}
    >
      <div className="relative h-9 w-9 rounded-full border border-[#E2E8F0] bg-[#F8FAFC]">
        <div
          className="absolute inset-1"
          style={{ transform: `rotate(${rotationRadians}rad)` }}
        >
          <div className="absolute left-1/2 top-0 -translate-x-1/2 text-[11px] font-black leading-none text-[#D7263D]">
            N
          </div>
          <div className="absolute left-1/2 top-3 h-4 w-[2px] -translate-x-1/2 rounded-full bg-[#3B45B3]" />
        </div>
        <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#3B45B3]" />
      </div>
    </div>
  )
}
