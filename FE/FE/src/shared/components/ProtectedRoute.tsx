import { Outlet } from 'react-router-dom'

// 인증된 사용자만 접근 가능한 라우트 가드
// 토큰 없으면 /login 으로 리다이렉트
export function ProtectedRoute() {
// TODO: BE auth 구현 후 인증 체크 복구
  return <Outlet />
}
