import type { LocaleLanguage } from '@locales';
import type { NetworkKey } from '@config/network';

export type AppLanguage = LocaleLanguage;
export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';
export type AppCurrency = 'usd' | 'vnd';
export type AppNetwork = NetworkKey;

export type AppSettings = {
  language: AppLanguage;
  currency: AppCurrency;
  theme: ThemePreference;
  network: AppNetwork;
};
