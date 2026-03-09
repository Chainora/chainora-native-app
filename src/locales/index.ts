import { en } from './en';
import { vi } from './vi';

export type LocaleLanguage = 'en' | 'vi';
export type LocaleKey = keyof typeof en;

type LocaleDictionary = Record<LocaleLanguage, Record<LocaleKey, string>>;

const dictionaries: LocaleDictionary = {
  en,
  vi,
};

export const translate = (language: LocaleLanguage, key: LocaleKey): string => {
  const dictionary = dictionaries[language] ?? dictionaries.en;
  return dictionary[key] ?? dictionaries.en[key] ?? key;
};
