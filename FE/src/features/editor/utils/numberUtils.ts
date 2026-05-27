/**
 * number/string 입력을 양수 숫자로 안전하게 변환한다.
 * - 변환 실패, 0 이하 값은 null로 반환한다.
 */
export const readPositiveNumber = (value: unknown): number | null => {
  const numericValue = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null
}

/**
 * 워크스페이스 대지 정보에서 면적(m²) 후보 필드를 우선순위로 읽는다.
 */
export const resolveWorkspaceSiteAreaM2 = (
  siteInfo: Record<string, unknown> | null | undefined,
): number | null =>
  readPositiveNumber(siteInfo?.areaM2)
  ?? readPositiveNumber(siteInfo?.area_m2)
  ?? readPositiveNumber(siteInfo?.landAreaM2)
  ?? readPositiveNumber(siteInfo?.land_area_m2)
  ?? readPositiveNumber(siteInfo?.area)
