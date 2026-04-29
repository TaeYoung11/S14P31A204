import { useCallback, useState } from 'react'
import type { AddSpaceFormData, BubbleData } from '../types'
import { INITIAL_BUBBLES } from '../constants'
import { createBubbleFromFormData, updateBubbleDimensions, updateBubbleRatio } from '../utils/bubbleState'

export function useBubbles(initialBubbles: BubbleData[] = INITIAL_BUBBLES) {
  const [bubbles, setBubbles] = useState<BubbleData[]>(initialBubbles)
  const [selectedId, setSelectedId] = useState<string | null>(
    initialBubbles.length > 0 ? initialBubbles[0].id : null,
  )
  const [previousSelectedId, setPreviousSelectedId] = useState<string | null>(null)

  const handleBubbleSelect = (id: string | null) => {
    if (id === null) {
      setSelectedId(null)
      return
    }

    if (selectedId && selectedId !== id) {
      setPreviousSelectedId(selectedId)
    }
    setSelectedId(id)
  }

  const handleBubbleDrag = (id: string, x: number, y: number) => {
    setBubbles((prev) => prev.map((bubble) => (bubble.id === id ? { ...bubble, x, y } : bubble)))
  }

  const handleLabelChange = (id: string, label: string) => {
    setBubbles((prev) => prev.map((bubble) => (bubble.id === id ? { ...bubble, label } : bubble)))
  }

  const handleTypeChange = (id: string, type: string) => {
    setBubbles((prev) => prev.map((bubble) => (bubble.id === id ? { ...bubble, type } : bubble)))
  }

  const handleWidthChange = (id: string, width: number) => {
    setBubbles((prev) =>
      prev.map((bubble) => (bubble.id === id ? updateBubbleDimensions(bubble, 'width', width) : bubble)),
    )
  }

  const handleHeightChange = (id: string, height: number) => {
    setBubbles((prev) =>
      prev.map((bubble) => (bubble.id === id ? updateBubbleDimensions(bubble, 'height', height) : bubble)),
    )
  }

  const handleRatioChange = (id: string, ratio: number) => {
    setBubbles((prev) => prev.map((bubble) => (bubble.id === id ? updateBubbleRatio(bubble, ratio) : bubble)))
  }

  const handleColorChange = (id: string, color: string) => {
    setBubbles((prev) => prev.map((bubble) => (bubble.id === id ? { ...bubble, color } : bubble)))
  }

  const deleteBubble = (id: string) => {
    setBubbles((prev) => prev.filter((bubble) => bubble.id !== id))
    if (selectedId === id) {
      setSelectedId(null)
    }
  }

  const addBubble = (formData: AddSpaceFormData, providedBubble?: BubbleData) => {
    const newBubble = providedBubble ?? createBubbleFromFormData(formData, bubbles.length)
    setBubbles((prev) => [...prev, newBubble])
  }

  const replaceBubbleState = useCallback((
    nextBubbles: BubbleData[],
    options?: {
      selectedId?: string | null
      previousSelectedId?: string | null
    },
  ) => {
    setBubbles(nextBubbles)
    if (options && 'selectedId' in options) {
      setSelectedId(options.selectedId ?? null)
    }
    if (options && 'previousSelectedId' in options) {
      setPreviousSelectedId(options.previousSelectedId ?? null)
    }
  }, [])

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
    replaceBubbleState,
  }
}
