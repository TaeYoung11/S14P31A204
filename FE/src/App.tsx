import { Suspense, lazy } from 'react'
import { Navigate, Outlet, RouterProvider, createBrowserRouter, useParams } from 'react-router-dom'
import { ProtectedRoute } from './shared/components/ProtectedRoute'
import PublicLandingHeader from './shared/components/PublicLandingHeader'
import RouteErrorFallback from './shared/components/RouteErrorFallback'
import RouteLoadingFallback from './shared/components/RouteLoadingFallback'
import EditorPage from './pages/editor/EditorPage'

const IntroPage = lazy(() => import('./pages/intro/IntroPage'))
const LoginPage = lazy(() => import('./pages/auth/LoginPage'))
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'))
const ProjectListPage = lazy(() => import('./pages/projects/ProjectListPage'))
const RendersPage = lazy(() => import('./pages/renders/RendersPage'))
const ViewerPage = lazy(() => import('./pages/view/ViewerPage'))
const InviteAcceptPage = lazy(() => import('./pages/invite/InviteAcceptPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

function EditorPageRoute() {
  const { projectId } = useParams<{ projectId: string }>()
  return <EditorPage key={projectId ?? 'editor'} />
}

function AppLayout() {
  return (
    <>
      <PublicLandingHeader />
      <Suspense fallback={<RouteLoadingFallback />}>
        <Outlet />
      </Suspense>
    </>
  )
}

const router = createBrowserRouter(
  [
    {
      element: <AppLayout />,
      errorElement: <RouteErrorFallback />,
      children: [
        { path: '/', element: <IntroPage /> },
        { path: '/about', element: <Navigate to="/" replace /> },
        { path: '/login', element: <LoginPage /> },
        { path: '/register', element: <RegisterPage /> },
        { path: '/view/:token', element: <ViewerPage /> },
        { path: '/invite/accept', element: <InviteAcceptPage /> },
        {
          element: <ProtectedRoute />,
          children: [
            { path: '/projects', element: <ProjectListPage /> },
            { path: '/projects/:projectId/editor', element: <EditorPageRoute /> },
            { path: '/projects/:projectId/renders', element: <RendersPage /> },
          ],
        },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  { future: { v7_relativeSplatPath: true } },
)

export default function App() {
  return <RouterProvider router={router} future={{ v7_startTransition: true }} />
}
