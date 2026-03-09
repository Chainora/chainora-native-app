import type { LocaleLanguage } from '../../locales';

export type AppLanguage = LocaleLanguage;
export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';
export type AppCurrency = 'bnb' | 'btc' | 'usd';

export type AppSettings = {
  language: AppLanguage;
  currency: AppCurrency;
  theme: ThemePreference;
};
