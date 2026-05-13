import { useEffect } from 'react'
import type { EditorMode } from '../types'
import { isDeleteKeyboardKey, isEditableKeyboardTarget } from '../utils/editorInteractionGuards'

interface UseEditorKeyboardShortcutsParams {
  mode: EditorMode
  isEditorReadOnly: boolean
  isDeleteEnabled?: boolean
  onDeleteSelected: () => void
  onToggleLayerOverlay: () => void
  onSetTool: (tool: string) => void
}

/**
 * 에디터 전역 키보드 단축키를 한 곳에서 관리한다.
 * - Delete/Backspace: 현재 선택 삭제
 * - Shift+L: 2D/3D 오버레이 토글
 * - W/E/R: 3D 기즈모 모드 전환
 */
export function useEditorKeyboardShortcuts({
  mode,
  isEditorReadOnly,
  isDeleteEnabled = true,
  onDeleteSelected,
  onToggleLayerOverlay,
  onSetTool,
}: UseEditorKeyboardShortcutsParams) {
  // Delete/Backspace 키 삭제
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isDeleteEnabled) return
      if (isEditableKeyboardTarget(event.target)) return
      const isDeleteKey = isDeleteKeyboardKey(event.key) || event.code === 'Delete' || event.code === 'Backspace'
      if (!isDeleteKey) return
      event.preventDefault()
      onDeleteSelected()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isDeleteEnabled, onDeleteSelected])

  // Shift+L: 층 오버레이 토글 (2D/3D 전용)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) return
      if (event.repeat) return
      if (!event.shiftKey || event.code !== 'KeyL') return
      if (mode !== '2d' && mode !== '3d') return
      event.preventDefault()
      onToggleLayerOverlay()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode, onToggleLayerOverlay])

  // W/E/R: 3D 기즈모 단축키
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (mode !== '3d' || isEditorReadOnly) return
      if (isEditableKeyboardTarget(event.target)) return
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
      if (event.repeat) return

      const key = event.key.toLowerCase()
      if (key === 'w') {
        event.preventDefault()
        onSetTool('selection')
        return
      }
      if (key === 'e') {
        event.preventDefault()
        onSetTool('rotate')
        return
      }
      if (key === 'r') {
        event.preventDefault()
        onSetTool('scale')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode, isEditorReadOnly, onSetTool])
}
