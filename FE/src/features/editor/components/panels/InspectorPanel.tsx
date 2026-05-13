// 속성, 층 보기, 계층 구조를 하나의 컴팩트 인스펙터로 표시합니다.
import { Box, Eye, EyeOff, Layers, Plus, SlidersHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'
import type { PanelOffset } from '../../types'
import { PanelFrame } from '../shared/PanelFrame'
import { BubbleAttributePanel } from './BubbleAttributePanel'
import { ThreeDAttributePanel } from './ThreeDAttributePanel'
import { TwoDAttributePanel } from './TwoDAttributePanel'
import type {
  AttributesSectionProps,
  FloorViewSectionProps,
  HierarchySectionProps,
} from '../layout/right-panels/buildRightPanelSectionProps'

interface InspectorPanelProps {
  attributesPanelProps: AttributesSectionProps
  floorViewPanelProps: FloorViewSectionProps | null
  hierarchyPanelProps: HierarchySectionProps | null
}

interface InspectorSectionProps {
  title: string
  icon: ReactNode
  children: ReactNode
}

const HIERARCHY_GROUPS = [
  { id: 'ext', name: '외피 요소', children: ['벽체-01', '벽체-02', '창호-01'] },
  { id: 'int', name: '실내 공간', children: ['거실', '주방', '침실'] },
  { id: 'roof', name: '상부 구조', children: ['지붕-A'] },
]

function InspectorSection({ title, icon, children }: InspectorSectionProps) {
  return (
    <section className="rounded-lg border border-[#E2E8F0] bg-white shadow-sm">
      <div className="flex items-center gap-1.5 border-b border-[#EEF2F7] px-2.5 py-1.5">
        <span className="text-[#3B45B3]">{icon}</span>
        <h3 className="text-[11px] font-extrabold text-[#1F2937]">{title}</h3>
      </div>
      <div className="max-h-[190px] overflow-y-auto p-2 text-[11px]">
        {children}
      </div>
    </section>
  )
}

function AttributeSection(props: AttributesSectionProps) {
  if (props.mode === 'bubble') {
    return (
      <BubbleAttributePanel
        selectedBubble={props.selectedBubble}
        onLabelChange={props.onLabelChange}
        onTypeChange={props.onTypeChange}
        onWidthChange={props.onWidthChange}
        onHeightChange={props.onHeightChange}
        onRatioChange={props.onRatioChange}
        onColorChange={props.onColorChange}
        connections={props.connections}
        zones={props.zones}
      />
    )
  }

  if (props.mode === '2d') {
    return (
      <TwoDAttributePanel
        selectedBubble={props.selectedBubble}
        selectedWall={props.selectedWall}
        selectedOpening={props.selectedOpening}
        onLabelChange={props.onLabelChange}
        onTypeChange={props.onTypeChange}
        onWidthChange={props.onWidthChange}
        onHeightChange={props.onHeightChange}
        onWidthCommit={props.onWidthCommit}
        onHeightCommit={props.onHeightCommit}
        onRatioChange={props.onRatioChange}
        onWallTypeChange={props.onWallTypeChange}
        onWallThicknessChange={props.onWallThicknessChange}
        onWallHeightChange={props.onWallHeightChange}
        onWallMaterialChange={props.onWallMaterialChange}
        onOpeningSizeChange={props.onOpeningSizeChange}
        onWindowSillHeightChange={props.onWindowSillHeightChange}
        onDoorSwingDirectionChange={props.onDoorSwingDirectionChange}
        onDoorHingeSideChange={props.onDoorHingeSideChange}
      />
    )
  }

  return (
    <ThreeDAttributePanel
      selectedBubble={props.selectedBubble}
      selectedIfcElement={props.selectedIfcElement}
      onLabelChange={props.onLabelChange}
      onWidthChange={props.onWidthChange}
      onHeightChange={props.onHeightChange}
      onThicknessChange={props.onThicknessChange}
      onColorChange={props.onColorChange}
      onMaterialChange={props.onMaterialChange}
    />
  )
}

function FloorViewSection({ panelProps }: { panelProps: FloorViewSectionProps | null }) {
  if (!panelProps) {
    return <p className="text-[11px] text-[#94A3B8]">층 정보가 없습니다.</p>
  }

  const layers = panelProps.layers ?? []
  const selectedOverlaySet = new Set(panelProps.selectedOverlayLayerIds ?? [])

  if (!panelProps.isGenerated) {
    return <p className="py-2 text-center text-[11px] text-[#94A3B8]">도면 생성 후 층을 확인할 수 있습니다.</p>
  }

  return (
    <div className="space-y-1.5">
      {layers.map((layer, index) => {
        const isActive = panelProps.activeLayerId === layer.id
        const isOverlaySelected = selectedOverlaySet.has(layer.id)
        return (
          <div
            key={layer.id}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 ${
              isActive ? 'border-[#C8D2FF] bg-[#F4F6FF]' : 'border-[#EEF2F7] bg-[#FCFDFF]'
            }`}
          >
            <button
              type="button"
              onClick={() => panelProps.onSelectLayer?.(layer.id)}
              className="min-w-0 flex-1 text-left"
            >
              <p className={`truncate text-[11px] font-bold ${isActive ? 'text-[#3B45B3]' : 'text-[#334155]'}`}>
                {layer.name || `${index + 1}F`}
              </p>
              <p className="text-[9px] text-[#94A3B8]">{isActive ? '현재 층' : '비활성 층'}</p>
            </button>
            <button
              type="button"
              onClick={() => {
                if (isActive) return
                if (!panelProps.isLayerOverlayMode) panelProps.onToggleLayerOverlayMode?.()
                panelProps.onToggleOverlayLayer?.(layer.id)
              }}
              disabled={isActive}
              className={`rounded p-1 ${
                isActive
                  ? 'cursor-not-allowed text-[#CBD5E1]'
                  : isOverlaySelected
                    ? 'bg-[#3B45B3] text-white'
                    : 'text-[#64748B] hover:bg-[#EEF2FF] hover:text-[#3B45B3]'
              }`}
              aria-label="층 오버레이"
            >
              {isOverlaySelected ? <Eye size={12} /> : <EyeOff size={12} />}
            </button>
          </div>
        )
      })}
      <button
        type="button"
        onClick={panelProps.onAddLayer}
        className="mt-1 inline-flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-[#CBD5E1] py-1.5 text-[11px] font-bold text-[#64748B] hover:border-[#3B45B3] hover:text-[#3B45B3]"
      >
        <Plus size={12} />
        층 추가
      </button>
    </div>
  )
}

function HierarchySection({ panelProps }: { panelProps: HierarchySectionProps | null }) {
  if (!panelProps) {
    return <p className="text-[11px] text-[#94A3B8]">계층 정보가 없습니다.</p>
  }

  return (
    <div className="space-y-2">
      {HIERARCHY_GROUPS.map((group) => (
        <div key={group.id}>
          <div className="flex items-center justify-between rounded-md bg-[#F8FAFC] px-2 py-1">
            <span className="truncate text-[11px] font-extrabold text-[#334155]">{group.name}</span>
            <Eye size={11} className="text-[#94A3B8]" />
          </div>
          <div className="ml-2 mt-1 space-y-1 border-l border-[#E2E8F0] pl-2">
            {group.children.map((child) => (
              <div key={child} className="flex items-center justify-between rounded px-1.5 py-0.5 text-[10px] text-[#64748B]">
                <span className="truncate">{child}</span>
                <Eye size={10} className="text-[#CBD5E1]" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function InspectorPanel({
  attributesPanelProps,
  floorViewPanelProps,
  hierarchyPanelProps,
}: InspectorPanelProps) {
  const inspectorOffset: PanelOffset = attributesPanelProps.offset
  const inspectorWidth = Math.max(attributesPanelProps.width, 320)
  const inspectorHeight = Math.max(attributesPanelProps.height, 560)

  return (
    <PanelFrame
      panelKey="attributes"
      title="인스펙터"
      titleIcon={<SlidersHorizontal size={14} className="text-[#3B45B3]" />}
      isOpen={attributesPanelProps.isOpen}
      offset={inspectorOffset}
      width={inspectorWidth}
      height={inspectorHeight}
      zIndex={attributesPanelProps.zIndex}
      onDragStart={attributesPanelProps.onDragStart}
      onResizeStart={attributesPanelProps.onResizeStart}
      onToggle={attributesPanelProps.onToggle}
    >
      <div className="h-full min-h-0 overflow-y-auto bg-[#F8FAFC] p-2.5 pb-3">
        <div className="space-y-2.5">
          <InspectorSection title="속성 관리자" icon={<SlidersHorizontal size={13} />}>
            <AttributeSection {...attributesPanelProps} />
          </InspectorSection>
          <InspectorSection title="층 보기" icon={<Layers size={13} />}>
            <FloorViewSection panelProps={floorViewPanelProps} />
          </InspectorSection>
          <InspectorSection title="계층 구조" icon={<Box size={13} />}>
            <HierarchySection panelProps={hierarchyPanelProps} />
          </InspectorSection>
        </div>
      </div>
    </PanelFrame>
  )
}
