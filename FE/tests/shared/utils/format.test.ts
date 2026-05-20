import { describe, expect, it } from 'vitest'
import { parseBackendDateAsKst } from '@/shared/utils/format'

describe('parseBackendDateAsKst', () => {
  it('keeps UTC timestamp instants unchanged', () => {
    expect(parseBackendDateAsKst('2026-05-20T10:00:00Z').toISOString()).toBe('2026-05-20T10:00:00.000Z')
  })

  it('keeps explicit KST offset timestamp instants unchanged', () => {
    expect(parseBackendDateAsKst('2026-05-20T19:00:00+09:00').toISOString()).toBe('2026-05-20T10:00:00.000Z')
  })

  it('interprets timezone-less ISO timestamps as KST', () => {
    expect(parseBackendDateAsKst('2026-05-20T19:00:00').toISOString()).toBe('2026-05-20T10:00:00.000Z')
  })

  it('interprets timezone-less timestamps with a space separator as KST', () => {
    expect(parseBackendDateAsKst('2026-05-20 19:00:00').toISOString()).toBe('2026-05-20T10:00:00.000Z')
  })

  it('truncates fractional seconds to milliseconds', () => {
    expect(parseBackendDateAsKst('2026-05-20T19:00:00.123456').toISOString()).toBe('2026-05-20T10:00:00.123Z')
  })

  it('returns an invalid date for blank values', () => {
    expect(Number.isNaN(parseBackendDateAsKst('   ').getTime())).toBe(true)
  })
})
