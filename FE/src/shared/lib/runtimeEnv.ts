type RuntimeEnv = Record<string, string | undefined>

const RUNTIME_ENV: RuntimeEnv = (import.meta as ImportMeta & { env?: RuntimeEnv }).env ?? {}

/**
 * 런타임 환경변수 문자열을 읽는다.
 * 값이 없거나 공백이면 fallback을 반환한다.
 */
export const getRuntimeEnvString = (key: string, fallback = ''): string => {
  const raw = RUNTIME_ENV[key]
  if (typeof raw !== 'string') return fallback

  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

/**
 * 런타임 환경변수 boolean 값을 읽는다.
 * `true`/`false` 외 값은 fallback으로 처리한다.
 */
export const getRuntimeEnvBoolean = (key: string, fallback = false): boolean => {
  const raw = RUNTIME_ENV[key]
  if (typeof raw !== 'string') return fallback

  const normalized = raw.trim().toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  return fallback
}
