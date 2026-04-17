import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  AuthoringDraft,
  AuthoringLock,
  AuthoringPreview,
  AuthoringSession,
  AuthoringTool,
  HistoryItem,
  PresenceSession,
  Project,
} from '../types/bim'

interface ChatMessage {
  id: string
  sender: 'user' | 'ai'
  text: string
  timestamp: Date
  status?: 'analyzing' | 'modifying' | 'success' | 'error'
}

interface BIMStore {
  currentProject: Project | null
  setCurrentProject: (project: Project | null) => void

  messages: ChatMessage[]
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  updateLastMessageStatus: (status: ChatMessage['status'], text?: string) => void

  selectedElementId: string | null
  setSelectedId: (id: string | null) => void
  selectedElementProperties: Record<string, unknown> | null
  setSelectedElementProperties: (properties: Record<string, unknown> | null) => void

  isSidebarOpen: boolean
  toggleSidebar: () => void

  history: HistoryItem[]
  setHistory: (history: HistoryItem[]) => void

  authoringSession: AuthoringSession | null
  setAuthoringSession: (session: AuthoringSession | null) => void
  modelRevision: number
  setModelRevision: (revision: number) => void
  presence: PresenceSession[]
  setPresence: (presence: PresenceSession[]) => void
  locks: AuthoringLock[]
  setLocks: (locks: AuthoringLock[]) => void
  previews: AuthoringPreview[]
  setPreviews: (previews: AuthoringPreview[]) => void

  activeTool: AuthoringTool
  setActiveTool: (tool: AuthoringTool) => void
  activeStoreyGuid: string | null
  setActiveStoreyGuid: (guid: string | null) => void
  authoringDraft: AuthoringDraft
  setAuthoringDraft: (draft: AuthoringDraft) => void
  resetAuthoringDraft: () => void
}

export const useStore = create<BIMStore>()(
  persist(
    (set) => ({
      currentProject: null,
      setCurrentProject: (project) =>
        set({
          currentProject: project,
          modelRevision: project?.meta_info?.model_revision ?? 0,
          activeStoreyGuid: project?.meta_info?.storeys?.[0]?.guid ?? null,
        }),

      messages: [],
      addMessage: (msg) =>
        set((state) => ({
          messages: [
            ...state.messages,
            { ...msg, id: Math.random().toString(36).slice(2), timestamp: new Date() },
          ],
        })),
      updateLastMessageStatus: (status, text) =>
        set((state) => {
          const messages = [...state.messages]
          if (messages.length > 0) {
            const last = messages[messages.length - 1]
            if (last.sender === 'ai') {
              last.status = status
              if (text) last.text = text
            }
          }
          return { messages }
        }),

      selectedElementId: null,
      setSelectedId: (id) => set({ selectedElementId: id }),
      selectedElementProperties: null,
      setSelectedElementProperties: (properties) => set({ selectedElementProperties: properties }),

      isSidebarOpen: true,
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),

      history: [],
      setHistory: (history) => set({ history }),

      authoringSession: null,
      setAuthoringSession: (session) => set({ authoringSession: session }),
      modelRevision: 0,
      setModelRevision: (revision) => set({ modelRevision: revision }),
      presence: [],
      setPresence: (presence) => set({ presence }),
      locks: [],
      setLocks: (locks) => set({ locks }),
      previews: [],
      setPreviews: (previews) => set({ previews }),

      activeTool: 'select',
      setActiveTool: (tool) => set({ activeTool: tool }),
      activeStoreyGuid: null,
      setActiveStoreyGuid: (guid) => set({ activeStoreyGuid: guid }),
      authoringDraft: {},
      setAuthoringDraft: (draft) => set({ authoringDraft: draft }),
      resetAuthoringDraft: () => set({ authoringDraft: {} }),
    }),
    {
      name: 'bim-storage',
      partialize: (state) => ({
        currentProject: state.currentProject,
        messages: state.messages,
        history: state.history,
      }),
    },
  ),
)
