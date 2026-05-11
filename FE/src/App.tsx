import { Suspense, lazy } from 'react'
import { BrowserRouter, Route, Routes, useParams } from 'react-router-dom'
import { ProtectedRoute } from './shared/components/ProtectedRoute'
import PublicLandingHeader from './shared/components/PublicLandingHeader'
import RouteLoadingFallback from './shared/components/RouteLoadingFallback'

const IntroPage = lazy(() => import('./pages/intro/IntroPage'))
const AboutPage = lazy(() => import('./pages/about/AboutPage'))
const LoginPage = lazy(() => import('./pages/auth/LoginPage'))
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'))
const ProjectListPage = lazy(() => import('./pages/projects/ProjectListPage'))
const EditorPage = lazy(() => import('./pages/editor/EditorPage'))
const RendersPage = lazy(() => import('./pages/renders/RendersPage'))
const ViewerPage = lazy(() => import('./pages/view/ViewerPage'))
const InviteAcceptPage = lazy(() => import('./pages/invite/InviteAcceptPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

function EditorPageRoute() {
  const { projectId } = useParams<{ projectId: string }>()
  return <EditorPage key={projectId ?? 'editor'} />
}

export default function App() {
  return (
    <BrowserRouter>
      <PublicLandingHeader />
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          <Route path="/" element={<IntroPage />} />
          <Route path="/about" element={<AboutPage />} />

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
