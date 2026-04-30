import type { ComponentProps } from 'react'
import { EditorRightPanels } from '@/features/editor/components/layout/EditorRightPanels'

/** EditorPage 조합부가 우측 패널 영역에 전달하는 props 타입 */
export type EditorRightPanelProps = ComponentProps<typeof EditorRightPanels>

/** 기존 참조와의 호환을 위한 별칭 */
export type RightPanelProps = EditorRightPanelProps
