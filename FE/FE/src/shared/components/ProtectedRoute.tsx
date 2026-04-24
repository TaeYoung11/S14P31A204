import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/shared/stores/authStore'

export function ProtectedRoute() {
  const token = useAuthStore((state) => state.token)
  if (!token) return <Navigate to="/login" replace />
  return <Outlet />
}
