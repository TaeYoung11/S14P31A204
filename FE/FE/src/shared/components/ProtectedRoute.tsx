import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

// 인증된 사용자만 접근 가능한 라우트 가드
// 토큰 없으면 /login 으로 리다이렉트
export function ProtectedRoute() {
  const token = useAuthStore((s) => s.token)
  if (!token) return <Navigate to="/login" replace />
  return <Outlet />
}
