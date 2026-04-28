import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuthStore } from '@/shared/stores/authStore'
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
  const token = useAuthStore((state) => state.token)
  return <Navigate to={token ? '/projects' : '/login'} replace />
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
