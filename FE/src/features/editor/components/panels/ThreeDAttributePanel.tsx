/**
 * ThreeDAttributePanel — 3D 모드 선택 요소 속성 편집 패널
 *
 * 선택된 요소에 따라 두 가지 화면을 표시한다.
 *  - IFC 요소 또는 라이브러리 프리셋: 이름·클래스·치수(길이·높이·두께)·재질·색상 편집
 *  - 버블(공간): 이름·치수(읽기 전용)·재질·색상 편집
 *  - 아무것도 선택되지 않음: 안내 문구 표시
 */
import { ColorSelector } from '../shared/ColorSelector'
import { MaterialSelector } from '../shared/MaterialSelector'
import type { IfcElementInfo } from '../../types'
import type { BubbleInfo } from './BubbleAttributePanel'

/** ThreeDAttributePanel 컴포넌트 props */
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

/**
 * 읽기 전용 속성값 표시 인풋.
 * 이름·클래스·카테고리 등 편집 불가 필드를 회색 배경으로 표시한다.
 */
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

/** 숫자 입력 필드. 양수 값만 허용하며 변경 시 onChange를 호출한다. */
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

/** IFC 요소 및 라이브러리 프리셋의 치수·재질·색상 편집 폼 */
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
      <div className="grid grid-cols-2 gap-3">
        <ReadOnlyInput label="이름" value={element.name} />
        <ReadOnlyInput label="클래스" value={element.ifcClass} />
        <ReadOnlyInput label="카테고리" value={element.category} />
        <ReadOnlyInput label="ExpressID" value={String(element.expressId ?? '-')} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <NumberInput label="길이 (mm)" value={element.lengthMm} onChange={(value) => onLengthChange(element.id, value)} />
        <NumberInput label="높이 (mm)" value={element.heightMm} onChange={(value) => onHeightChange(element.id, value)} />
        <NumberInput label="두께 (mm)" value={element.thicknessMm} onChange={(value) => onThicknessChange?.(element.id, value)} />
      </div>

      <MaterialSelector
        value={element.material}
        fallbackLabel={element.source === 'ifc' ? '미지정' : undefined}
        onChange={(material) => onMaterialChange?.(element.id, material)}
      />
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
