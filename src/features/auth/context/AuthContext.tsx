import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AuthSession = {
  address: string;
  challenge: string;
  signature?: string;
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
  completeSession: (signature: string) => Promise<AuthSession>;
  clearSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const buildChallenge = (address: string, nonce: string) =>
  `Chainora authentication challenge for ${address}. Nonce: ${nonce}. Sign to prove card possession.`;

const nowIso = () => new Date().toISOString();
const addMillis = (millis: number) => new Date(Date.now() + millis).toISOString();

const generateNonce = () => {
  try {
    const array = new Uint32Array(4);
    const cryptoApi = globalThis as typeof globalThis & {
      crypto?: {
        getRandomValues?: (buffer: Uint32Array) => Uint32Array;
      };
    };

    if (typeof cryptoApi.crypto?.getRandomValues === 'function') {
      cryptoApi.crypto.getRandomValues(array);
    } else {
      for (let index = 0; index < array.length; index += 1) {
        array[index] = Math.floor(Math.random() * 0xffffffff);
      }
    }
    return Array.from(array)
      .map(value => value.toString(16).padStart(8, '0'))
      .join('');
  } catch {
    const fallback = Math.random().toString(16).slice(2);
    return fallback.padEnd(32, '0');
  }
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
        const parsed = JSON.parse(stored) as AuthSession;
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
        return current;
      }

      const nonce = generateNonce();
      const challenge = buildChallenge(normalized, nonce);
      const next: AuthSession = {
        address: normalized,
        challenge,
        issuedAt: nowIso(),
        expiresAt: addMillis(SESSION_PENDING_TTL_MS),
      };
      setSession(next);
      return next;
    },
    [session],
  );

  const completeSession = useCallback(
    async (signature: string): Promise<AuthSession> => {
      if (!session) {
        throw new Error('No session active');
      }

      const next: AuthSession = {
        ...session,
        signature,
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
      isAuthenticated: Boolean(session?.signature && Date.parse(session.expiresAt) > Date.now()),
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