import { useEffect, useState } from 'react'
import { useAuthStore } from '@/shared/stores/authStore'

export function useAuthStoreHydrated() {
  const [hasHydrated, setHasHydrated] = useState(() => useAuthStore.persist.hasHydrated())

  useEffect(() => {
    const unsubscribe = useAuthStore.persist.onFinishHydration(() => {
      setHasHydrated(true)
    })

    return unsubscribe
  }, [])

  return hasHydrated
}
