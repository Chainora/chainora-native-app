import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AuthSession = {
  address: string;
  authenticated: boolean;
  issuedAt: string;
  expiresAt: string;
};

const STORAGE_KEY = '@chainora/authSession';
const SESSION_PENDING_TTL_MS = 10 * 60 * 1000; // 10 minutes
const SESSION_ACTIVE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export type AuthContextValue = {
  session: AuthSession | null;
  isAuthenticated: boolean;
  initializeSession: (address: string) => Promise<AuthSession>;
  completeSession: () => Promise<AuthSession>;
  clearSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const nowIso = () => new Date().toISOString();
const addMillis = (millis: number) => new Date(Date.now() + millis).toISOString();

const normalizeSession = (input: unknown): AuthSession | null => {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const candidate = input as Partial<AuthSession> & { address?: string; signature?: string };
  if (!candidate.address || typeof candidate.address !== 'string') {
    return null;
  }

  const address = candidate.address.toLowerCase();
  const issuedAt = typeof candidate.issuedAt === 'string' ? candidate.issuedAt : nowIso();
  const expiresAt = typeof candidate.expiresAt === 'string' ? candidate.expiresAt : addMillis(SESSION_PENDING_TTL_MS);
  const authenticated =
    typeof candidate.authenticated === 'boolean'
      ? candidate.authenticated
      : Boolean(candidate.signature && candidate.signature.length > 0);

  return {
    address,
    authenticated,
    issuedAt,
    expiresAt,
  };
};

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const readSession = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!stored) {
          return;
        }
        const raw = JSON.parse(stored) as unknown;
        const parsed = normalizeSession(raw);
        setSession(parsed);
      } catch (error) {
        console.warn('[Auth] Failed to load session from storage', error);
      } finally {
        setLoaded(true);
      }
    };

    readSession();
  }, []);

  useEffect(() => {
    if (!loaded) {
      return;
    }
    if (!session) {
      AsyncStorage.removeItem(STORAGE_KEY).catch(storageError => {
        console.warn('[Auth] Failed to clear storage', storageError);
      });
      return;
    }

    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session)).catch(storageError => {
      console.warn('[Auth] Failed to persist session', storageError);
    });
  }, [session, loaded]);

  const clearSession = useCallback(async () => {
    setSession(null);
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn('[Auth] Failed to remove session', error);
    }
  }, []);

  const initializeSession = useCallback(
    async (address: string): Promise<AuthSession> => {
      const normalized = address.toLowerCase();
      const current = session;
      const currentExpiration = current ? Date.parse(current.expiresAt) : 0;
      const now = Date.now();

      if (current && current.address === normalized && currentExpiration > now) {
        if (typeof current.authenticated !== 'boolean') {
          const migrated = normalizeSession({ ...current });
          if (migrated) {
            setSession(migrated);
            return migrated;
          }
        }
        return current;
      }

      const next: AuthSession = {
        address: normalized,
        authenticated: false,
        issuedAt: nowIso(),
        expiresAt: addMillis(SESSION_PENDING_TTL_MS),
      };
      setSession(next);
      return next;
    },
    [session],
  );

  const completeSession = useCallback(
    async (): Promise<AuthSession> => {
      if (!session) {
        throw new Error('No session active');
      }

      const next: AuthSession = {
        ...session,
        authenticated: true,
        issuedAt: nowIso(),
        expiresAt: addMillis(SESSION_ACTIVE_TTL_MS),
      };
      setSession(next);
      return next;
    },
    [session],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthenticated: Boolean(session?.authenticated && Date.parse(session.expiresAt) > Date.now()),
      initializeSession,
      completeSession,
      clearSession,
    }),
    [session, initializeSession, completeSession, clearSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
``