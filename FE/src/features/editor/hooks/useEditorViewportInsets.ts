import { useMemo } from 'react'
import type { EditorMode } from '../types'
import { EMPTY_VIEWPORT_INSETS, type ViewportInsets } from '../utils/viewportInsets'

const EDITOR_READ_ONLY_LEFT_INSET = 24
const EDITOR_LEFT_TOOLBAR_INSET = 140
const EDITOR_RIGHT_PANEL_INSET = 120

interface UseEditorViewportInsetsParams {
  mode: EditorMode
  isEditorReadOnly: boolean
  isCollaborationMode: boolean
  isAgentPanelMode: boolean
  isAttributePanelOpen: boolean
  attributePanelWidth?: number
}

/**
 * 편집 캔버스의 자동 fit/center 기준이 되는 가시영역 inset을 계산한다.
 * - view 모드: 패널을 고려하지 않고 전체 스테이지 사용
 * - edit 모드: 좌측 툴바/우측 패널 점유폭을 제외한 실가시영역 기준
 */
export function useEditorViewportInsets({
  mode,
  isEditorReadOnly,
}: UseEditorViewportInsetsParams): ViewportInsets {
  return useMemo(() => {
    if (mode === 'view') return EMPTY_VIEWPORT_INSETS

    const left = isEditorReadOnly ? EDITOR_READ_ONLY_LEFT_INSET : EDITOR_LEFT_TOOLBAR_INSET
    const right = EDITOR_RIGHT_PANEL_INSET
    return { left, right, top: 0, bottom: 0 }
  }, [isEditorReadOnly, mode])
}
