import { useState, useEffect } from 'react'
import type { BubbleData, AddSpaceFormData } from '../types'
import { bubbleService } from '../services/bubble.service'
import {
  calcAreaM2FromMm,
  calcMmDimensionsByAreaAndAspect,
  calcPxDimensionsByAreaAndAspect,
  parsePositiveNumber,
} from '../utils/bubbleCalc'

/** 버블(공간) 상태와 모든 변경 핸들러를 제공하는 훅 */
export function useBubbles() {
  const [bubbles, setBubbles] = useState<BubbleData[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    bubbleService.getList().then((data) => {
      setBubbles(data)
      if (data.length > 0) setSelectedId(data[0].id)
    })
  }, [])
  const [previousSelectedId, setPreviousSelectedId] = useState<string | null>(null)

  /** 버블 선택 — 이전 선택 ID를 추적해 연결선 생성에 활용 */
  const handleBubbleSelect = (id: string) => {
    if (selectedId && selectedId !== id) setPreviousSelectedId(selectedId)
    setSelectedId(id)
  }

  /** 드래그 이동 */
  const handleBubbleDrag = (id: string, x: number, y: number) => {
    setBubbles((prev) => prev.map((b) => (b.id === id ? { ...b, x, y } : b)))
  }

  /** 공간 이름 변경 */
  const handleLabelChange = (id: string, label: string) => {
    setBubbles((prev) => prev.map((b) => (b.id === id ? { ...b, label } : b)))
  }

  /** 방 종류 변경 */
  const handleTypeChange = (id: string, type: string) => {
    setBubbles((prev) => prev.map((b) => (b.id === id ? { ...b, type } : b)))
  }

  /** 가로 치수 변경 → 면적 자동 재계산 */
  const handleWidthChange = (id: string, width: number) => {
    setBubbles((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b
        const nextWidthMm = width > 0 ? width : b.widthMm
        const nextHeightMm = b.heightMm > 0 ? b.heightMm : 1000
        const ratio = calcAreaM2FromMm(nextWidthMm, nextHeightMm)
        const px = calcPxDimensionsByAreaAndAspect(ratio, nextWidthMm / nextHeightMm)
        return { ...b, width: px.width, height: px.height, widthMm: nextWidthMm, heightMm: nextHeightMm, ratio, area: `${ratio.toFixed(1)} m²` }
      })
    )
  }

  /** 세로 치수 변경 → 면적 자동 재계산 */
  const handleHeightChange = (id: string, height: number) => {
    setBubbles((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b
        const nextHeightMm = height > 0 ? height : b.heightMm
        const nextWidthMm = b.widthMm > 0 ? b.widthMm : 1000
        const ratio = calcAreaM2FromMm(nextWidthMm, nextHeightMm)
        const px = calcPxDimensionsByAreaAndAspect(ratio, nextWidthMm / nextHeightMm)
        return { ...b, width: px.width, height: px.height, widthMm: nextWidthMm, heightMm: nextHeightMm, ratio, area: `${ratio.toFixed(1)} m²` }
      })
    )
  }

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
  }
}
