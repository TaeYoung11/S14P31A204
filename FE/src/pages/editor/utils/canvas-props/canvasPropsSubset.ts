import type { EditorCanvasContentProps } from '../../types/editorCanvasContentProps'

/**
 * 캔버스 조립 유틸에서 필요한 props 키 집합만 안전하게 추출하기 위한 타입 유틸.
 */
export type CanvasPropsSubset<K extends keyof EditorCanvasContentProps> = Pick<EditorCanvasContentProps, K>
