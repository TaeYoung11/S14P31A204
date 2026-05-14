// 프로젝트 댓글과 렌더링 알림 토스트 스택을 관리한다.
import { create } from 'zustand'

export type ProjectNotificationToastType = 'comment' | 'render_completed' | 'render_failed' | 'generic'

export interface ProjectNotificationToast {
  id: string
  type: ProjectNotificationToastType
  groupKey: string
  projectId: string
  title: string
  message: string
  pinId?: string
  createdAt: number
  durationMs: number
}

interface ProjectNotificationToastState {
  toasts: ProjectNotificationToast[]
  pushToast: (toast: Omit<ProjectNotificationToast, 'createdAt'>) => void
  dismissToast: (toastId: string) => void
  clearToasts: () => void
}

const MAX_VISIBLE_TOASTS = 3
const PRIORITY_BY_TYPE: Record<ProjectNotificationToastType, number> = {
  comment: 400,
  render_failed: 300,
  render_completed: 200,
  generic: 100,
}

const sortToasts = (toasts: ProjectNotificationToast[]): ProjectNotificationToast[] =>
  [...toasts].sort((left, right) => {
    const priorityDiff = PRIORITY_BY_TYPE[right.type] - PRIORITY_BY_TYPE[left.type]
    if (priorityDiff !== 0) return priorityDiff
    return right.createdAt - left.createdAt
  })

export const useProjectNotificationToastStore = create<ProjectNotificationToastState>((set) => ({
  toasts: [],
  pushToast: (toast) => {
    set((state) => {
      const nextToast = { ...toast, createdAt: Date.now() }
      const withoutSameGroup = state.toasts.filter((current) => current.groupKey !== toast.groupKey)
      return {
        toasts: sortToasts([nextToast, ...withoutSameGroup]).slice(0, MAX_VISIBLE_TOASTS),
      }
    })
  },
  dismissToast: (toastId) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== toastId),
    }))
  },
  clearToasts: () => set({ toasts: [] }),
}))
