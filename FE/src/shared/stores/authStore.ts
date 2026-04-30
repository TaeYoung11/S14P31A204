import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { produce } from 'immer'
import type { User } from '@/shared/types'

interface AuthStore {
  user: User | null
  token: string | null
  refreshToken: string | null
  setUser: (user: User | null) => void
  setToken: (token: string | null) => void
  setRefreshToken: (token: string | null) => void
  logout: () => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      refreshToken: null,
      setUser: (user) =>
        set(produce<AuthStore>((draft) => { draft.user = user })),
      setToken: (token) =>
        set(produce<AuthStore>((draft) => { draft.token = token })),
      setRefreshToken: (token) =>
        set(produce<AuthStore>((draft) => { draft.refreshToken = token })),
      logout: () =>
        set(produce<AuthStore>((draft) => {
          draft.user = null
          draft.token = null
          draft.refreshToken = null
        })),
    }),
    {
      name: 'bim-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
      }),
    }
  )
)
