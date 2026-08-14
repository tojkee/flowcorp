import { createContext, useContext, useEffect, useMemo, useState } from "react";
import en from "../locales/en.json";
import ru from "../locales/ru.json";

// Localization system. All visible strings resolve through t(key) so there is
// no hardcoded UI text. English is the default and the fallback when a key is
// missing in another language. The selected language is persisted.

const RESOURCES = { en, ru };
export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ru", label: "Русский" },
];
const DEFAULT_LANGUAGE = "en";
const STORAGE_KEY = "flowcorp.language";

const I18nContext = createContext(null);

function resolveKey(resource, key) {
  return key.split(".").reduce((value, part) => (value && typeof value === "object" ? value[part] : undefined), resource);
}

function interpolate(template, vars) {
  if (!vars || typeof template !== "string") return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => (vars[name] !== undefined ? String(vars[name]) : match));
}

// Standalone translate so non-React code (e.g. canvas rendering) can be passed a
// bound translator.
export function translate(language, key, vars) {
  let value = resolveKey(RESOURCES[language] ?? RESOURCES[DEFAULT_LANGUAGE], key);
  if (value === undefined) value = resolveKey(RESOURCES[DEFAULT_LANGUAGE], key);
  if (value === undefined) return key;
  return interpolate(value, vars);
}

function readStoredLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && RESOURCES[stored]) return stored;
  } catch {
    // localStorage may be unavailable; fall back to default.
  }
  return DEFAULT_LANGUAGE;
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(readStoredLanguage);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Ignore persistence failures.
    }
    if (typeof document !== "undefined") document.documentElement.lang = language;
  }, [language]);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      languages: LANGUAGES,
      t: (key, vars) => translate(language, key, vars),
    }),
    [language],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within a LanguageProvider");
  return context;
}
