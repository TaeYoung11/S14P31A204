/**
 * ThreeDAttributePanel — 3D 모드 선택 요소 속성 편집 패널
 *
 * 선택된 요소에 따라 두 가지 화면을 표시한다.
 *  - IFC 요소 또는 라이브러리 프리셋: 이름·클래스·치수(길이·높이·두께)·재질·색상 편집
 *  - 버블(공간): 이름·치수(읽기 전용)·재질·색상 편집
 *  - 아무것도 선택되지 않음: 안내 문구 표시
 */
import { useState, useEffect, useRef } from 'react'
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

/**
 * 숫자 입력 필드. 양수 값만 허용하며 변경 시 onChange를 호출한다.
 * - 입력 중(포커스)에는 draft 값을 유지해 필드를 완전히 지우고 새 값을 입력할 수 있다.
 * - blur 시 유효하지 않은 값이면 외부 value로 복원한다.
 */
function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string
  value?: number
  onChange: (value: number) => void
}) {
  const [draft, setDraft] = useState(value != null ? String(value) : '')
  const isFocusedRef = useRef(false)

  useEffect(() => {
    // 포커스 중이 아닐 때만 외부 value와 동기화한다.
    if (!isFocusedRef.current) {
      setDraft(value != null ? String(value) : '')
    }
  }, [value])

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">{label}</span>
      <input
        type="number"
        min={1}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value)
          const next = Number(event.target.value)
          if (Number.isFinite(next) && next > 0) onChange(next)
        }}
        onFocus={() => { isFocusedRef.current = true }}
        onBlur={() => {
          isFocusedRef.current = false
          const parsed = Number(draft)
          // 유효하지 않은 값이면 외부 value로 복원
          if (!Number.isFinite(parsed) || parsed <= 0) {
            setDraft(value != null ? String(value) : '')
          }
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
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

        <div className="grid grid-cols-2 gap-3">
          <ReadOnlyInput label="가로 (mm)" value={Math.round(selectedBubble.widthMm).toLocaleString()} />
          <ReadOnlyInput label="세로 (mm)" value={Math.round(selectedBubble.heightMm).toLocaleString()} />
        </div>

        {/* 3D 뷰에서 층고는 고정값으로 렌더됨 */}
        <ReadOnlyInput label="층고 (mm)" value="2,400" />

        <MaterialSelector value={selectedBubble.material} onChange={(material) => onMaterialChange?.(selectedBubble.id, material)} />
        <ColorSelector value={selectedBubble.color} onChange={(color) => onColorChange(selectedBubble.id, color)} />
      </div>
    </div>
  )
}
