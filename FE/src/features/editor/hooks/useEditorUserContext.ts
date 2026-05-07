import { useMemo } from 'react'
import type { Project, User } from '@/shared/types'
import type { CollaborationUserType } from '../types'

const DEFAULT_DESIGNER_NAME = '설계자'
const DEFAULT_CUSTOMER_NAME = '고객사 담당자'

interface UseEditorUserContextOptions {
  authUser: User | null
  currentProject: Project | null
  projectId?: string
}

interface EditorUserContextResult {
  currentUserType: CollaborationUserType | null
  collaborationUserType: CollaborationUserType
  counterpartType: CollaborationUserType
  currentUserName: string
  hasIfcUploadedInCurrentProject: boolean
  isCurrentProjectOwnerKnown: boolean
  isCurrentProjectOwner: boolean
}

/**
 * 에디터 권한/협업 사용자 정보를 단일 규칙으로 계산한다.
 * - 인증 사용자 타입 정규화
 * - 협업 상대 타입 계산
 * - 프로젝트 소유권/IFC 업로드 여부 계산
 */
export function useEditorUserContext({
  authUser,
  currentProject,
  projectId,
}: UseEditorUserContextOptions): EditorUserContextResult {
  return useMemo(() => {
    const currentUserType: CollaborationUserType | null =
      authUser?.user_type === 'DESIGNER' || authUser?.user_type === 'CUSTOMER'
        ? authUser.user_type
        : null
    const collaborationUserType: CollaborationUserType = currentUserType ?? 'CUSTOMER'
    const counterpartType: CollaborationUserType = collaborationUserType === 'DESIGNER' ? 'CUSTOMER' : 'DESIGNER'

    const currentUserName = authUser?.name?.trim()
      ? authUser.name.trim()
      : (collaborationUserType === 'DESIGNER' ? DEFAULT_DESIGNER_NAME : DEFAULT_CUSTOMER_NAME)

    const hasIfcUploadedInCurrentProject = Boolean(
      projectId &&
      currentProject?.id === projectId &&
      currentProject.ifc_uploaded,
    )

    const isCurrentProjectOwnerKnown = Boolean(
      projectId &&
      currentProject?.id === projectId &&
      currentProject.owner_id,
    )

    const isCurrentProjectOwner = Boolean(
      isCurrentProjectOwnerKnown &&
      authUser?.id &&
      currentProject?.owner_id === authUser.id,
    )

    return {
      currentUserType,
      collaborationUserType,
      counterpartType,
      currentUserName,
      hasIfcUploadedInCurrentProject,
      isCurrentProjectOwnerKnown,
      isCurrentProjectOwner,
    }
  }, [authUser, currentProject, projectId])
}
