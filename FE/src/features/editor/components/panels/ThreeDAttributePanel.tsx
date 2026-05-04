import { ColorSelector } from '../shared/ColorSelector'
import { MaterialSelector } from '../shared/MaterialSelector'
import type { IfcElementInfo } from '../../types'
import type { BubbleInfo } from './BubbleAttributePanel'

interface ThreeDAttributePanelProps {
  selectedBubble: BubbleInfo | null
  selectedIfcElement?: IfcElementInfo | null
  onLabelChange: (id: string, label: string) => void
  onWidthChange: (id: string, width: number) => void
  onHeightChange: (id: string, height: number) => void
  onThicknessChange?: (id: string, thickness: number) => void
  onColorChange: (id: string, color: string) => void
  onMaterialChange?: (id: string, material: string) => void
}

function ReadOnlyInput({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">{label}</span>
      <input
        type="text"
        value={value}
        readOnly
        className="rounded-lg border-none bg-[#F8F9FD] px-3 py-2.5 text-xs font-bold text-[#1C1C1E] opacity-75 outline-none"
      />
    </div>
  )
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string
  value?: number
  onChange: (value: number) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">{label}</span>
      <input
        type="number"
        min={1}
        value={value ?? ''}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next) && next > 0) onChange(next)
        }}
        className="rounded-lg border-none bg-[#F8F9FD] px-3 py-2.5 text-xs font-bold text-[#1C1C1E] outline-none focus:ring-1 focus:ring-[#3B45B3]"
      />
    </div>
  )
}

function ElementMetricFields({
  element,
  onLengthChange,
  onHeightChange,
  onThicknessChange,
  onColorChange,
  onMaterialChange,
}: {
  element: IfcElementInfo
  onLengthChange: (id: string, length: number) => void
  onHeightChange: (id: string, height: number) => void
  onThicknessChange?: (id: string, thickness: number) => void
  onColorChange: (id: string, color: string) => void
  onMaterialChange?: (id: string, material: string) => void
}) {
  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="grid grid-cols-3 gap-3">
        <NumberInput label="길이 (mm)" value={element.lengthMm} onChange={(value) => onLengthChange(element.id, value)} />
        <NumberInput label="높이 (mm)" value={element.heightMm} onChange={(value) => onHeightChange(element.id, value)} />
        <NumberInput label="두께 (mm)" value={element.thicknessMm} onChange={(value) => onThicknessChange?.(element.id, value)} />
      </div>

      <MaterialSelector value={element.material} onChange={(material) => onMaterialChange?.(element.id, material)} />
      <ColorSelector value={element.color ?? '#D8DDE8'} onChange={(color) => onColorChange(element.id, color)} />
    </div>
  )
}

export function ThreeDAttributePanel({
  selectedBubble,
  selectedIfcElement,
  onLabelChange,
  onWidthChange,
  onHeightChange,
  onThicknessChange,
  onColorChange,
  onMaterialChange,
}: ThreeDAttributePanelProps) {
  if (selectedIfcElement) {
    return (
      <ElementMetricFields
        element={selectedIfcElement}
        onLengthChange={onWidthChange}
        onHeightChange={onHeightChange}
        onThicknessChange={onThicknessChange}
        onColorChange={onColorChange}
        onMaterialChange={onMaterialChange}
      />
    )
  }

  if (!selectedBubble) {
    return (
      <div className="p-5 text-center text-xs font-medium text-[#ADB5BD]">
        선택된 3D 요소가 없습니다.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-wider text-[#ADB5BD]">이름</span>
          <input
            type="text"
            value={selectedBubble.label}
            onChange={(event) => onLabelChange(selectedBubble.id, event.target.value)}
            className="rounded-lg border-none bg-[#F8F9FD] px-3 py-2.5 text-xs font-bold text-[#1C1C1E] outline-none focus:ring-1 focus:ring-[#3B45B3]"
          />
        </div>

        <ReadOnlyInput label="길이 (mm)" value={Math.round(selectedBubble.widthMm).toLocaleString()} />

        <div className="grid grid-cols-2 gap-3">
          <ReadOnlyInput label="높이 (mm)" value="2,400" />
          <ReadOnlyInput label="두께 (mm)" value="200" />
        </div>

        <MaterialSelector value={selectedBubble.material} onChange={(material) => onMaterialChange?.(selectedBubble.id, material)} />
        <ColorSelector value={selectedBubble.color} onChange={(color) => onColorChange(selectedBubble.id, color)} />
      </div>
    </div>
  )
}
