import { useEffect, useRef, useState } from 'react'
import { Loader2, MessageSquare, Send, Sparkles, User } from 'lucide-react'
import { clsx } from 'clsx'
import { useStore } from '../../stores/useStore'

export const ChatPanel = () => {
  const [input, setInput] = useState('')
  const messages = useStore((state) => state.messages)
  const currentProject = useStore((state) => state.currentProject)
  const addMessage = useStore((state) => state.addMessage)
  const updateLastMessageStatus = useStore((state) => state.updateLastMessageStatus)
  const scrollRef = useRef<HTMLDivElement>(null)

  const handleSend = async () => {
    if (!input.trim() || !currentProject) return

    const userText = input.trim()
    setInput('')
    addMessage({ sender: 'user', text: userText })
    addMessage({ sender: 'ai', text: 'Analyzing BIM instruction...', status: 'analyzing' })

    try {
      const response = await fetch(
        `http://localhost:8000/api/v1/projects/${currentProject.id}/command?text=${encodeURIComponent(userText)}`,
        { method: 'POST' },
      )
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to process command')
      }

      if (data.status === 'needs_clarification') {
        updateLastMessageStatus('error', data.question ?? 'Please clarify the request.')
      }
    } catch (error) {
      updateLastMessageStatus(
        'error',
        error instanceof Error ? error.message : 'Failed to send command',
      )
    }
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div className="w-full h-full flex flex-col glass-panel rounded-3xl overflow-hidden shadow-2xl">
      <div className="p-5 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight">BIM AI Assistant</h2>
            <div className="flex items-center gap-1.5">
              <div className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] text-white/30 uppercase font-bold tracking-widest">
                Active
              </span>
            </div>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 p-5 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
        {messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center opacity-20 mt-10">
            <Sparkles className="w-12 h-12 mb-4" />
            <p className="text-xs text-center max-w-[240px] leading-relaxed">
              Try commands like "Create a wall on level 1", "Change wall material to brick", or "Delete the selected beam".
            </p>
          </div>
        )}

        {messages.map((msg, index) => (
          <div
            key={index}
            className={clsx(
              'flex gap-3 max-w-[85%]',
              msg.sender === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto',
            )}
          >
            <div
              className={clsx(
                'w-8 h-8 rounded-lg shrink-0 flex items-center justify-center',
                msg.sender === 'user' ? 'bg-accent/20' : 'bg-primary/20',
              )}
            >
              {msg.sender === 'user' ? (
                <User className="w-4 h-4 text-accent" />
              ) : (
                <Sparkles className="w-4 h-4 text-primary" />
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <div
                className={clsx(
                  'p-3.5 rounded-2xl text-sm leading-relaxed',
                  msg.sender === 'user'
                    ? 'bg-accent/10 rounded-tr-none text-white/90'
                    : 'bg-white/[0.03] border border-white/5 rounded-tl-none text-white/80',
                )}
              >
                {msg.text}
              </div>

              {(msg.status === 'analyzing' || msg.status === 'modifying') && (
                <div className="flex items-center gap-2 px-1">
                  <Loader2 className="w-3 h-3 text-primary animate-spin" />
                  <span className="text-[10px] font-bold text-primary uppercase tracking-tighter">
                    {msg.status === 'analyzing' ? 'Analyzing command...' : 'Applying BIM update...'}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="p-5 bg-white/[0.02] border-t border-white/5">
        <div className="relative group">
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && void handleSend()}
            disabled={!currentProject}
            placeholder={
              currentProject
                ? 'Describe a BIM change in natural language...'
                : 'Create or open a project first.'
            }
            className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/5 transition-all disabled:opacity-50"
          />
          <button
            onClick={() => void handleSend()}
            disabled={!currentProject || !input.trim()}
            className="absolute right-2.5 top-2.5 bottom-2.5 px-5 bg-primary rounded-xl text-xs font-bold hover:bg-primary/80 transition-all active:scale-95 disabled:opacity-30 flex items-center gap-2 shadow-lg shadow-primary/20"
          >
            <span>SEND</span>
            <Send className="w-3 h-3" />
          </button>
        </div>
        <div className="mt-4 flex gap-4 overflow-x-auto no-scrollbar pb-1">
          {[
            'Create a wall on level 1',
            'Change the wall material to orange',
            'Delete the selected element',
          ].map((tag) => (
            <button
              key={tag}
              onClick={() => setInput(tag)}
              className="shrink-0 px-3 py-1.5 rounded-full bg-white/[0.02] border border-white/5 text-[10px] text-white/40 hover:text-white/60 hover:bg-white/[0.05] transition-all"
            >
              #{tag}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
