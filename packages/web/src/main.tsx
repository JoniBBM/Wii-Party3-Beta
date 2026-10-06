import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { zodForBrowser } from '@insel/shared';
import './styles.css';
import { Toaster } from './ui/toast.tsx';
import { ConfirmHost } from './ui/overlay.tsx';
import { Spinner } from './ui/basics.tsx';
import { Home } from './pages/Home.tsx';
import { JoinPage, JoinTeamLink, JoinModeratorLink } from './pages/join/Join.tsx';

zodForBrowser();

const TeamApp = lazy(() => import('./pages/team/TeamApp.tsx'));
const RegieApp = lazy(() => import('./pages/regie/RegieApp.tsx'));
const ModeratorApp = lazy(() => import('./pages/moderator/ModeratorApp.tsx'));
const BeamerApp = lazy(() => import('./pages/beamer/BeamerApp.tsx'));

function Loading() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <Spinner className="size-10" />
    </div>
  );
}

const wrap = (el: React.ReactNode) => <Suspense fallback={<Loading />}>{el}</Suspense>;

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/join', element: <JoinPage /> },
  { path: '/join/t', element: <JoinTeamLink /> },
  { path: '/join/t/:code', element: <JoinTeamLink /> },
  { path: '/join/m', element: <JoinModeratorLink /> },
  { path: '/join/m/:token', element: <JoinModeratorLink /> },
  { path: '/team', element: wrap(<TeamApp />) },
  { path: '/beamer', element: wrap(<BeamerApp />) },
  { path: '/regie/*', element: wrap(<RegieApp />) },
  { path: '/moderator', element: wrap(<ModeratorApp />) },
  { path: '*', element: <Home /> },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
    <Toaster />
    <ConfirmHost />
  </StrictMode>,
);
