/**
 * SP-A-097F1 / SP-A-099 — locale dictionary for public chrome (RU / EN / TR).
 * RU remains the default unprefixed locale. No heavy i18n framework.
 */

export type AppLocale = 'ru' | 'en' | 'tr';
export type LocalizationLanguage = 'en' | 'tr';
export type TranslationStatus = 'draft' | 'qa' | 'published' | 'rejected';

export const LOCALIZATION_LANGUAGES: LocalizationLanguage[] = ['en', 'tr'];

export function isAppLocale(v: string): v is AppLocale {
  return v === 'ru' || v === 'en' || v === 'tr';
}

export function localeHomePath(locale: AppLocale): string {
  if (locale === 'ru') return '/';
  return `/${locale}`;
}

export function localeArticlePath(locale: AppLocale, slug: string): string {
  if (locale === 'ru') return `/articles/${slug}`;
  return `/${locale}/articles/${slug}`;
}

const DATE_LOCALES: Record<AppLocale, string> = {
  ru: 'ru-RU',
  en: 'en-US',
  tr: 'tr-TR',
};

/** Public chrome copy — single dictionary per locale. */
export type LocaleUi = {
  htmlLang: string;
  ogLocale: string;
  tagline: string;
  searchPlaceholder: string;
  searchEmpty: string;
  searchResults: string;
  navHome: string;
  navNews: string;
  navArchive: string;
  navScout: string;
  backHome: string;
  contents: string;
  category: string;
  sources: string;
  sourceLabel: string;
  originalPublication: string;
  related: string;
  readTime: string;
  authorLabel: string;
  homeFeed: string;
  emptyHome: string;
  emptyCategory: string;
  localizationUnavailable: string;
  footerEditorial: string;
  footerScout: string;
  footerRights: string;
  siteDescription: string;
  siteTitle: string;
};

export const LOCALE_UI: Record<AppLocale, LocaleUi> = {
  ru: {
    htmlLang: 'ru',
    ogLocale: 'ru_RU',
    tagline: 'Технологии раньше, чем они станут мейнстримом',
    searchPlaceholder: 'Поиск по SmartProto',
    searchEmpty: 'Ничего не найдено',
    searchResults: 'Результаты',
    navHome: 'Главная',
    navNews: 'Новости',
    navArchive: 'Архив',
    navScout: 'Прислать находку',
    backHome: 'На главную',
    contents: 'Содержание',
    category: 'Категория',
    sources: 'Источники и подтверждения',
    sourceLabel: 'Источник',
    originalPublication: 'Оригинальная публикация',
    related: 'Читайте также',
    readTime: 'мин',
    authorLabel: 'Автор',
    homeFeed: 'Лента',
    emptyHome: 'Пока нет материалов.',
    emptyCategory: 'В этой рубрике пока нет материалов.',
    localizationUnavailable: 'Перевод недоступен',
    footerEditorial: 'Редакция и сотрудничество',
    footerScout: 'Прислать находку → /scout',
    footerRights: 'Все права защищены.',
    siteDescription:
      'SmartProto — интернет-издание о ранних технологиях, прототипах, инженерных решениях и научных открытиях.',
    siteTitle: 'SmartProto — Цифровая газета о технологиях',
  },
  en: {
    htmlLang: 'en',
    ogLocale: 'en_US',
    tagline: 'Technology before it becomes mainstream',
    searchPlaceholder: 'Search SmartProto',
    searchEmpty: 'No results',
    searchResults: 'Results',
    navHome: 'Home',
    navNews: 'News',
    navArchive: 'Archive',
    navScout: 'Tip a find',
    backHome: 'Back to home',
    contents: 'Contents',
    category: 'Category',
    sources: 'Sources and verification',
    sourceLabel: 'Source',
    originalPublication: 'Original publication',
    related: 'Related reading',
    readTime: 'min',
    authorLabel: 'Author',
    homeFeed: 'Latest',
    emptyHome: 'No published English stories yet.',
    emptyCategory: 'No stories in this section yet.',
    localizationUnavailable: 'Translation unavailable',
    footerEditorial: 'Editorial & collaboration',
    footerScout: 'Tip a find → /scout',
    footerRights: 'All rights reserved.',
    siteDescription:
      'SmartProto covers early technology, prototypes, engineering, and scientific discoveries.',
    siteTitle: 'SmartProto — Technology newspaper',
  },
  tr: {
    htmlLang: 'tr',
    ogLocale: 'tr_TR',
    tagline: 'Teknoloji ana akım olmadan önce',
    searchPlaceholder: 'SmartProto’da ara',
    searchEmpty: 'Sonuç yok',
    searchResults: 'Sonuçlar',
    navHome: 'Ana sayfa',
    navNews: 'Haberler',
    navArchive: 'Arşiv',
    navScout: 'Bulgu gönder',
    backHome: 'Ana sayfaya dön',
    contents: 'İçindekiler',
    category: 'Kategori',
    sources: 'Kaynaklar ve doğrulama',
    sourceLabel: 'Kaynak',
    originalPublication: 'Orijinal yayın',
    related: 'İlgili yazılar',
    readTime: 'dk',
    authorLabel: 'Yazar',
    homeFeed: 'Son yazılar',
    emptyHome: 'Henüz yayınlanmış Türkçe içerik yok.',
    emptyCategory: 'Bu bölümde henüz yazı yok.',
    localizationUnavailable: 'Çeviri yok',
    footerEditorial: 'Editöryel ve iş birliği',
    footerScout: 'Bulgu gönder → /scout',
    footerRights: 'Tüm hakları saklıdır.',
    siteDescription:
      'SmartProto; erken teknoloji, prototipler, mühendislik ve bilimsel keşifler hakkında yayın yapar.',
    siteTitle: 'SmartProto — Teknoloji gazetesi',
  },
};

/** Shared category identity → locale display label (no new editorial categories). */
const CATEGORY_LABELS: Record<AppLocale, Record<string, string>> = {
  ru: {},
  en: {
    Гаджеты: 'Gadgets',
    Технологии: 'Technology',
    AI: 'AI',
    ИИ: 'AI',
    Роботы: 'Robots',
    Наука: 'Science',
    'Open Source': 'Open Source',
    Приложения: 'Apps',
    Здоровье: 'Health',
    'Умный дом': 'Smart home',
    Игры: 'Games',
    Мобильность: 'Mobility',
    Энергия: 'Energy',
    Бизнес: 'Business',
    'Авторская статья': 'Author feature',
    Колонка: 'Column',
    Мнение: 'Opinion',
    Обзор: 'Review',
    'Обзор / мнение': 'Review / opinion',
  },
  tr: {
    Гаджеты: 'Gadgetler',
    Технологии: 'Teknoloji',
    AI: 'YZ',
    ИИ: 'YZ',
    Роботы: 'Robotlar',
    Наука: 'Bilim',
    'Open Source': 'Açık kaynak',
    Приложения: 'Uygulamalar',
    Здоровье: 'Sağlık',
    'Умный дом': 'Akıllı ev',
    Игры: 'Oyunlar',
    Мобильность: 'Hareketlilik',
    Энергия: 'Enerji',
    Бизнес: 'İş',
    'Авторская статья': 'Yazar yazısı',
    Колонка: 'Köşe yazısı',
    Мнение: 'Görüş',
    Обзор: 'İnceleme',
    'Обзор / мнение': 'İnceleme / görüş',
  },
};

export function localizeCategoryLabel(category: string, locale: AppLocale): string {
  if (locale === 'ru') return category;
  return CATEGORY_LABELS[locale][category] || category;
}

export function formatPublishedAtLocale(value: string, locale: AppLocale = 'ru'): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const loc = DATE_LOCALES[locale];
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (locale === 'ru') {
    if (diffHours >= 0 && diffHours < 24) {
      return new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit' }).format(date);
    }
    if (diffHours >= 0 && diffHours < 48) {
      return `вчера, ${new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit' }).format(date)}`;
    }
  } else if (locale === 'en') {
    if (diffHours >= 0 && diffHours < 24) {
      return new Intl.DateTimeFormat(loc, { hour: 'numeric', minute: '2-digit' }).format(date);
    }
    if (diffHours >= 0 && diffHours < 48) {
      return `yesterday, ${new Intl.DateTimeFormat(loc, { hour: 'numeric', minute: '2-digit' }).format(date)}`;
    }
  } else {
    if (diffHours >= 0 && diffHours < 24) {
      return new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit' }).format(date);
    }
    if (diffHours >= 0 && diffHours < 48) {
      return `dün, ${new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit' }).format(date)}`;
    }
  }

  return new Intl.DateTimeFormat(loc, {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  }).format(date);
}

/** Reformat stored read-time ("2 мин") into locale unit without inventing duration. */
export function localizeReadTime(raw: string | undefined, locale: AppLocale): string | null {
  if (!raw?.trim()) return null;
  const m = raw.match(/(\d+)/);
  if (!m) return raw;
  return `${m[1]} ${LOCALE_UI[locale].readTime}`;
}

export function formatBylineLocale(
  authorName: string,
  timeLabel: string,
  locale: AppLocale,
): string {
  return `${LOCALE_UI[locale].authorLabel}: ${authorName} · ${timeLabel}`;
}
