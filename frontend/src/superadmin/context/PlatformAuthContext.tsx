import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  PlatformAdmin,
  platformSession,
  setSessionExpiredHandler,
} from '../api/platform-client';
import { platformAuthApi } from '../api/platform-auth.api';

interface PlatformAuthContextValue {
  admin: PlatformAdmin | null;
  isAuthenticated: boolean;
  isRestoring: boolean;
  isSigningIn: boolean;
  /** Set once the password is accepted and a second factor is outstanding. */
  isMfaChallengePending: boolean;
  error: string | null;
  notice: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  submitMfaCode: (code: string) => Promise<void>;
  cancelMfaChallenge: () => void;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const PlatformAuthContext = createContext<PlatformAuthContextValue | undefined>(undefined);

export const PlatformAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [admin, setAdmin] = useState<PlatformAdmin | null>(() => {
    return platformSession.getToken() ? platformSession.getAdmin() : null;
  });
  const [isRestoring, setIsRestoring] = useState<boolean>(() => Boolean(platformSession.getToken()));
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isMfaChallengePending, setIsMfaChallengePending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const endSession = useCallback((message: string | null) => {
    platformSession.clear();
    setAdmin(null);
    setIsMfaChallengePending(false);
    setNotice(message);
  }, []);

  // Any 401 from anywhere in the portal drops back to the sign-in screen.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setAdmin((current) => {
        if (current) {
          setNotice('Your platform session ended. Sign in again to continue.');
        }
        return null;
      });
    });

    return () => setSessionExpiredHandler(null);
  }, []);

  // Confirm a restored token is still live before showing the console.
  useEffect(() => {
    let cancelled = false;

    if (!platformSession.getToken()) {
      setIsRestoring(false);
      return;
    }

    platformAuthApi
      .me()
      .then(() => {
        if (!cancelled) setIsRestoring(false);
      })
      .catch(() => {
        if (!cancelled) {
          endSession(null);
          setIsRestoring(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [endSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    setIsSigningIn(true);
    setError(null);
    setNotice(null);

    try {
      const result = await platformAuthApi.login(email, password);

      // The challenge token is stored so the follow-up request can carry it,
      // but the console stays closed until the second factor is accepted.
      platformSession.save(result.token, result.expiresAt, result.superAdmin);

      if (result.mfaRequired) {
        setIsMfaChallengePending(true);
        return;
      }

      setAdmin(result.superAdmin);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in. Try again.');
      throw err;
    } finally {
      setIsSigningIn(false);
    }
  }, []);

  const submitMfaCode = useCallback(async (code: string) => {
    setIsSigningIn(true);
    setError(null);

    try {
      const result = await platformAuthApi.completeMfaChallenge(code);
      platformSession.save(result.token, result.expiresAt, result.superAdmin);
      setIsMfaChallengePending(false);
      setAdmin(result.superAdmin);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code was not accepted.');
      throw err;
    } finally {
      setIsSigningIn(false);
    }
  }, []);

  const cancelMfaChallenge = useCallback(() => {
    platformSession.clear();
    setIsMfaChallengePending(false);
    setError(null);
    setNotice(null);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await platformAuthApi.logout();
    } catch {
      // The local session is dropped either way.
    }
    endSession('You have been signed out of the platform portal.');
  }, [endSession]);

  const value = useMemo<PlatformAuthContextValue>(
    () => ({
      admin,
      isAuthenticated: Boolean(admin),
      isRestoring,
      isSigningIn,
      isMfaChallengePending,
      error,
      notice,
      signIn,
      submitMfaCode,
      cancelMfaChallenge,
      signOut,
      clearError: () => setError(null),
    }),
    [
      admin,
      isRestoring,
      isSigningIn,
      isMfaChallengePending,
      error,
      notice,
      signIn,
      submitMfaCode,
      cancelMfaChallenge,
      signOut,
    ],
  );

  return <PlatformAuthContext.Provider value={value}>{children}</PlatformAuthContext.Provider>;
};

export const usePlatformAuth = (): PlatformAuthContextValue => {
  const context = useContext(PlatformAuthContext);
  if (!context) {
    throw new Error('usePlatformAuth must be used within a PlatformAuthProvider');
  }
  return context;
};
