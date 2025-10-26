import { useContext } from "react";
import { TranslationContext } from "@/context/TranslationContext";

export type Language = "en" | "ar" | "ur";

// Use the English locale solely for type inference. This import is erased at build
// time and does not include the JSON in the bundle.
import type en from "@/locales/en.json";
export type Translations = typeof en;

const localeCache: Partial<Record<Language, Translations>> = {};

export async function loadLocale(lang: Language): Promise<Translations> {
  if (localeCache[lang]) {
    return localeCache[lang]!;
  }
  const module = await import(`@/locales/${lang}.json`);
  const messages = module.default as Translations;
  localeCache[lang] = messages;
  return messages;
}

export const useTranslation = () => {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error("useTranslation must be used within a TranslationProvider");
  }
  return context;
};

// Safely interpolate placeholders in translation strings.
// Supports both Handlebars-style `{{key}}` and simple `{key}` tokens.
export function interpolate(
  template: string | null | undefined,
  params: Record<string, string | number> = {}
): string {
  let result = template ?? "";
  for (const [key, value] of Object.entries(params)) {
    const v = String(value);
    // Replace all occurrences of both token styles
    result = result
      .replaceAll(`{{${key}}}` as string, v)
      .replaceAll(`{${key}}` as string, v);
  }
  return result;
}

// Remove this function as we now use the currency system
// export const formatCurrency = (amount: string | number, language: Language = 'en') => {
//   const num = typeof amount === 'string' ? parseFloat(amount) : amount;
//
//   if (language === 'ar') {
//     return `${num.toFixed(3)} د.ك`; // Arabic KWD
//   } else if (language === 'ur') {
//     return `${num.toFixed(3)} کویتی دینار`; // Urdu KWD
//   } else {
//     return `${num.toFixed(3)} KWD`; // English KWD
//   }
// };
