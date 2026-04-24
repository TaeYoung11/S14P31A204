import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuthStore } from './shared/store/authStore'
import { ProtectedRoute } from './shared/components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ProjectListPage from './pages/projects/ProjectListPage'
import ProjectNewPage from './pages/projects/ProjectNewPage'
import SiteInfoPage from './pages/projects/SiteInfoPage'
import EditorPage from './pages/editor/EditorPage'
import RendersPage from './pages/renders/RendersPage'
import ViewerPage from './pages/view/ViewerPage'
import InviteAcceptPage from './pages/invite/InviteAcceptPage'
import NotFoundPage from './pages/NotFoundPage'

// 로그인 여부에 따라 /projects 또는 /login 으로 리다이렉트
function RootRedirect() {
  const token = useAuthStore((s) => s.token)
  return <Navigate to="/projects" replace />

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />

        {/* 비인증 공개 라우트 */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/view/:token" element={<ViewerPage />} />
        <Route path="/invite/accept" element={<InviteAcceptPage />} />

        {/* 인증 필요 라우트 */}
        <Route element={<ProtectedRoute />}>
          <Route path="/projects" element={<ProjectListPage />} />
          <Route path="/projects/new" element={<ProjectNewPage />} />
          <Route path="/projects/:projectId/site-info" element={<SiteInfoPage />} />
          <Route path="/projects/:projectId/editor" element={<EditorPage />} />
          <Route path="/projects/:projectId/renders" element={<RendersPage />} />
        </Route>

        {/* 존재하지 않는 경로 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
