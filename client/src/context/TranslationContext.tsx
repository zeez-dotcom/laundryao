import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { loadLocale, type Language, type Translations } from "@/lib/i18n";
import enMessages from "@/locales/en.json";

interface TranslationContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const TranslationContext = createContext<TranslationContextValue | undefined>(undefined);

export function TranslationProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    return (localStorage.getItem("language") as Language) || "en";
  });
  const [locales, setLocales] = useState<Partial<Record<Language, Translations>>>({ en: enMessages as Translations });

  useEffect(() => {
    localStorage.setItem("language", language);
    document.dir = language === "ar" || language === "ur" ? "rtl" : "ltr";
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (!locales[language]) {
      loadLocale(language).then((l) => {
        setLocales((prev) => ({ ...prev, [language]: l }));
      });
    }
  }, [language, locales]);

  // Merge with English defaults so missing keys gracefully fall back
  const current = locales[language];
  const t = (current
    ? ({ ...(enMessages as Translations), ...current } as Translations)
    : (enMessages as Translations));

  return (
    <TranslationContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslationContext() {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error("useTranslation must be used within a TranslationProvider");
  }
  return context;
}

export { TranslationContext };
