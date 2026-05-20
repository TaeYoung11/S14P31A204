export const DEFAULT_AUTH_REDIRECT_PATH = '/projects'

export const isSafeInternalRedirect = (redirectTo?: string | null): redirectTo is string => {
  if (!redirectTo || redirectTo.trim() === '') return false
  if (redirectTo.trim() !== redirectTo) return false
  if (!redirectTo.startsWith('/')) return false
  if (redirectTo.startsWith('//')) return false
  return !/^[a-z][a-z\d+.-]*:/i.test(redirectTo)
}

export const resolveSafeInternalRedirect = (
  redirectTo?: string | null,
  fallback = DEFAULT_AUTH_REDIRECT_PATH,
): string => (isSafeInternalRedirect(redirectTo) ? redirectTo : fallback)
