import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Spinner from '@/shared/components/Spinner'
import { useAuthSessionGuard } from '@/features/auth/hooks/useAuthSessionGuard'
import { ProtectedRoute } from './shared/components/ProtectedRoute'
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import ProjectListPage from './pages/projects/ProjectListPage'
import EditorPage from './pages/editor/EditorPage'
import RendersPage from './pages/renders/RendersPage'
import ViewerPage from './pages/view/ViewerPage'
import InviteAcceptPage from './pages/invite/InviteAcceptPage'
import NotFoundPage from './pages/NotFoundPage'

function RootRedirect() {
  const { status, isLoading } = useAuthSessionGuard()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Spinner size="lg" />
      </div>
    )
  }

  return <Navigate to={status === 'authenticated' ? '/projects' : '/login'} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />

        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/view/:token" element={<ViewerPage />} />
        <Route path="/invite/accept" element={<InviteAcceptPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/projects" element={<ProjectListPage />} />
          <Route path="/projects/:projectId/editor" element={<EditorPage />} />
          <Route path="/projects/:projectId/renders" element={<RendersPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
