import { useCallback, useEffect, useRef } from 'react'
import { useStore } from '../stores/useStore'
import type { ServerMessage } from '../types/bim'

export const useWebSocket = (projectId: string | undefined) => {
  const socketRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const shouldReconnectRef = useRef(true)

  const currentProject = useStore((state) => state.currentProject)
  const authoringSession = useStore((state) => state.authoringSession)
  const selectedElementId = useStore((state) => state.selectedElementId)
  const updateLastMessageStatus = useStore((state) => state.updateLastMessageStatus)
  const setModelRevision = useStore((state) => state.setModelRevision)
  const setPresence = useStore((state) => state.setPresence)
  const setLocks = useStore((state) => state.setLocks)
  const setPreviews = useStore((state) => state.setPreviews)

  const send = useCallback((payload: Record<string, unknown>) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload))
    }
  }, [])

  const connect = useCallback(() => {
    if (!projectId || !currentProject?.ifc_uploaded) return

    const wsUrl = `ws://localhost:8000/ws/${projectId}`
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      if (authoringSession) {
        ws.send(
          JSON.stringify({
            type: 'presence.join',
            session_id: authoringSession.session_id,
            display_name: authoringSession.display_name,
          }),
        )
      }
    }

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data) as ServerMessage

      switch (data.type) {
        case 'connected':
          if (typeof data.model_revision === 'number') {
            setModelRevision(data.model_revision)
          }
          break
        case 'processing':
          updateLastMessageStatus(data.status as 'analyzing' | 'modifying' | 'success' | 'error', data.message)
          break
        case 'model_update':
          updateLastMessageStatus('success', 'BIM model updated.')
          if (typeof data.model_revision === 'number') {
            setModelRevision(data.model_revision)
          }
          window.dispatchEvent(new CustomEvent('bim-model-update', { detail: data }))
          break
        case 'model_reset':
          window.dispatchEvent(new CustomEvent('bim-model-reset', { detail: data }))
          break
        case 'error':
          updateLastMessageStatus('error', data.message)
          break
        case 'presence.state':
          setPresence(data.sessions)
          setModelRevision(data.model_revision)
          break
        case 'lock.state':
          setLocks(data.locks)
          break
        case 'preview.state':
          setPreviews(data.previews)
          break
        case 'commit.accepted':
          setModelRevision(data.model_revision)
          break
        case 'commit.rejected':
          updateLastMessageStatus('error', data.message)
          break
      }
    }

    ws.onclose = () => {
      if (!shouldReconnectRef.current) return
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current)
      }
      reconnectTimerRef.current = window.setTimeout(connect, 3000)
    }

    socketRef.current = ws
  }, [
    authoringSession,
    currentProject?.ifc_uploaded,
    projectId,
    setLocks,
    setModelRevision,
    setPresence,
    setPreviews,
    updateLastMessageStatus,
  ])

  useEffect(() => {
    shouldReconnectRef.current = true
    connect()

    return () => {
      shouldReconnectRef.current = false
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current)
      }
      socketRef.current?.close()
    }
  }, [connect])

  useEffect(() => {
    if (authoringSession) {
      send({
        type: 'presence.join',
        session_id: authoringSession.session_id,
        display_name: authoringSession.display_name,
      })
    }
  }, [authoringSession, send])

  useEffect(() => {
    if (authoringSession?.session_id) {
      send({
        type: 'selection.set',
        session_id: authoringSession.session_id,
        selection: selectedElementId,
      })
    }
  }, [authoringSession?.session_id, selectedElementId, send])

  return {
    socket: socketRef.current,
    send,
  }
}
