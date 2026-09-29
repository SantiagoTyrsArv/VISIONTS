import { es, type TranslationKey } from './es';

const dictionaries = { es } as const;
type Locale = keyof typeof dictionaries;

let locale: Locale = 'es';

export function setLocale(next: Locale): void {
  locale = next;
}

export function t(key: TranslationKey, params?: Record<string, string>): string {
  let text: string = dictionaries[locale][key];
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, v);
    }
  }
  return text;
}

export type { TranslationKey };
