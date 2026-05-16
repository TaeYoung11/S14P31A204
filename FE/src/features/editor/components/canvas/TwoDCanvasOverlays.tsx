import { Circle, Group, Line, Text } from 'react-konva'
import { LayoutDashboard, Sparkles } from 'lucide-react'
import type { KonvaEventObject } from 'konva/lib/Node'
import Spinner from '../../../../shared/components/Spinner'
import type { FloorCommentPin } from '../../types'

interface FloorPlanEmptyProps {
  onGenerate?: () => void
  canGenerate?: boolean
}

/**
 * 평면도가 아직 생성되지 않은 경우 표시되는 안내 화면
 * "평면도 생성 시작" 버튼 클릭 시 onGenerate 호출
 */
export function FloorPlanEmpty({ onGenerate, canGenerate = true }: FloorPlanEmptyProps) {
  const description = canGenerate
    ? '버블 다이어그램의 공간 크기와 연결 관계를 바탕으로\n2D 평면도 초안을 자동 생성합니다.'
    : '버블 다이어그램에서 공간을 1개 이상 추가하면\n2D 평면도를 생성할 수 있습니다.'

  const helper = canGenerate
    ? '생성 후 바로 2D 편집 모드로 이어집니다.'
    : '먼저 버블 탭에서 공간을 추가한 뒤 다시 시도해 주세요.'

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-white">
      <div className="mx-6 w-full max-w-[440px] rounded-3xl border border-[#E8ECF8] bg-[#FCFDFF] shadow-sm">
        <div className="flex flex-col items-center gap-5 px-8 pb-7 pt-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[#F0F2FF] shadow-sm">
            <LayoutDashboard size={36} className="text-[#3B45B3]" />
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-[16px] font-extrabold tracking-[-0.01em] text-[#1C1C1E]">
              2D 평면도 자동 생성
            </h3>
            <p className="whitespace-pre-line text-[12px] leading-relaxed text-[#637190]">
              {description}
            </p>
          </div>

          <button
            onClick={onGenerate}
            disabled={!canGenerate}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#3B45B3] px-6 py-3 text-[12px] font-extrabold text-white shadow-md transition-all hover:bg-[#2D3599] hover:shadow-lg active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles size={15} />
            평면도 생성 시작
          </button>

          <p className={`text-[11px] leading-relaxed ${canGenerate ? 'text-[#8A94AB]' : 'text-[#D14343]'}`}>
            {helper}
          </p>
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
  onPinClick?: (id: string) => void
  onPinDelete?: (id: string) => void
  deletingPinId?: string | null
  onMouseEnter?: (e: KonvaEventObject<MouseEvent>) => void
  onMouseLeave?: (e: KonvaEventObject<MouseEvent>) => void
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
  onPinClick,
  onPinDelete,
  deletingPinId,
  onMouseEnter,
  onMouseLeave,
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
        return (
          <Group
            key={pin.id}
            x={pin.x}
            y={pin.y}
            scaleX={markerScale}
            scaleY={markerScale}
            onClick={(e) => {
              e.cancelBubble = true
              onPinClick?.(pin.id)
            }}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
          >
            <Line points={[0, pinRadius, 0, 30]} stroke={isSelected ? '#3B45B3' : '#1C1C1E'} strokeWidth={2.5} />
            <Circle radius={pinRadius} fill={isSelected ? '#3B45B3' : '#1C1C1E'} />
            <Text
              text={indexText}
              x={-pinRadius}
              y={-8}
              width={pinLabelSize}
              align="center"
              fill="white"
              fontSize={14}
              fontStyle="bold"
            />
            {!isSelected && pin.hasUnreadCommentByOtherUser && (
              <Circle x={12} y={-12} radius={5} fill="#ef4444" stroke="white" strokeWidth={1.5} />
            )}
            {canDeletePin && (
              <Group
                x={26}
                y={-24}
                opacity={isDeleting ? 0.5 : 1}
                onClick={(e) => {
                  e.cancelBubble = true
                  if (isDeleting) return
                  onPinDelete?.(pin.id)
                }}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
              >
                <Circle radius={10} fill="white" stroke="#D94848" strokeWidth={1.7} shadowColor="black" shadowOpacity={0.12} shadowBlur={4} />
                <Line points={[-4, -4, 4, 4]} stroke="#D94848" strokeWidth={1.8} lineCap="round" />
                <Line points={[4, -4, -4, 4]} stroke="#D94848" strokeWidth={1.8} lineCap="round" />
              </Group>
            )}
          </Group>
        )
      })}
    </>
  )
}
