import { useCallback, useEffect, useRef, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import type { SaveStatus } from '@/features/editor/types'

interface UseUnsavedChangesGuardParams {
  hasUnsavedChanges: boolean
  saveStatus: SaveStatus
  onSave: () => void
}

export function useUnsavedChangesGuard({
  hasUnsavedChanges,
  saveStatus,
  onSave,
}: UseUnsavedChangesGuardParams) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const pendingNavigationRef = useRef<(() => void) | null>(null)
  const skipNextBeforeUnloadRef = useRef(false)
  const allowNextNavigationRef = useRef(false)
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (!hasUnsavedChanges || allowNextNavigationRef.current) return false
    return (
      currentLocation.pathname !== nextLocation.pathname ||
      currentLocation.search !== nextLocation.search ||
      currentLocation.hash !== nextLocation.hash
    )
  })

  const closeModal = useCallback(() => {
    pendingNavigationRef.current = null
    if (blocker.state === 'blocked') blocker.reset()
    setIsModalOpen(false)
  }, [blocker])

  const requestNavigation = useCallback((navigateAction: () => void) => {
    if (!hasUnsavedChanges) {
      navigateAction()
      return
    }

    pendingNavigationRef.current = navigateAction
    setIsModalOpen(true)
  }, [hasUnsavedChanges])

  const leaveAnyway = useCallback(() => {
    const navigateAction = pendingNavigationRef.current
    pendingNavigationRef.current = null
    setIsModalOpen(false)

    skipNextBeforeUnloadRef.current = true
    allowNextNavigationRef.current = true
    if (navigateAction) {
      navigateAction()
    } else if (blocker.state === 'blocked') {
      blocker.proceed()
    }
    window.setTimeout(() => {
      skipNextBeforeUnloadRef.current = false
      allowNextNavigationRef.current = false
    }, 1000)
  }, [blocker])

  const saveAndStay = useCallback(() => {
    onSave()
    closeModal()
  }, [closeModal, onSave])

  useEffect(() => {
    if (!hasUnsavedChanges) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (skipNextBeforeUnloadRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  return {
    requestNavigation,
    unsavedChangesModalProps: {
      isOpen: isModalOpen || blocker.state === 'blocked',
      saveStatus,
      onClose: closeModal,
      onSave: saveAndStay,
      onLeave: leaveAnyway,
    },
  }
}
