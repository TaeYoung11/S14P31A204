export function getEstimatedTextWidthUnits(text: string) {
  const normalizedText = text.trim()
  if (!normalizedText) return 1
  return Array.from(normalizedText).reduce((units, char) => {
    if (/\s/.test(char)) return units + 0.35
    if (/[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF\u3000-\u9FFF]/.test(char)) return units + 1
    if (/[A-Z0-9]/.test(char)) return units + 0.68
    return units + 0.58
  }, 0)
}

export function fitSingleLineFontSize(text: string, maxWidth: number, maxHeight: number) {
  const textWidthUnits = Math.max(getEstimatedTextWidthUnits(text), 1)
  return Math.max(1, Math.min(maxHeight, maxWidth / textWidthUnits))
}
