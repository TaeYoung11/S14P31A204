import { Circle, Group, Line, Rect, Text } from 'react-konva'
import { LayoutDashboard, Sparkles } from 'lucide-react'
import Spinner from '../../../../shared/components/Spinner'
import type { CanvasViewTransform, FloorCommentPin } from '../../types'
import { rotatePointAround } from '../../utils/canvasViewTransform'

interface FloorPlanEmptyProps {
  onGenerate?: () => void
  canGenerate?: boolean
  /** 기존 IFC source 조회가 끝나지 않은 상태 */
  isCheckingIfcSource?: boolean
}

/**
 * 평면도가 아직 생성되지 않은 경우 표시되는 안내 화면
 */
export function FloorPlanEmpty({ onGenerate, canGenerate = true, isCheckingIfcSource = false }: FloorPlanEmptyProps) {
  const isButtonEnabled = canGenerate && !isCheckingIfcSource
  const description = isCheckingIfcSource
    ? '기존 IFC 상태를 확인하는 중입니다...'
    : canGenerate
      ? '생성 후 2D 편집이 열립니다.'
      : '버블 공간을 1개 이상 추가해 주세요.'

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-white">
      <div className="mx-6 w-full max-w-[440px] rounded-3xl border border-[#E8ECF8] bg-[#FCFDFF] shadow-sm">
        <div className="flex flex-col items-center gap-5 px-8 pb-7 pt-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[#F0F2FF] shadow-sm">
            <LayoutDashboard size={36} className="text-[#3B45B3]" />
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-[16px] font-extrabold tracking-[-0.01em] text-[#1C1C1E]">
              평면도 편집 시작
            </h3>
            <p className="whitespace-pre-line text-[12px] leading-relaxed text-[#637190]">
              {description}
            </p>
          </div>

          <button
            onClick={onGenerate}
            disabled={!isButtonEnabled}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#3B45B3] px-6 py-3 text-[12px] font-extrabold text-white shadow-md transition-all hover:bg-[#2D3599] hover:shadow-lg active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles size={15} />
            평면도 자동 생성
          </button>

        </div>
      </div>
    </div>
  )
}

/**
 * 평면도 생성 중에 표시되는 로딩 화면
 * 진행 애니메이션 바를 포함한다.
 */
export function FloorPlanLoading() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-5">
        <div className="relative">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[#F0F2FF]">
            <LayoutDashboard size={36} className="text-[#3B45B3] opacity-40" />
          </div>
          <div className="absolute -bottom-2 -right-2">
            <Spinner size="md" className="text-[#3B45B3]" />
          </div>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-[13px] font-extrabold text-[#3B45B3]">평면도 생성 중...</p>
          <p className="text-[11px] text-[#6B7A99]">버블 다이어그램을 분석하고 레이아웃을 배치하는 중입니다</p>
        </div>
        <div className="h-1.5 w-48 overflow-hidden rounded-full bg-[#E2E6EF]">
          <div className="h-full animate-[progress_1.8s_ease-in-out_forwards] rounded-full bg-[#3B45B3]" />
        </div>
      </div>
    </div>
  )
}

interface CollaborationPinOverlayProps {
  pins: FloorCommentPin[]
  viewportScale: number
  selectedPinId?: string | null
  currentUserId?: string | null
  viewTransform?: CanvasViewTransform | null
  onPinDelete?: (id: string) => void
  deletingPinId?: string | null
}

/**
 * 2D 협업 모드에서 평면도 위에 렌더링되는 핀 오버레이
 * 핀 클릭 시 해당 스레드 탭으로 이동한다.
 */
export function CollaborationPinOverlay({
  pins,
  viewportScale,
  selectedPinId,
  currentUserId,
  viewTransform = null,
  onPinDelete,
  deletingPinId,
}: CollaborationPinOverlayProps) {
  const inverseScale = 1 / Math.max(viewportScale, 0.01)
  const markerScale = Math.min(Math.max(inverseScale, 0.65), 2.2)

  return (
    <>
      {pins.map((pin, index) => {
        const isSelected = selectedPinId === pin.id
        const canDeletePin =
          isSelected &&
          Boolean(onPinDelete) &&
          Boolean(currentUserId) &&
          pin.createdById === currentUserId
        const isDeleting = deletingPinId === pin.id
        const indexText = String(index + 1)
        const pinRadius = 16
        const pinLabelSize = pinRadius * 2
        const displayPosition = viewTransform
          ? rotatePointAround(
              { x: pin.x, y: pin.y },
              viewTransform.rotationRadians,
              viewTransform.centerX,
              viewTransform.centerY,
            )
          : { x: pin.x, y: pin.y }
        return (
          <Group
            key={pin.id}
            name="comment-pin-overlay"
            x={displayPosition.x}
            y={displayPosition.y}
            scaleX={markerScale}
            scaleY={markerScale}
            listening={false}
          >
            <Circle radius={22} fill="rgba(0,0,0,0.01)" />
            <Rect x={-10} y={10} width={20} height={26} fill="rgba(0,0,0,0.01)" />
            <Line points={[0, pinRadius, 0, 30]} stroke={isSelected ? '#3B45B3' : '#1C1C1E'} strokeWidth={2.5} listening={false} />
            <Circle radius={pinRadius} fill={isSelected ? '#3B45B3' : '#1C1C1E'} listening={false} />
            <Text
              text={indexText}
              x={-pinRadius}
              y={-8}
              width={pinLabelSize}
              align="center"
              fill="white"
              fontSize={14}
              fontStyle="bold"
              listening={false}
            />
            {!isSelected && pin.hasUnreadCommentByOtherUser && (
              <Circle x={12} y={-12} radius={5} fill="#ef4444" stroke="white" strokeWidth={1.5} listening={false} />
            )}
            {canDeletePin && (
              <Group
                x={26}
                y={-24}
                opacity={isDeleting ? 0.5 : 1}
              >
                <Circle radius={16} fill="rgba(0,0,0,0.01)" />
                <Circle radius={10} fill="white" stroke="#D94848" strokeWidth={1.7} shadowColor="black" shadowOpacity={0.12} shadowBlur={4} />
                <Line points={[-4, -4, 4, 4]} stroke="#D94848" strokeWidth={1.8} lineCap="round" listening={false} />
                <Line points={[4, -4, -4, 4]} stroke="#D94848" strokeWidth={1.8} lineCap="round" listening={false} />
              </Group>
            )}
          </Group>
        )
      })}
    </>
  )
}
