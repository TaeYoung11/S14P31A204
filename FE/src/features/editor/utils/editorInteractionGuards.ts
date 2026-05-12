/**
 * 에디터 전반에서 공통으로 쓰는 입력 타겟 가드 유틸.
 */

/**
 * 텍스트 입력 포커스 중인지 판별한다.
 * 입력창에서 단축키가 발동하면 UX가 깨지므로, 키 핸들러 초기에 이 함수를 사용해 차단한다.
 */
export const isEditableKeyboardTarget = (target: EventTarget | null) => {
  if (!target || !(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

/**
 * 삭제 단축키(Delete/Backspace/Del) 입력인지 판별한다.
 */
export const isDeleteKeyboardKey = (key: string) => (
  key === 'Delete' || key === 'Backspace' || key === 'Del'
)
