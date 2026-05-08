interface ThreeDCanvasCollaborationOverlayProps {
  isVisible: boolean
}

/** 3D 협업 모드 시 편집 가능 영역을 시각적으로 구분하는 반투명 오버레이 */
export default function ThreeDCanvasCollaborationOverlay({
  isVisible,
}: ThreeDCanvasCollaborationOverlayProps) {
  if (!isVisible) return null

  return <div className="pointer-events-none absolute inset-0 bg-[#2A2E35]/20" />
}
