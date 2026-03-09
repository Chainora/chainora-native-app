type TypographyScale = {
  display: number;
  title: number;
  subtitle: number;
  body: number;
  subtext: number;
  caption: number;
  small: number;
  micro: number;
};

export type ThemeTokens = {
  background: string;
  surface: string;
  surfaceHighlight: string;
  foreground: string;
  foregroundMuted: string;
  primary: string;
  primaryLight: string;
  primaryDark: string;
  danger: string;
  success: string;
  warning: string;
  border: string;
  overlay: string;
  shadow: string;
  glow: string;
  typography: TypographyScale;
};

const TYPOGRAPHY: TypographyScale = {
  display: 32,
  title: 24,
  subtitle: 20,
  body: 16,
  subtext: 14,
  caption: 12,
  small: 11,
  micro: 10,
};

export const DARK_THEME: ThemeTokens = {
  // Backgrounds: Obsidian-style dark stack
  background: '#0A0B0D', // --obsidian
  surface: '#14171C', // --graphite
  surfaceHighlight: '#1E232B', // --gunmetal

  // Typography
  foreground: '#E8ECF2', // --text-primary
  foregroundMuted: '#A7B0BF', // --text-secondary

  // Brand: Gold accent
  primary: '#BFA46A', // --accent-gold
  primaryLight: '#D4BA80', // --accent-gold-light
  primaryDark: '#8F7A3E', // slightly deeper gold for pressed states

  // Functional Colors (kept vibrant)
  danger: '#EF4444',  // Red 500
  success: '#10B981', // Emerald 500
  warning: '#F59E0B', // Amber 500

  // UI Borders & Overlays
  border: '#2A3140', // --border
  overlay: 'rgba(10, 11, 13, 0.88)', // dimming backdrop over obsidian

  // Special Effects
  shadow: '#000000',
  glow: 'rgba(191, 164, 106, 0.45)', // soft gold glow

  // Typography scale
  typography: TYPOGRAPHY,
};

export const LIGHT_THEME: ThemeTokens = {
  background: '#F7F8FA',
  surface: '#FFFFFF',
  surfaceHighlight: '#EFF2F7',

  foreground: '#121926',
  foregroundMuted: '#5B6679',

  primary: '#B48F3B',
  primaryLight: '#C9A861',
  primaryDark: '#92702B',

  danger: '#DC2626',
  success: '#059669',
  warning: '#D97706',

  border: '#D4DAE6',
  overlay: 'rgba(18, 25, 38, 0.25)',

  shadow: '#000000',
  glow: 'rgba(180, 143, 59, 0.24)',

  typography: TYPOGRAPHY,
};

export const resolveThemeTokens = (theme: 'dark' | 'light'): ThemeTokens => {
  return theme === 'light' ? LIGHT_THEME : DARK_THEME;
};

export const THEME = DARK_THEME;
