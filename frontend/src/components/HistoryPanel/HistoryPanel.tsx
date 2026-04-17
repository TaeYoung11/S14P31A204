import { useCallback, useEffect } from 'react'
import { Calendar, History, RotateCcw } from 'lucide-react'
import { clsx } from 'clsx'
import { useStore } from '../../stores/useStore'

export const HistoryPanel = () => {
  const history = useStore((state) => state.history)
  const currentProject = useStore((state) => state.currentProject)
  const setHistory = useStore((state) => state.setHistory)

  const fetchHistory = useCallback(async () => {
    if (!currentProject) return
    try {
      const response = await fetch(`http://localhost:8000/api/v1/projects/${currentProject.id}/history`)
      if (!response.ok) throw new Error('Failed to fetch history')
      const data = await response.json()
      setHistory(data)
    } catch (error) {
      console.error('Failed to fetch history:', error)
    }
  }, [currentProject, setHistory])

  useEffect(() => {
    void fetchHistory()
  }, [fetchHistory])

  useEffect(() => {
    const handleModelUpdate = () => {
      void fetchHistory()
    }
    window.addEventListener('bim-model-update', handleModelUpdate)
    window.addEventListener('bim-model-reset', handleModelUpdate)
    return () => {
      window.removeEventListener('bim-model-update', handleModelUpdate)
      window.removeEventListener('bim-model-reset', handleModelUpdate)
    }
  }, [fetchHistory])

  return (
    <div className="w-full h-full flex flex-col glass-panel rounded-3xl overflow-hidden shadow-xl">
      <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
        <div className="flex items-center gap-2.5">
          <History className="w-4 h-4 text-accent" />
          <span className="text-xs font-bold uppercase tracking-wider text-white/70">
            Modification History
          </span>
        </div>
        <button
          onClick={() => void fetchHistory()}
          className="p-1.5 glass-button rounded-lg text-white/40 hover:text-white"
          title="Refresh"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
        {history.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-10">
            <Calendar className="w-10 h-10 mb-2" />
            <span className="text-[10px] font-bold">No Records Found</span>
          </div>
        ) : (
          history.map((item) => (
            <div
              key={item.id}
              className="group p-3 rounded-xl hover:bg-white/[0.03] border border-transparent hover:border-white/5 transition-all"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className={clsx(
                    'text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter',
                    item.action_type === 'delete'
                      ? 'bg-red-500/20 text-red-400'
                      : item.action_type === 'add'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-primary/20 text-primary',
                  )}
                >
                  {item.action_type}
                </span>
                <span className="text-[9px] text-white/20 font-medium">
                  {new Date(item.created_at).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-xs text-white/60 line-clamp-2 leading-snug group-hover:text-white/90 transition-colors">
                {item.command_text}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
