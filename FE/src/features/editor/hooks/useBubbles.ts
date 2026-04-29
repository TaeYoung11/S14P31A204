import { useState } from 'react'
import type { BubbleData, AddSpaceFormData } from '../types'
import { INITIAL_BUBBLES } from '../constants'
import {
  calcAreaM2FromMm,
  calcMmDimensionsByAreaAndAspect,
  calcPxDimensionsByAreaAndAspect,
  parsePositiveNumber,
} from '../utils/bubbleCalc'

/** 버블 상태와 편집 동작을 관리한다. */
export function useBubbles(initialBubbles: BubbleData[] = INITIAL_BUBBLES) {
  const [bubbles, setBubbles] = useState<BubbleData[]>(initialBubbles)
  const [selectedId, setSelectedId] = useState<string | null>(
    initialBubbles.length > 0 ? initialBubbles[0].id : null,
  )
  const [previousSelectedId, setPreviousSelectedId] = useState<string | null>(null)

  /** 현재 선택된 버블과 이전 선택 버블을 갱신한다. */
  const handleBubbleSelect = (id: string | null) => {
    if (id === null) {
      setSelectedId(null)
      return
    }

    if (selectedId && selectedId !== id) setPreviousSelectedId(selectedId)
    setSelectedId(id)
  }

  /** 버블 위치를 이동한다. */
  const handleBubbleDrag = (id: string, x: number, y: number) => {
    setBubbles((prev) => prev.map((b) => (b.id === id ? { ...b, x, y } : b)))
  }

  /** 버블 라벨을 변경한다. */
  const handleLabelChange = (id: string, label: string) => {
    setBubbles((prev) => prev.map((b) => (b.id === id ? { ...b, label } : b)))
  }

  /** 버블 타입을 변경한다. */
  const handleTypeChange = (id: string, type: string) => {
    setBubbles((prev) => prev.map((b) => (b.id === id ? { ...b, type } : b)))
  }

  /** mm 단위 치수 변경을 반영하고 면적과 px 크기를 다시 계산한다. */
  const applyDimensionChange = (id: string, axis: 'width' | 'height', value: number) => {
    setBubbles((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b
        const nextWidthMm = axis === 'width' ? (value > 0 ? value : b.widthMm) : (b.widthMm > 0 ? b.widthMm : 1000)
        const nextHeightMm = axis === 'height' ? (value > 0 ? value : b.heightMm) : (b.heightMm > 0 ? b.heightMm : 1000)
        const ratio = calcAreaM2FromMm(nextWidthMm, nextHeightMm)
        const px = calcPxDimensionsByAreaAndAspect(ratio, nextWidthMm / nextHeightMm)
        return {
          ...b,
          width: px.width,
          height: px.height,
          widthMm: nextWidthMm,
          heightMm: nextHeightMm,
          ratio,
          area: `${ratio.toFixed(1)} m²`,
        }
      }),
    )
  }

  /** 버블 너비를 변경한다. */
  const handleWidthChange = (id: string, width: number) => applyDimensionChange(id, 'width', width)

  /** 버블 높이를 변경한다. */
  const handleHeightChange = (id: string, height: number) => applyDimensionChange(id, 'height', height)

  /** 버블 면적을 변경하고 크기를 다시 계산한다. */
  const handleRatioChange = (id: string, ratio: number) => {
    setBubbles((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b
        const aspect = b.widthMm > 0 && b.heightMm > 0 ? b.widthMm / b.heightMm : 1
        const mm = calcMmDimensionsByAreaAndAspect(ratio, aspect)
        const px = calcPxDimensionsByAreaAndAspect(ratio, aspect)
        return {
          ...b,
          ratio,
          area: `${ratio.toFixed(1)} m²`,
          width: px.width,
          height: px.height,
          widthMm: mm.widthMm,
          heightMm: mm.heightMm,
        }
      }),
    )
  }

  /** 버블 색상을 변경한다. */
  const handleColorChange = (id: string, color: string) => {
    setBubbles((prev) => prev.map((b) => (b.id === id ? { ...b, color } : b)))
  }

  /** 버블을 삭제하고 선택 상태를 정리한다. */
  const deleteBubble = (id: string) => {
    setBubbles((prev) => prev.filter((b) => b.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  /** 입력값을 기반으로 새 버블을 추가한다. */
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
      id: Date.now().toString(),
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
      index: (bubbles.length + 1).toString().padStart(2, '0'),
    }

    setBubbles((prev) => [...prev, newBubble])
  }

  return {
    bubbles,
    selectedId,
    previousSelectedId,
    handleBubbleSelect,
    handleBubbleDrag,
    handleLabelChange,
    handleTypeChange,
    handleWidthChange,
    handleHeightChange,
    handleRatioChange,
    handleColorChange,
    addBubble,
    deleteBubble,
  }
}
