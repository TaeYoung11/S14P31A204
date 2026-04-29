import type { AddSpaceFormData, BubbleData } from '../types'
import {
  calcAreaM2FromMm,
  calcMmDimensionsByAreaAndAspect,
  calcPxDimensionsByAreaAndAspect,
  parsePositiveNumber,
} from './bubbleCalc'

/** 버블의 가로/세로 실측값을 기준으로 파생 크기 정보를 다시 계산한다. */
export function updateBubbleDimensions(bubble: BubbleData, axis: 'width' | 'height', value: number): BubbleData {
  const nextWidthMm =
    axis === 'width' ? (value > 0 ? value : bubble.widthMm) : (bubble.widthMm > 0 ? bubble.widthMm : 1000)
  const nextHeightMm =
    axis === 'height' ? (value > 0 ? value : bubble.heightMm) : (bubble.heightMm > 0 ? bubble.heightMm : 1000)
  const ratio = calcAreaM2FromMm(nextWidthMm, nextHeightMm)
  const px = calcPxDimensionsByAreaAndAspect(ratio, nextWidthMm / nextHeightMm)

  return {
    ...bubble,
    width: px.width,
    height: px.height,
    widthMm: nextWidthMm,
    heightMm: nextHeightMm,
    ratio,
    area: `${ratio.toFixed(1)} m²`,
  }
}

/** 버블 면적을 기준으로 실측/픽셀 크기를 다시 계산한다. */
export function updateBubbleRatio(bubble: BubbleData, ratio: number): BubbleData {
  const aspect = bubble.widthMm > 0 && bubble.heightMm > 0 ? bubble.widthMm / bubble.heightMm : 1
  const mm = calcMmDimensionsByAreaAndAspect(ratio, aspect)
  const px = calcPxDimensionsByAreaAndAspect(ratio, aspect)

  return {
    ...bubble,
    ratio,
    area: `${ratio.toFixed(1)} m²`,
    width: px.width,
    height: px.height,
    widthMm: mm.widthMm,
    heightMm: mm.heightMm,
  }
}

/** 공간 추가 폼 값을 버블 데이터로 변환한다. */
export function createBubbleFromFormData(formData: AddSpaceFormData, bubbleCount: number): BubbleData {
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

  return {
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
    index: (bubbleCount + 1).toString().padStart(2, '0'),
  }
}
