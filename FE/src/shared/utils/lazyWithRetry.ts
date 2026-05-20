import { lazy } from 'react'
import type { ComponentType } from 'react'

type LazyModule<T> = { default: T }

const RETRYABLE_DYNAMIC_IMPORT_PATTERNS = [
  'Failed to fetch dynamically imported module',
  'Importing a module script failed',
  'Outdated Optimize Dep',
]

const isRetryableDynamicImportError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error)
  return RETRYABLE_DYNAMIC_IMPORT_PATTERNS.some((pattern) => message.includes(pattern))
}

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

export function lazyWithRetry<P>(
  importer: () => Promise<LazyModule<ComponentType<P>>>,
  options: { retries?: number; delayMs?: number } = {},
) {
  const retries = options.retries ?? 2
  const delayMs = options.delayMs ?? 250

  return lazy(async () => {
    let lastError: unknown
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await importer()
      } catch (error) {
        lastError = error
        if (!isRetryableDynamicImportError(error) || attempt >= retries) break
        await delay(delayMs * (attempt + 1))
      }
    }
    throw lastError
  })
}
