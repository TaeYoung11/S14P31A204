interface ThreeDCanvasGridOverlayProps {
  isVisible: boolean
}

/**
 * 3D 모드 원근 그리드 오버레이.
 * 캔버스와 상호작용 충돌을 피하기 위해 pointer-events를 비활성화한다.
 */
export default function ThreeDCanvasGridOverlay({ isVisible }: ThreeDCanvasGridOverlayProps) {
  if (!isVisible) return null

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute bottom-[-20%] left-[-20%] right-[-20%] top-[-20%]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(59,69,179,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59,69,179,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
          transform: 'perspective(1200px) rotateX(60deg)',
          transformOrigin: 'center center',
        }}
      />
    </div>
  )
}
