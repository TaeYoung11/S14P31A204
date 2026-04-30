import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuthStore } from '@/shared/stores/authStore'
import { ProtectedRoute } from './shared/components/ProtectedRoute'
import RouteLoadingFallback from './shared/components/RouteLoadingFallback'

const LoginPage = lazy(() => import('./pages/auth/LoginPage'))
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'))
const ProjectListPage = lazy(() => import('./pages/projects/ProjectListPage'))
const EditorPage = lazy(() => import('./pages/editor/EditorPage'))
const RendersPage = lazy(() => import('./pages/renders/RendersPage'))
const ViewerPage = lazy(() => import('./pages/view/ViewerPage'))
const InviteAcceptPage = lazy(() => import('./pages/invite/InviteAcceptPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

function RootRedirect() {
  const token = useAuthStore((state) => state.token)
  return <Navigate to={token ? '/projects' : '/login'} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteLoadingFallback />}>
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
      </Suspense>
    </BrowserRouter>
  )
}
