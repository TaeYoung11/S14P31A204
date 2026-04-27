import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { produce } from 'immer'
import type { Project } from '@/shared/types'

interface ProjectStore {
  currentProject: Project | null
  setCurrentProject: (project: Project | null) => void
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set) => ({
      currentProject: null,
      setCurrentProject: (project) =>
        set(produce<ProjectStore>((draft) => {
          draft.currentProject = project
        })),
    }),
    { name: 'bim-project' }
  )
)
