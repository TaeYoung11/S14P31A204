import React from 'react'
import { Layout } from 'lucide-react'
import { AuthoringPanel } from '../AuthoringPanel/AuthoringPanel'
import { ChatPanel } from '../ChatPanel/ChatPanel'
import { HistoryPanel } from '../HistoryPanel/HistoryPanel'
import { LandingPage } from '../LandingPage/LandingPage'
import { PropertyPanel } from '../PropertyPanel/PropertyPanel'
import { Viewer3D } from '../Viewer3D/Viewer3D'
import { useAuthoringSession } from '../../hooks/useAuthoringSession'
import { useWebSocket } from '../../hooks/useWebSocket'
import { useStore } from '../../stores/useStore'

export const BIMViewer: React.FC = () => {
  const currentProject = useStore((state) => state.currentProject)
  const modelRevision = useStore((state) => state.modelRevision)
  const authoringSession = useStore((state) => state.authoringSession)

  useAuthoringSession()
  useWebSocket(currentProject?.id)

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-4 overflow-hidden animate-in fade-in duration-500">
      {!currentProject && <LandingPage />}

      <header className="flex items-center justify-between px-2 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-accent rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
            <Layout className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">BIM 3D SERVICE</h1>
            <p className="text-[10px] text-white/40 uppercase tracking-widest">
              That Open IFC Authoring Workspace
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-[10px] text-white/40 uppercase tracking-widest">
            {authoringSession ? `SESSION ${authoringSession.display_name}` : 'NO SESSION'}
          </div>
          <div className="text-[10px] text-white/40 uppercase tracking-widest">REV {modelRevision}</div>
          <div className="flex gap-2">
            {currentProject && (
              <button
                className="glass-button px-4 py-2 rounded-lg text-xs font-bold text-rose-400 hover:text-rose-300 border border-rose-500/10 hover:border-rose-500/30"
                onClick={() => {
                  useStore.getState().setCurrentProject(null)
                  window.location.reload()
                }}
              >
                CLOSE PROJECT
              </button>
            )}
            <button
              className="glass-button px-4 py-2 rounded-lg text-xs font-bold"
              onClick={async () => {
                if (currentProject) {
                  await fetch(`http://localhost:8000/api/v1/projects/${currentProject.id}/undo`, {
                    method: 'POST',
                  })
                }
              }}
            >
              UNDO
            </button>
            <button
              className="glass-button px-4 py-2 rounded-lg text-xs font-bold"
              onClick={async () => {
                if (currentProject) {
                  await fetch(`http://localhost:8000/api/v1/projects/${currentProject.id}/redo`, {
                    method: 'POST',
                  })
                }
              }}
            >
              REDO
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden min-h-0">
        <div className="w-[28rem] flex flex-col shrink-0 min-h-0 gap-4">
          <div className="h-[44%] min-h-0">
            <AuthoringPanel />
          </div>
          <div className="flex-1 min-h-0">
            <ChatPanel />
          </div>
          <div className="h-56 shrink-0 min-h-0">
            <HistoryPanel />
          </div>
        </div>

        <div className="flex-1 relative rounded-[32px] overflow-hidden mx-4 border border-white/5 shadow-2xl bg-black">
          <Viewer3D />
        </div>

        <div className="w-80 shrink-0 flex flex-col glass-panel rounded-3xl overflow-hidden border-white/5">
          <div className="p-4 border-b border-white/5 flex items-center gap-2 bg-white/[0.01]">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-[10px] font-black uppercase tracking-widest text-white/60">
              Element Properties
            </span>
          </div>
          <div className="flex-1 overflow-hidden">
            <PropertyPanel />
          </div>
        </div>
      </main>

      <footer className="px-2 flex items-center justify-between text-[9px] text-white/20 uppercase tracking-widest font-bold shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            SERVER: ONLINE
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
            WORKSPACE: {currentProject ? currentProject.name : 'INITIALIZING'}
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            ENGINE: THAT OPEN 3.4
          </div>
        </div>
        <div className="flex items-center gap-2">
          IFC AUTHORING: {currentProject?.meta_info?.authoring_supported ? 'IFC4 READY' : 'VIEW ONLY'}
        </div>
      </footer>
    </div>
  )
}
