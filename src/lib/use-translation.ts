// Custom hook for using translations
import { useLanguageStore, Language } from './language-store';
import { t as translate, formatCurrency, formatDate, formatMonthYear } from './translations';

export function useTranslation() {
  const language = useLanguageStore((state) => state.language);
  
  const t = (key: Parameters<typeof translate>[0]) => translate(key, language);
  
  const tc = (amount: number | string | null | undefined) => formatCurrency(amount, language);
  
  const td = (date: Date | string | null | undefined) => formatDate(date, language);
  
  const tm = (date: Date | string | null | undefined) => formatMonthYear(date, language);
  
  return {
    language,
    t,
    tc, // translate currency
    td, // translate date
    tm, // translate month/year
    isDanish: language === 'da',
    isEnglish: language === 'en',
  };
}
