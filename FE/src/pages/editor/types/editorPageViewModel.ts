import type { useEditorPage } from '@/features/editor/hooks/useEditorPage'

/** EditorPage에서 조합에 사용하는 ViewModel 타입 */
export type EditorPageViewModel = ReturnType<typeof useEditorPage>
