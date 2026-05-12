import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { useAuthSessionGuard } from '@/features/auth/hooks/useAuthSessionGuard'
import FullPageSpinner from '@/shared/components/FullPageSpinner'
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
  const { status, isLoading } = useAuthSessionGuard()

  if (isLoading) {
    return <FullPageSpinner />
  }

  return <Navigate to={status === 'authenticated' ? '/projects' : '/login'} replace />
}

function EditorPageRoute() {
  const { projectId } = useParams<{ projectId: string }>()
  return <EditorPage key={projectId ?? 'editor'} />
}

export default function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />

          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/view/:token" element={<ViewerPage />} />
          <Route path="/invite/accept" element={<InviteAcceptPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/projects" element={<ProjectListPage />} />
            <Route path="/projects/:projectId/editor" element={<EditorPageRoute />} />
            <Route path="/projects/:projectId/renders" element={<RendersPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
