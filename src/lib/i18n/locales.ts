/**
 * SP-A-097F1 — locale maps for additive EN/TR surfaces.
 * RU remains the default unprefixed locale.
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

/** Minimal chrome copy for route skeleton (not full site i18n). */
export type LocaleUi = {
  htmlLang: string;
  ogLocale: string;
  tagline: string;
  searchPlaceholder: string;
  searchEmpty: string;
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
  emptyHome: string;
  emptyCategory: string;
  localizationUnavailable: string;
  footerEditorial: string;
  footerScout: string;
  footerRights: string;
  siteDescription: string;
};

export const LOCALE_UI: Record<AppLocale, LocaleUi> = {
  ru: {
    htmlLang: 'ru',
    ogLocale: 'ru_RU',
    tagline: 'Технологии раньше, чем они станут мейнстримом',
    searchPlaceholder: 'Поиск по SmartProto',
    searchEmpty: 'Ничего не найдено',
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
    emptyHome: 'Пока нет материалов.',
    emptyCategory: 'В этой рубрике пока нет материалов.',
    localizationUnavailable: 'Перевод недоступен',
    footerEditorial: 'Редакция и сотрудничество',
    footerScout: 'Прислать находку → /scout',
    footerRights: 'Все права защищены.',
    siteDescription:
      'SmartProto — интернет-издание о ранних технологиях, прототипах, инженерных решениях и научных открытиях.',
  },
  en: {
    htmlLang: 'en',
    ogLocale: 'en_US',
    tagline: 'Technology before it becomes mainstream',
    searchPlaceholder: 'Search SmartProto',
    searchEmpty: 'No results',
    navHome: 'Home',
    navNews: 'News',
    navArchive: 'Archive',
    navScout: 'Tip a find',
    backHome: 'Back to home',
    contents: 'Contents',
    category: 'Category',
    sources: 'Sources & corroboration',
    sourceLabel: 'Source',
    originalPublication: 'Original publication',
    related: 'Related reading',
    readTime: 'min',
    emptyHome: 'No published English stories yet.',
    emptyCategory: 'No stories in this section yet.',
    localizationUnavailable: 'Translation unavailable',
    footerEditorial: 'Editorial & collaboration',
    footerScout: 'Tip a find → /scout',
    footerRights: 'All rights reserved.',
    siteDescription:
      'SmartProto covers early technology, prototypes, engineering, and scientific discoveries.',
  },
  tr: {
    htmlLang: 'tr',
    ogLocale: 'tr_TR',
    tagline: 'Teknoloji ana akım olmadan önce',
    searchPlaceholder: 'SmartProto’da ara',
    searchEmpty: 'Sonuç yok',
    navHome: 'Ana sayfa',
    navNews: 'Haberler',
    navArchive: 'Arşiv',
    navScout: 'Bulgu gönder',
    backHome: 'Ana sayfaya',
    contents: 'İçindekiler',
    category: 'Kategori',
    sources: 'Kaynaklar ve doğrulamalar',
    sourceLabel: 'Kaynak',
    originalPublication: 'Orijinal yayın',
    related: 'İlgili yazılar',
    readTime: 'dk',
    emptyHome: 'Henüz yayınlanmış Türkçe içerik yok.',
    emptyCategory: 'Bu bölümde henüz yazı yok.',
    localizationUnavailable: 'Çeviri yok',
    footerEditorial: 'Editöryel ve iş birliği',
    footerScout: 'Bulgu gönder → /scout',
    footerRights: 'Tüm hakları saklıdır.',
    siteDescription:
      'SmartProto; erken teknoloji, prototipler, mühendislik ve bilimsel keşifler hakkında yayın yapar.',
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
    Колонка: 'Köşe',
    Мнение: 'Görüş',
    Обзор: 'İnceleme',
  },
};

export function localizeCategoryLabel(category: string, locale: AppLocale): string {
  if (locale === 'ru') return category;
  return CATEGORY_LABELS[locale][category] || category;
}
