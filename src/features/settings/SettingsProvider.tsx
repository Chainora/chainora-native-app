import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { translate, type LocaleKey } from '../../locales';
import { setActiveNetwork } from '../../config/network';
import { resolveThemeTokens } from '../../types/theme/colors';
import type {
  AppCurrency,
  AppLanguage,
  AppNetwork,
  AppSettings,
  ResolvedTheme,
  ThemePreference,
} from './types';

const STORAGE_KEY = '@chainora/settings';

const DEFAULT_SETTINGS: AppSettings = {
  language: 'en',
  currency: 'bnb',
  theme: 'system',
  network: 'chainora',
};

type SettingsContextValue = {
  settings: AppSettings;
  hydrated: boolean;
  resolvedTheme: ResolvedTheme;
  themeTokens: ReturnType<typeof resolveThemeTokens>;
  setLanguage: (language: AppLanguage) => void;
  setCurrency: (currency: AppCurrency) => void;
  setTheme: (theme: ThemePreference) => void;
  setNetwork: (network: AppNetwork) => void;
  t: (key: LocaleKey) => string;
};

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

const parseStoredSettings = (raw: string | null): AppSettings => {
  if (!raw) {
    return DEFAULT_SETTINGS;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>;

    return {
      language: parsed.language === 'vi' ? 'vi' : 'en',
      currency: parsed.currency === 'btc' || parsed.currency === 'usd' ? parsed.currency : 'bnb',
      theme:
        parsed.theme === 'dark' || parsed.theme === 'light' || parsed.theme === 'system'
          ? parsed.theme
          : 'system',
      network: parsed.network === 'eth' ? 'eth' : 'chainora',
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const SettingsProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadSettings = async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!mounted) {
        return;
      }
      const parsed = parseStoredSettings(raw);
      setActiveNetwork(parsed.network);
      setSettings(parsed);
      setHydrated(true);
    };

    loadSettings().catch(() => {
      if (mounted) {
        setHydrated(true);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  const persist = useCallback(async (next: AppSettings) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const updateSettings = useCallback(
    (updater: (prev: AppSettings) => AppSettings) => {
      setSettings(prev => {
        const next = updater(prev);
        persist(next).catch(() => undefined);
        return next;
      });
    },
    [persist],
  );

  const setLanguage = useCallback(
    (language: AppLanguage) => {
      updateSettings(prev => ({ ...prev, language }));
    },
    [updateSettings],
  );

  const setCurrency = useCallback(
    (currency: AppCurrency) => {
      updateSettings(prev => ({ ...prev, currency }));
    },
    [updateSettings],
  );

  const setTheme = useCallback(
    (theme: ThemePreference) => {
      updateSettings(prev => ({ ...prev, theme }));
    },
    [updateSettings],
  );

  const setNetwork = useCallback(
    (network: AppNetwork) => {
      setActiveNetwork(network);
      updateSettings(prev => ({ ...prev, network }));
    },
    [updateSettings],
  );

  const resolvedTheme: ResolvedTheme =
    settings.theme === 'system'
      ? systemColorScheme === 'light'
        ? 'light'
        : 'dark'
      : settings.theme;

  const themeTokens = useMemo(() => resolveThemeTokens(resolvedTheme), [resolvedTheme]);

  const t = useCallback(
    (key: LocaleKey) => {
      return translate(settings.language, key);
    },
    [settings.language],
  );

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      hydrated,
      resolvedTheme,
      themeTokens,
      setLanguage,
      setCurrency,
      setTheme,
      setNetwork,
      t,
    }),
    [hydrated, resolvedTheme, setCurrency, setLanguage, setNetwork, setTheme, settings, t, themeTokens],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

export const useSettings = (): SettingsContextValue => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return context;
};
