import {
  isDeleteKeyboardKey,
  isEditableKeyboardTarget,
} from '../../utils/editorInteractionGuards'

/**
 * 3D 캔버스 상호작용 공통 유틸.
 * ThatOpen/로컬 3D 캔버스에서 동일하게 쓰는 도구 판별/입력 판별 로직을 모아
 * 분기 중복을 줄이고 동작 기준을 일관되게 유지한다.
 */
export const isDeleteTool = (tool?: string) => tool === 'delete'

export const isSelectionTool = (tool?: string) => tool === 'selection'

/** 선택/삭제 모드에서만 캔버스 클릭 선택 로직을 허용한다. */
export const isSelectionInteractionTool = (tool?: string) => (
  isSelectionTool(tool) || isDeleteTool(tool)
)

/** Ctrl/Cmd + Wheel에서만 줌 입력을 통과시킨다. */
export const allowsCtrlWheelZoom = (event: WheelEvent) => event.ctrlKey || event.metaKey

/** Delete/Backspace 계열 삭제 키 판별. */
export { isDeleteKeyboardKey }

/**
 * 텍스트 입력 포커스 중에는 단축키가 의도치 않게 동작하지 않도록 막는다.
 */
export { isEditableKeyboardTarget }
