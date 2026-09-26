import React from 'react';
import { PlatformAuthProvider, usePlatformAuth } from './context/PlatformAuthContext';
import { PlatformThemeProvider } from './theme/PlatformThemeContext';
import { PlatformLoginView } from './views/PlatformLoginView';
import { PlatformMfaChallengeView } from './views/PlatformMfaChallengeView';
import { PlatformConsoleView } from './views/PlatformConsoleView';
import { PlatformToaster } from './components/PlatformToaster';

const PlatformRouter: React.FC = () => {
  const { isAuthenticated, isRestoring, isMfaChallengePending } = usePlatformAuth();

  if (isRestoring) {
    return (
      <div className="min-h-screen bg-hq-background flex flex-col items-center justify-center gap-4">
        <div
          className="w-10 h-10 border-[3px] border-hq-primary/30 border-t-hq-primary rounded-full animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        <p className="text-xs font-semibold uppercase tracking-widest text-hq-muted-foreground" role="status">
          Restoring platform session
        </p>
      </div>
    );
  }

  if (isAuthenticated) {
    return <PlatformConsoleView />;
  }

  return isMfaChallengePending ? <PlatformMfaChallengeView /> : <PlatformLoginView />;
};

/**
 * Root of the platform portal. It is a deliberately separate application from
 * the tenant workspace: separate URL, separate sign-in and separate session.
 */
export const PlatformApp: React.FC = () => (
  <PlatformThemeProvider>
    <PlatformAuthProvider>
      <PlatformRouter />
      <PlatformToaster />
    </PlatformAuthProvider>
  </PlatformThemeProvider>
);

export default PlatformApp;
