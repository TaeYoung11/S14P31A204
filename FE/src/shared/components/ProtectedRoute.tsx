import { Navigate, Outlet } from 'react-router-dom'
import { useAuthSessionGuard } from '@/features/auth/hooks/useAuthSessionGuard'
import { useProjectInvitationRealtime } from '@/features/project/hooks/useInvitation'
import FullPageSpinner from '@/shared/components/FullPageSpinner'

/**
 * 인증이 필요한 라우트를 보호한다.
 * - 세션 검증 중: 전체 로딩 화면
 * - 미인증: 로그인 페이지로 리다이렉트
 */
export function ProtectedRoute() {
  const { status, isLoading } = useAuthSessionGuard()
  useProjectInvitationRealtime(status === 'authenticated')

  if (isLoading) {
    return <FullPageSpinner />
  }

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
