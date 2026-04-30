import type { ComponentProps } from 'react'
import EditorLeftSidebar from '@/features/editor/components/layout/EditorLeftSidebar'

/** EditorPage 조합부가 좌측 사이드바에 전달하는 props 타입 */
export type EditorLeftSidebarProps = ComponentProps<typeof EditorLeftSidebar>

/** 기존 참조와의 호환을 위한 별칭 */
export type SidebarProps = EditorLeftSidebarProps
