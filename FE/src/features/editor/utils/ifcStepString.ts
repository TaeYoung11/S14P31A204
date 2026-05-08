// IFC STEP 문자열 escape를 화면 표시용 유니코드 문자열로 변환합니다.
export const decodeIfcStepString = (value: string): string => (
  value.replace(/\\X2\\([0-9A-Fa-f]+)\\X0\\/g, (_match, hex: string) => {
    if (hex.length % 4 !== 0) return _match
    try {
      const codeUnits: number[] = []
      for (let index = 0; index < hex.length; index += 4) {
        codeUnits.push(Number.parseInt(hex.slice(index, index + 4), 16))
      }
      return String.fromCharCode(...codeUnits)
    } catch {
      return _match
    }
  })
)

export const normalizeIfcDisplayText = (value: string): string => decodeIfcStepString(value).trim()
