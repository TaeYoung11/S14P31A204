export const EMAIL_DOMAIN_OPTIONS = ['gmail.com', 'naver.com', 'kakao.com'] as const
export const DEFAULT_EMAIL_DOMAIN = EMAIL_DOMAIN_OPTIONS[0]
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type EmailDomainOption = (typeof EMAIL_DOMAIN_OPTIONS)[number]

export const sanitizeEmailSegment = (value: string) => value.replace(/\s/g, '')

export const buildEmail = (localPart: string, domain: string) => {
  const normalizedLocalPart = localPart.trim()
  const normalizedDomain = domain.trim()
  if (!normalizedLocalPart || !normalizedDomain) return ''
  return `${normalizedLocalPart}@${normalizedDomain}`.toLowerCase()
}

export const splitEmail = (email: string) => {
  const normalizedEmail = email.trim().toLowerCase()
  const atIndex = normalizedEmail.indexOf('@')
  const localPart = atIndex >= 0 ? normalizedEmail.slice(0, atIndex) : normalizedEmail
  const domain = atIndex >= 0 ? normalizedEmail.slice(atIndex + 1) : ''
  const isKnownDomain = EMAIL_DOMAIN_OPTIONS.includes(domain as EmailDomainOption)

  return {
    localPart,
    domain: domain || DEFAULT_EMAIL_DOMAIN,
    isCustomDomain: Boolean(domain) && !isKnownDomain,
  }
}
