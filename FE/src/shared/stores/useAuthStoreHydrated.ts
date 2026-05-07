import { useSyncExternalStore } from 'react'
import { useAuthStore } from '@/shared/stores/authStore'

export function useAuthStoreHydrated() {
  return useSyncExternalStore(
    (onStoreChange) => {
      const unsubscribeHydrate = useAuthStore.persist.onHydrate(onStoreChange)
      const unsubscribeFinish = useAuthStore.persist.onFinishHydration(onStoreChange)
      return () => {
        unsubscribeHydrate()
        unsubscribeFinish()
      }
    },
    () => useAuthStore.persist.hasHydrated(),
    () => true,
  )
}
