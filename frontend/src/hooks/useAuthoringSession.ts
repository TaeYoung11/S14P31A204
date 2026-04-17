import { useEffect } from 'react'
import { useStore } from '../stores/useStore'

const DISPLAY_NAME_KEY = 'bim-authoring-display-name'

const getDisplayName = () => {
  const cached = window.localStorage.getItem(DISPLAY_NAME_KEY)
  if (cached) return cached

  const next = `Guest-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  window.localStorage.setItem(DISPLAY_NAME_KEY, next)
  return next
}

export const useAuthoringSession = () => {
  const currentProject = useStore((state) => state.currentProject)
  const setAuthoringSession = useStore((state) => state.setAuthoringSession)
  const setModelRevision = useStore((state) => state.setModelRevision)

  useEffect(() => {
    let cancelled = false

    const createSession = async () => {
      if (!currentProject?.id || !currentProject.ifc_uploaded) {
        setAuthoringSession(null)
        return
      }

      try {
        const response = await fetch(
          `http://localhost:8000/api/v1/projects/${currentProject.id}/authoring/sessions`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ display_name: getDisplayName() }),
          },
        )

        if (!response.ok) {
          throw new Error(`Failed to create authoring session: ${response.status}`)
        }

        const data = await response.json()
        if (!cancelled) {
          setAuthoringSession(data)
          setModelRevision(data.model_revision ?? currentProject.meta_info?.model_revision ?? 0)
        }
      } catch (error) {
        console.error('Failed to create authoring session:', error)
        if (!cancelled) {
          setAuthoringSession(null)
        }
      }
    }

    void createSession()

    return () => {
      cancelled = true
    }
  }, [currentProject, setAuthoringSession, setModelRevision])
}
