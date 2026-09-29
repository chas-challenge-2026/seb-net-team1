import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { queryClient } from './api/queryClient';
import { useAuth } from './auth/AuthContext';
import { AuthProvider } from './auth/AuthProvider';
import { SplashScreen } from './components/layout/SplashScreen';
import { ToastProvider } from './components/ui/toast/ToastProvider';
import { router } from './routes/router';
import { safeRedirect } from './routes/searchSchemas';

function handleSignedOut() {
  void router.navigate({ to: '/login', replace: true });
}

/** The refresh token was rejected: go to the login page and come back here afterwards. */
function handleSessionExpired() {
  const { pathname, href } = router.state.location;
  if (pathname === '/login') return;
  void router.navigate({
    to: '/login',
    search: { redirect: safeRedirect(href), reason: 'expired' },
    replace: true,
  });
}

function AppRouter() {
  const { status } = useAuth();
  // Wait until the session has been restored so the route guards see the right user.
  if (status === 'bootstrapping') return <SplashScreen />;
  return <RouterProvider router={router} />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider onSignedOut={handleSignedOut} onSessionExpired={handleSessionExpired}>
          <AppRouter />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
