import { useSearchParams } from 'react-router-dom'

// 편집 화면에서 사용되는 모드 타입
// URL: /projects/:projectId/editor?mode=bubble|2d|3d
export type EditorMode = 'bubble' | '2d' | '3d'

export default function EditorPage() {
  const [searchParams] = useSearchParams()

  // mode 파라미터 없을 경우 기본값은 bubble (버블 다이어그램)
  const mode = (searchParams.get('mode') ?? 'bubble') as EditorMode

  return <div>편집 페이지 — 모드: {mode}</div>
}
