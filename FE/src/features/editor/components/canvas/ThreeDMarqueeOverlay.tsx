interface MarqueeRect {
  left: number
  top: number
  width: number
  height: number
}

interface ThreeDMarqueeOverlayProps {
  rect: MarqueeRect | null
}

/**
 * 3D 캔버스 공통 마퀴(드래그 선택 영역) 오버레이.
 */
export default function ThreeDMarqueeOverlay({ rect }: ThreeDMarqueeOverlayProps) {
  if (!rect) return null
  return (
    <div
      className="pointer-events-none absolute z-20 border border-[#3B45B3] bg-[#3B45B3]/10"
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }}
    />
  )
}
