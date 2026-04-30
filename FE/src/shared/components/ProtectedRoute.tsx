import { Navigate, Outlet } from 'react-router-dom'
import Spinner from '@/shared/components/Spinner'
import { useAuthSessionGuard } from '@/features/auth/hooks/useAuthSessionGuard'

export function ProtectedRoute() {
  const { status, isLoading } = useAuthSessionGuard()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Spinner size="lg" />
      </div>
    )
  }

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
