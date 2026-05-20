export const mmToM = (mm: number): number => mm / 1000
export const mToMm = (m: number): number => m * 1000

const KST_OFFSET_MINUTES = 9 * 60
const LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/

export const hasTimezoneSuffix = (value: string): boolean => /[zZ]$|[+-]\d{2}:?\d{2}$/.test(value.trim())

export const parseBackendDateAsKst = (value: string): Date => {
  const normalized = value.trim()
  if (!normalized) return new Date(NaN)
  if (hasTimezoneSuffix(normalized)) return new Date(normalized)

  const match = LOCAL_DATE_TIME_PATTERN.exec(normalized)
  if (!match) return new Date(normalized)

  const [, year, month, day, hour, minute, second = '0', fraction = '0'] = match
  const millisecond = Number(fraction.padEnd(3, '0').slice(0, 3))
  const utcMs = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    millisecond,
  ) - KST_OFFSET_MINUTES * 60 * 1000

  return new Date(utcMs)
}

export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

export const formatRelativeTime = (iso: string): string => {
  const diff = Date.now() - parseBackendDateAsKst(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  return `${days}일 전`
}
