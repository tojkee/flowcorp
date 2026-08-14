import { createContext, useContext, useEffect, useMemo, useState } from "react";
import en from "../locales/en.json";
import ru from "../locales/ru.json";
import { readKey, writeKey } from "../core/storage.js";

// Localization system. All visible strings resolve through t(key) so there is
// no hardcoded UI text. Russian is the default (the primary audience) and
// English is the fallback when a key is missing. The selected language is
// persisted, and a host platform can supply the interface language at boot.

const RESOURCES = { en, ru };
export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ru", label: "Русский" },
];
// Russian is the default: the game ships primarily to Yandex Games, whose
// audience is Russian-speaking. English remains the fallback for missing keys.
const DEFAULT_LANGUAGE = "ru";
const FALLBACK_LANGUAGE = "en";
// Set once at boot from the host platform's interface language (see
// platform/yandex.js), and used only when the player has no stored preference.
let platformLanguage = null;
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
  if (value === undefined) value = resolveKey(RESOURCES[FALLBACK_LANGUAGE], key);
  if (value === undefined) return key;
  return interpolate(value, vars);
}

export function setPlatformLanguage(language) {
  const code = typeof language === "string" ? language.toLowerCase().slice(0, 2) : null;
  platformLanguage = code && RESOURCES[code] ? code : null;
}

// An explicit choice by the player always wins; otherwise follow the platform,
// and only then the default.
function readStoredLanguage() {
  const stored = readKey(STORAGE_KEY);
  if (stored && RESOURCES[stored]) return stored;
  return platformLanguage ?? DEFAULT_LANGUAGE;
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(readStoredLanguage);

  useEffect(() => {
    writeKey(STORAGE_KEY, language);
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
