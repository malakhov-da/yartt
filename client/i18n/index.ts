import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { LOCALES, type Locale } from '#shared/employee.ts';
import { TRANSLATIONS, type Translation } from '#shared/i18n/index.ts';

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: Translation };
  }
}

// Before sign-in the language comes from the browser, after it from the profile (employee.locale).
function browserLocale(): Locale {
  const preferred = navigator.language.slice(0, 2);
  return (LOCALES as readonly string[]).includes(preferred) ? (preferred as Locale) : 'ru';
}

void i18n.use(initReactI18next).init({
  resources: Object.fromEntries(LOCALES.map((locale) => [locale, { translation: TRANSLATIONS[locale] }])),
  lng: browserLocale(),
  fallbackLng: 'ru',
  interpolation: { escapeValue: false },
});

export default i18n;
