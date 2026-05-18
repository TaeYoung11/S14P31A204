import type { EditorPageViewModel } from '../../types/editorPageViewModel'
import type { EditorCanvasContentProps } from '../../types/editorCanvasContentProps'

/**
 * ViewModel에서 캔버스 props 키 목록만 안전하게 추출한다.
 * - 매핑 오타/누락을 줄이기 위해 키를 단일 선언으로 관리한다.
 */
export function pickCanvasProps<K extends keyof EditorCanvasContentProps>(
  vm: EditorPageViewModel,
  keys: readonly K[],
): Pick<EditorCanvasContentProps, K> {
  return keys.reduce((acc, key) => {
    acc[key] = vm[key]
    return acc
  }, {} as Pick<EditorCanvasContentProps, K>)
}
