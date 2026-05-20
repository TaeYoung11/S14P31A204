import { describe, expect, it } from 'vitest'
import { isSafeInternalRedirect, resolveSafeInternalRedirect } from '@/features/auth/utils/redirect'

describe('auth redirect utils', () => {
  it('rejects empty and blank redirect values', () => {
    expect(isSafeInternalRedirect(undefined)).toBe(false)
    expect(isSafeInternalRedirect(null)).toBe(false)
    expect(isSafeInternalRedirect('')).toBe(false)
    expect(isSafeInternalRedirect('   ')).toBe(false)
    expect(resolveSafeInternalRedirect('')).toBe('/projects')
  })

  it('allows only normalized internal paths', () => {
    expect(isSafeInternalRedirect('/projects')).toBe(true)
    expect(isSafeInternalRedirect('/projects?tab=mine')).toBe(true)
    expect(isSafeInternalRedirect(' /projects')).toBe(false)
    expect(isSafeInternalRedirect('/projects ')).toBe(false)
    expect(isSafeInternalRedirect('//evil.example')).toBe(false)
    expect(isSafeInternalRedirect('https://evil.example')).toBe(false)
  })
})
