import { useCallback, useRef, useState } from 'react'
import type { BubbleData, AddSpaceFormData } from '../types'
import { INITIAL_BUBBLES, INITIAL_ADD_SPACE_FORM } from '../constants'
import {
  calcAreaM2FromMm,
  calcMmDimensionsByAreaAndAspect,
  calcPxDimensionsFromMm,
  parsePositiveNumber,
} from '../utils/bubbleCalc'
import { normalizeBubbleFloor } from '../utils/bubbleFloorUtils'

/** 버블(공간) 상태와 모든 변경 핸들러를 제공하는 훅 */
export function useBubbles() {
  const [bubbles, setBubbles] = useState<BubbleData[]>(INITIAL_BUBBLES)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [previousSelectedId, setPreviousSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const selectedIdsRef = useRef<string[]>([])

  const updateSelectedIds = useCallback((next: string[]) => {
    selectedIdsRef.current = next
    setSelectedIds(next)
  }, [])

  const getNextBubbleIndex = (count: number) => (count + 1).toString().padStart(2, '0')

  const createBubbleId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

  /**
   * mm 치수를 기반으로 버블 렌더링/표시 필드를 생성한다.
   * 생성/추가 경로에서 동일한 기본값 규칙을 공유해 중복을 줄인다.
   */
  const buildBubbleCore = (
    input: {
      id: string
      floor: number
      x: number
      y: number
      widthMm: number
      heightMm: number
      ratio: number
      label: string
      type: string
      color: string
      material: string
      index: string
    },
  ): BubbleData => {
    const px = calcPxDimensionsFromMm(input.widthMm, input.heightMm)
    return {
      id: input.id,
      floor: normalizeBubbleFloor(input.floor),
      x: input.x,
      y: input.y,
      width: px.width,
      height: px.height,
      widthMm: input.widthMm,
      heightMm: input.heightMm,
      label: input.label,
      type: input.type,
      ratio: input.ratio,
      area: `${input.ratio.toFixed(1)} m²`,
      color: input.color,
      material: input.material,
      index: input.index,
    }
  }

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
        if (dx === 0 && dy === 0) return prev

        const selectedSet = new Set(currentSelectedIds)
        const next = [...prev]
        let changed = false

        for (let index = 0; index < prev.length; index += 1) {
          const bubble = prev[index]
          if (!bubble || !selectedSet.has(bubble.id)) continue
          next[index] = { ...bubble, x: bubble.x + dx, y: bubble.y + dy }
          changed = true
        }

        return changed ? next : prev
      }

      const targetIndex = prev.findIndex((bubble) => bubble.id === id)
      if (targetIndex < 0) return prev
      const target = prev[targetIndex]
      if (!target) return prev
      if (target.x === x && target.y === y) return prev

      const next = [...prev]
      next[targetIndex] = { ...target, x, y }
      return next
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
  const clearSelection = useCallback(() => {
    setSelectedId(null)
    updateSelectedIds([])
  }, [updateSelectedIds])

  /** 버블 크기·위치 변경 (Transformer onTransformEnd 후 호출) */
  const handleBubbleResize = (id: string, x: number, y: number, width: number, height: number) => {
    setBubbles((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b
        const newW = Math.max(width, 1)
        const newH = Math.max(height, 1)
        const newWidthMm = Math.max(b.widthMm * (newW / b.width), 100)
        const newHeightMm = Math.max(b.heightMm * (newH / b.height), 100)
        const ratio = calcAreaM2FromMm(newWidthMm, newHeightMm)
        const px = calcPxDimensionsFromMm(newWidthMm, newHeightMm)
        return { ...b, x, y, width: px.width, height: px.height, widthMm: newWidthMm, heightMm: newHeightMm, ratio, area: `${ratio.toFixed(1)} m²` }
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
        const px = calcPxDimensionsFromMm(nextWidthMm, nextHeightMm)
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
        const px = calcPxDimensionsFromMm(mm.widthMm, mm.heightMm)
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

  /** 버블 층 변경 */
  const handleBubbleFloorChange = (id: string, floor: number) => {
    const nextFloor = normalizeBubbleFloor(floor)
    setBubbles((prev) => prev.map((b) => (b.id === id ? { ...b, floor: nextFloor } : b)))
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
  const addBubble = (formData: AddSpaceFormData, floor = 1) => {
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

    const newBubble = buildBubbleCore({
      id: createBubbleId(),
      floor,
      x: 150 + Math.random() * 200,
      y: 150 + Math.random() * 200,
      widthMm: widthMmValue,
      heightMm: heightMmValue,
      ratio: ratioValue,
      label: formData.name || '새 공간',
      type: formData.type,
      color: formData.color,
      material: '콘크리트',
      index: getNextBubbleIndex(bubbles.length),
    })
    setBubbles((prev) => [...prev, newBubble])
  }

  /** 캔버스 좌표에 새 버블 추가 (빈 공간 더블클릭) */
  const addBubbleAt = (x: number, y: number, floor = 1) => {
    const ratioValue = 10
    const mm = calcMmDimensionsByAreaAndAspect(ratioValue, 1)
    const id = createBubbleId()
    const nextIndex = getNextBubbleIndex(bubbles.length)
    const px = calcPxDimensionsFromMm(mm.widthMm, mm.heightMm)
    const newBubble = buildBubbleCore({
      id,
      floor,
      x: x - px.width / 2,
      y: y - px.height / 2,
      widthMm: mm.widthMm,
      heightMm: mm.heightMm,
      ratio: ratioValue,
      label: '새 공간',
      type: INITIAL_ADD_SPACE_FORM.type,
      color: INITIAL_ADD_SPACE_FORM.color,
      material: '콘크리트',
      index: nextIndex,
    })
    if (selectedId && selectedId !== id) setPreviousSelectedId(selectedId)
    setSelectedId(id)
    updateSelectedIds([id])
    setBubbles((prev) => [...prev, newBubble])
    return newBubble
  }

  /** 외부 연산(예: AI 미리보기 적용) 결과로 버블 목록 일괄 교체 */
  const replaceBubbles = useCallback((nextBubbles: BubbleData[]) => {
    setBubbles(nextBubbles)
    const idSet = new Set(nextBubbles.map((bubble) => bubble.id))
    const nextSelectedIds = selectedIdsRef.current.filter((id) => idSet.has(id))
    updateSelectedIds(nextSelectedIds)
    setSelectedId((currentSelectedId) => (
      currentSelectedId && !idSet.has(currentSelectedId)
        ? nextSelectedIds[nextSelectedIds.length - 1] ?? null
        : currentSelectedId
    ))
    setPreviousSelectedId((currentPreviousSelectedId) => (
      currentPreviousSelectedId && !idSet.has(currentPreviousSelectedId)
        ? null
        : currentPreviousSelectedId
    ))
  }, [updateSelectedIds])

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
    handleBubbleFloorChange,
    addBubble,
    addBubbleAt,
    replaceBubbles,
    deleteBubble,
  }
}
