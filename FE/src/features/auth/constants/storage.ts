export const WITHDRAW_NOTICE_KEY = 'batang-withdraw-notice'

const getSessionStorage = () => {
  if (typeof window === 'undefined') return null

  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export const saveWithdrawNotice = () => {
  const sessionStorage = getSessionStorage()
  if (!sessionStorage) return

  try {
    sessionStorage.setItem(WITHDRAW_NOTICE_KEY, 'true')
  } catch {
    // sessionStorage can be unavailable even in a browser, e.g. private mode.
  }
}

export const readWithdrawNotice = (fallback = false) => {
  const sessionStorage = getSessionStorage()

  try {
    return sessionStorage?.getItem(WITHDRAW_NOTICE_KEY) === 'true' || fallback
  } catch {
    return fallback
  }
}

export const clearWithdrawNotice = () => {
  const sessionStorage = getSessionStorage()

  try {
    sessionStorage?.removeItem(WITHDRAW_NOTICE_KEY)
  } catch {
    // Ignore storage cleanup failures; the route state still controls this notice.
  }
}
