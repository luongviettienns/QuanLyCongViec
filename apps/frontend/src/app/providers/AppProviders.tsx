import type { ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../../features/auth/context/AuthContext';
import { RealtimeProvider } from '../../features/realtime';
import { ErrorBoundary } from '../pages/errors';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <RealtimeProvider>{children}</RealtimeProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
