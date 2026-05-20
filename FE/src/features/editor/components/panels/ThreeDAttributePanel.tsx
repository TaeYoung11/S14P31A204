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

const logRoofDebug = (..._args: unknown[]) => {}

/** ThreeDAttributePanel 컴포넌트 props */
interface ThreeDAttributePanelProps {
  selectedBubble: BubbleInfo | null
  selectedIfcElement?: IfcElementInfo | null
  isEditingLocked?: boolean
  onLabelChange: (id: string, label: string) => void
  onWidthChange: (id: string, width: number) => void
  onHeightChange: (id: string, height: number) => void
  onThicknessChange?: (id: string, thickness: number) => void
  onPositionChange?: (id: string, axis: 'x' | 'y' | 'z', value: number) => void
  onRotationChange?: (id: string, axis: 'x' | 'y' | 'z', degrees: number) => void
  onRoofShapeChange?: (id: string, shape: 'flat' | 'gable') => void
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
  step,
  min,
  disabled = false,
}: {
  label: string
  value?: number
  onChange: (value: number) => void
  step?: number
  min?: number
  disabled?: boolean
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
        min={min ?? 1}
        step={step}
        value={draft}
        disabled={disabled}
        onChange={(event) => {
          setDraft(event.target.value)
          const next = Number(event.target.value)
          if (!Number.isFinite(next)) return
          const lowerBound = min ?? 1
          if (next < lowerBound) return
          onChange(next)
        }}
        onFocus={() => {
          isFocusedRef.current = true
        }}
        onBlur={() => {
          isFocusedRef.current = false
          const parsed = Number(draft)
          const lowerBound = min ?? 1
          if (!Number.isFinite(parsed) || parsed < lowerBound) {
            setDraft(value != null ? String(value) : '')
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
        className="rounded-lg border-none bg-[#F8F9FD] px-3 py-2.5 text-xs font-bold text-[#1C1C1E] outline-none focus:ring-1 focus:ring-[#3B45B3] disabled:cursor-not-allowed disabled:opacity-55"
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
  onPositionChange,
  onRotationChange,
  onRoofShapeChange,
  onColorChange,
  onMaterialChange,
  isEditingLocked = false,
}: {
  element: IfcElementInfo
  onLengthChange: (id: string, length: number) => void
  onHeightChange: (id: string, height: number) => void
  onThicknessChange?: (id: string, thickness: number) => void
  onPositionChange?: (id: string, axis: 'x' | 'y' | 'z', value: number) => void
  onRotationChange?: (id: string, axis: 'x' | 'y' | 'z', degrees: number) => void
  onRoofShapeChange?: (id: string, shape: 'flat' | 'gable') => void
  onColorChange: (id: string, color: string) => void
  onMaterialChange?: (id: string, material: string) => void
  isEditingLocked?: boolean
}) {
  const canEditTransform = element.source === 'library' || element.source === 'ifc'
  const isRoofElement = element.category.toLowerCase() === 'roof' || element.ifcClass.toLowerCase() === 'ifcroof'
  const roofShape = element.roofShape
    ?? ((typeof element.properties.RoofShape === 'string' && element.properties.RoofShape === 'gable') ? 'gable' : 'flat')
  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="grid grid-cols-2 gap-3">
        <ReadOnlyInput label="이름" value={element.name} />
        <ReadOnlyInput label="클래스" value={element.ifcClass} />
        <ReadOnlyInput label="카테고리" value={element.category} />
        <ReadOnlyInput label="ExpressID" value={String(element.expressId ?? '-')} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <NumberInput label="크기 W (mm)" value={element.lengthMm} onChange={(value) => onLengthChange(element.id, value)} disabled={isEditingLocked} />
        <NumberInput label="크기 H (mm)" value={element.heightMm} onChange={(value) => onHeightChange(element.id, value)} disabled={isEditingLocked} />
        <NumberInput label="크기 D (mm)" value={element.thicknessMm} onChange={(value) => onThicknessChange?.(element.id, value)} disabled={isEditingLocked} />
      </div>

      {canEditTransform && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <NumberInput
              label="위치 X"
              value={element.positionX ?? 0}
              step={0.1}
              min={-999999}
              onChange={(value) => onPositionChange?.(element.id, 'x', value)}
              disabled={isEditingLocked}
            />
            <NumberInput
              label="위치 Y"
              value={element.positionY ?? 0}
              step={0.1}
              min={-999999}
              onChange={(value) => onPositionChange?.(element.id, 'y', value)}
              disabled={isEditingLocked}
            />
            <NumberInput
              label="위치 Z"
              value={element.positionZ ?? 0}
              step={0.1}
              min={-999999}
              onChange={(value) => onPositionChange?.(element.id, 'z', value)}
              disabled={isEditingLocked}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <NumberInput
              label="회전 X (deg)"
              value={element.rotationX ?? 0}
              step={1}
              min={-3600}
              onChange={(value) => onRotationChange?.(element.id, 'x', value)}
              disabled={isEditingLocked}
            />
            <NumberInput
              label="회전 Y (deg)"
              value={element.rotationY ?? 0}
              step={1}
              min={-3600}
              onChange={(value) => onRotationChange?.(element.id, 'y', value)}
              disabled={isEditingLocked}
            />
            <NumberInput
              label="회전 Z (deg)"
              value={element.rotationZ ?? 0}
              step={1}
              min={-3600}
              onChange={(value) => onRotationChange?.(element.id, 'z', value)}
              disabled={isEditingLocked}
            />
          </div>
        </>
      )}

      {isRoofElement && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">모양</span>
          <select
            value={roofShape}
            disabled={isEditingLocked}
            onChange={(event) => {
              const nextShape = event.target.value as 'flat' | 'gable'
              logRoofDebug('select change', {
                elementId: element.id,
                source: element.source,
                current: roofShape,
                next: nextShape,
              })
              onRoofShapeChange?.(element.id, nextShape)
            }}
            className="rounded-lg border-none bg-[#F8F9FD] px-3 py-2.5 text-xs font-bold text-[#1C1C1E] outline-none focus:ring-1 focus:ring-[#3B45B3] disabled:cursor-not-allowed disabled:opacity-55"
          >
            <option value="flat">평지붕</option>
            <option value="gable">박공지붕</option>
          </select>
        </div>
      )}

      <MaterialSelector
        value={element.material}
        fallbackLabel={element.source === 'ifc' ? '미지정' : undefined}
        disabled={isEditingLocked}
        onChange={(material) => onMaterialChange?.(element.id, material)}
      />
      <ColorSelector value={element.color ?? '#D8DDE8'} disabled={isEditingLocked} onChange={(color) => onColorChange(element.id, color)} />
    </div>
  )
}

export function ThreeDAttributePanel({
  selectedBubble,
  selectedIfcElement,
  isEditingLocked = false,
  onLabelChange,
  onWidthChange,
  onHeightChange,
  onThicknessChange,
  onPositionChange,
  onRotationChange,
  onRoofShapeChange,
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
        onPositionChange={onPositionChange}
        onRotationChange={onRotationChange}
        onRoofShapeChange={onRoofShapeChange}
        onColorChange={onColorChange}
        onMaterialChange={onMaterialChange}
        isEditingLocked={isEditingLocked}
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
            disabled={isEditingLocked}
            onChange={(event) => onLabelChange(selectedBubble.id, event.target.value)}
            className="rounded-lg border-none bg-[#F8F9FD] px-3 py-2.5 text-xs font-bold text-[#1C1C1E] outline-none focus:ring-1 focus:ring-[#3B45B3] disabled:cursor-not-allowed disabled:opacity-55"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <ReadOnlyInput label="가로 (mm)" value={Math.round(selectedBubble.widthMm).toLocaleString()} />
          <ReadOnlyInput label="세로 (mm)" value={Math.round(selectedBubble.heightMm).toLocaleString()} />
        </div>

        {/* 3D 뷰에서 층고는 고정값으로 렌더됨 */}
        <ReadOnlyInput label="층고 (mm)" value="2,400" />

        <MaterialSelector value={selectedBubble.material} disabled={isEditingLocked} onChange={(material) => onMaterialChange?.(selectedBubble.id, material)} />
        <ColorSelector value={selectedBubble.color} disabled={isEditingLocked} onChange={(color) => onColorChange(selectedBubble.id, color)} />
      </div>
    </div>
  )
}
