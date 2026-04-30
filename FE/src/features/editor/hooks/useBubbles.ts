import { useRef, useState } from 'react'
import type { BubbleData, AddSpaceFormData } from '../types'
import { INITIAL_BUBBLES, INITIAL_ADD_SPACE_FORM } from '../constants'
import {
  calcAreaM2FromMm,
  calcMmDimensionsByAreaAndAspect,
  calcPxDimensionsByAreaAndAspect,
  parsePositiveNumber,
} from '../utils/bubbleCalc'

/** 버블(공간) 상태와 모든 변경 핸들러를 제공하는 훅 */
export function useBubbles() {
  const [bubbles, setBubbles] = useState<BubbleData[]>(INITIAL_BUBBLES)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [previousSelectedId, setPreviousSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const selectedIdsRef = useRef<string[]>([])

  const updateSelectedIds = (next: string[]) => {
    selectedIdsRef.current = next
    setSelectedIds(next)
  }

  const getNextBubbleIndex = (count: number) => (count + 1).toString().padStart(2, '0')

  const createBubbleId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

  /** 버블 선택 — Shift 키 시 다중 선택 토글, 이전 선택 ID를 추적해 연결선 생성에 활용 */
  const handleBubbleSelect = (id: string, isShift = false) => {
    if (isShift) {
      const isAlreadySelected = selectedIds.includes(id)
      if (isAlreadySelected) {
        const next = selectedIds.filter((x) => x !== id)
        updateSelectedIds(next)
        if (id === selectedId) setSelectedId(next[next.length - 1] ?? null)
      } else {
        if (selectedId && selectedId !== id) setPreviousSelectedId(selectedId)
        setSelectedId(id)
        const next = [...selectedIdsRef.current, id]
        updateSelectedIds(next)
      }
    } else {
      if (selectedId && selectedId !== id) setPreviousSelectedId(selectedId)
      setSelectedId(id)
      updateSelectedIds([id])
    }
  }

  /** 드래그 이동 — 다중 선택 시 선택된 모든 버블을 동일 델타만큼 이동 */
  const handleBubbleDrag = (id: string, x: number, y: number) => {
    setBubbles((prev) => {
      const currentSelectedIds = selectedIdsRef.current
      if (currentSelectedIds.length > 1 && currentSelectedIds.includes(id)) {
        const dragged = prev.find((b) => b.id === id)
        if (!dragged) return prev
        const dx = x - dragged.x
        const dy = y - dragged.y
        return prev.map((b) =>
          currentSelectedIds.includes(b.id) ? { ...b, x: b.x + dx, y: b.y + dy } : b
        )
      }
      return prev.map((b) => (b.id === id ? { ...b, x, y } : b))
    })
  }

  /** 단일 버블 위치 이동 (크기/면적/치수는 유지) */
  const handleBubbleMove = (id: string, x: number, y: number) => {
    setBubbles((prev) => prev.map((b) => (b.id === id ? { ...b, x, y } : b)))
  }

  /** 마퀴(드래그) 선택 — 기본은 교체 선택, append=true면 기존 선택에 추가 */
  const handleMarqueeSelect = (ids: string[], append = false) => {
    if (!append) {
      updateSelectedIds(ids)
      setSelectedId(ids[ids.length - 1] ?? null)
      return
    }
    const merged = Array.from(new Set([...selectedIdsRef.current, ...ids]))
    updateSelectedIds(merged)
    if (ids.length > 0) setSelectedId(ids[ids.length - 1] ?? selectedId)
  }

  /** 선택 해제 */
  const clearSelection = () => {
    setSelectedId(null)
    updateSelectedIds([])
  }

  /** 버블 크기·위치 변경 (Transformer onTransformEnd 후 호출) */
  const handleBubbleResize = (id: string, x: number, y: number, width: number, height: number) => {
    setBubbles((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b
        const newW = Math.max(width, 40)
        const newH = Math.max(height, 40)
        const newWidthMm = Math.max(b.widthMm * (newW / b.width), 100)
        const newHeightMm = Math.max(b.heightMm * (newH / b.height), 100)
        const ratio = calcAreaM2FromMm(newWidthMm, newHeightMm)
        return { ...b, x, y, width: newW, height: newH, widthMm: newWidthMm, heightMm: newHeightMm, ratio, area: `${ratio.toFixed(1)} m²` }
      })
    )
  }

  /** 공간 이름 변경 */
  const handleLabelChange = (id: string, label: string) => {
    setBubbles((prev) => prev.map((b) => (b.id === id ? { ...b, label } : b)))
  }

  /** 방 종류 변경 */
  const handleTypeChange = (id: string, type: string) => {
    setBubbles((prev) => prev.map((b) => (b.id === id ? { ...b, type } : b)))
  }

  /**
   * mm 치수(가로 또는 세로) 변경 → 면적 및 px 크기 자동 재계산
   * @param axis 변경할 치수 축 ('width' | 'height')
   */
  const applyDimensionChange = (id: string, axis: 'width' | 'height', value: number) => {
    setBubbles((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b
        const nextWidthMm = axis === 'width' ? (value > 0 ? value : b.widthMm) : (b.widthMm > 0 ? b.widthMm : 1000)
        const nextHeightMm = axis === 'height' ? (value > 0 ? value : b.heightMm) : (b.heightMm > 0 ? b.heightMm : 1000)
        const ratio = calcAreaM2FromMm(nextWidthMm, nextHeightMm)
        const px = calcPxDimensionsByAreaAndAspect(ratio, nextWidthMm / nextHeightMm)
        return { ...b, width: px.width, height: px.height, widthMm: nextWidthMm, heightMm: nextHeightMm, ratio, area: `${ratio.toFixed(1)} m²` }
      })
    )
  }

  /** 가로 치수 변경 → 면적 자동 재계산 */
  const handleWidthChange = (id: string, width: number) => applyDimensionChange(id, 'width', width)

  /** 세로 치수 변경 → 면적 자동 재계산 */
  const handleHeightChange = (id: string, height: number) => applyDimensionChange(id, 'height', height)

  /** 면적 직접 변경 → 치수 자동 재계산 */
  const handleRatioChange = (id: string, ratio: number) => {
    setBubbles((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b
        const aspect = b.widthMm > 0 && b.heightMm > 0 ? b.widthMm / b.heightMm : 1
        const mm = calcMmDimensionsByAreaAndAspect(ratio, aspect)
        const px = calcPxDimensionsByAreaAndAspect(ratio, aspect)
        return { ...b, ratio, area: `${ratio.toFixed(1)} m²`, width: px.width, height: px.height, widthMm: mm.widthMm, heightMm: mm.heightMm }
      })
    )
  }

  /** 색상 변경 */
  const handleColorChange = (id: string, color: string) => {
    setBubbles((prev) => prev.map((b) => (b.id === id ? { ...b, color } : b)))
  }

  /** 주요 재질 변경 */
  const handleMaterialChange = (id: string, material: string) => {
    setBubbles((prev) => prev.map((b) => (b.id === id ? { ...b, material } : b)))
  }

  /** 버블 삭제 — 선택 상태도 함께 초기화 */
  const deleteBubble = (id: string) => {
    setBubbles((prev) => prev.filter((b) => b.id !== id))
    if (selectedId === id) setSelectedId(null)
    const next = selectedIdsRef.current.filter((x) => x !== id)
    updateSelectedIds(next)
  }

  /**
   * 공간 추가 모달 폼 데이터로 새 버블 생성
   * 입력 우선순위: (가로+세로) > 면적 > 기본값(10m²)
   */
  const addBubble = (formData: AddSpaceFormData) => {
    const widthMmInput = parsePositiveNumber(formData.width)
    const heightMmInput = parsePositiveNumber(formData.height)
    const ratioInput = parsePositiveNumber(formData.ratio)

    let widthMmValue: number
    let heightMmValue: number
    let ratioValue: number

    if (widthMmInput && heightMmInput) {
      ratioValue = calcAreaM2FromMm(widthMmInput, heightMmInput)
      widthMmValue = widthMmInput
      heightMmValue = heightMmInput
    } else if (ratioInput) {
      if (widthMmInput && !heightMmInput) {
        widthMmValue = widthMmInput
        heightMmValue = (ratioInput * 1_000_000) / widthMmInput
      } else if (!widthMmInput && heightMmInput) {
        heightMmValue = heightMmInput
        widthMmValue = (ratioInput * 1_000_000) / heightMmInput
      } else {
        const mm = calcMmDimensionsByAreaAndAspect(ratioInput, 1)
        widthMmValue = mm.widthMm
        heightMmValue = mm.heightMm
      }
      ratioValue = ratioInput
    } else {
      ratioValue = 10
      const mm = calcMmDimensionsByAreaAndAspect(ratioValue, 1)
      widthMmValue = mm.widthMm
      heightMmValue = mm.heightMm
    }

    const aspect = widthMmValue > 0 && heightMmValue > 0 ? widthMmValue / heightMmValue : 1
    const px = calcPxDimensionsByAreaAndAspect(ratioValue, aspect)

    const newBubble: BubbleData = {
      id: createBubbleId(),
      x: 150 + Math.random() * 200,
      y: 150 + Math.random() * 200,
      width: px.width,
      height: px.height,
      widthMm: widthMmValue,
      heightMm: heightMmValue,
      label: formData.name || '새 공간',
      type: formData.type,
      ratio: ratioValue,
      area: `${ratioValue.toFixed(1)} m²`,
      color: formData.color,
      material: '콘크리트',
      index: getNextBubbleIndex(bubbles.length),
    }
    setBubbles((prev) => [...prev, newBubble])
  }

  /** 캔버스 좌표에 새 버블 추가 (빈 공간 더블클릭) */
  const addBubbleAt = (x: number, y: number) => {
    const ratioValue = 10
    const mm = calcMmDimensionsByAreaAndAspect(ratioValue, 1)
    const px = calcPxDimensionsByAreaAndAspect(ratioValue, 1)
    const id = createBubbleId()
    const nextIndex = getNextBubbleIndex(bubbles.length)
    const newBubble: BubbleData = {
      id,
      x: x - px.width / 2,
      y: y - px.height / 2,
      width: px.width,
      height: px.height,
      widthMm: mm.widthMm,
      heightMm: mm.heightMm,
      label: '새 공간',
      type: INITIAL_ADD_SPACE_FORM.type,
      ratio: ratioValue,
      area: `${ratioValue.toFixed(1)} m²`,
      color: INITIAL_ADD_SPACE_FORM.color,
      material: '콘크리트',
      index: nextIndex,
    }
    if (selectedId && selectedId !== id) setPreviousSelectedId(selectedId)
    setSelectedId(id)
    updateSelectedIds([id])
    setBubbles((prev) => [...prev, newBubble])
    return newBubble
  }

  /** 외부 연산(예: AI 미리보기 적용) 결과로 버블 목록 일괄 교체 */
  const replaceBubbles = (nextBubbles: BubbleData[]) => {
    setBubbles(nextBubbles)
    const idSet = new Set(nextBubbles.map((bubble) => bubble.id))
    const nextSelectedIds = selectedIdsRef.current.filter((id) => idSet.has(id))
    updateSelectedIds(nextSelectedIds)
    if (selectedId && !idSet.has(selectedId)) setSelectedId(nextSelectedIds[nextSelectedIds.length - 1] ?? null)
    if (previousSelectedId && !idSet.has(previousSelectedId)) setPreviousSelectedId(null)
  }

  return {
    bubbles,
    selectedId,
    selectedIds,
    previousSelectedId,
    handleBubbleSelect,
    handleBubbleDrag,
    handleBubbleMove,
    handleMarqueeSelect,
    clearSelection,
    handleBubbleResize,
    handleLabelChange,
    handleTypeChange,
    handleWidthChange,
    handleHeightChange,
    handleRatioChange,
    handleColorChange,
    handleMaterialChange,
    addBubble,
    addBubbleAt,
    replaceBubbles,
    deleteBubble,
  }
}
