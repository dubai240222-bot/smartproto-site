/**
 * SP-A-097F1 / SP-A-099 — locale dictionary for public chrome (RU / EN / TR).
 * RU remains the content-canonical / unprefixed locale (factory writes RU first).
 * Public switcher / nav list order is EN → RU → TR (presentation only).
 * No heavy i18n framework.
 */

export type AppLocale = 'ru' | 'en' | 'tr';
export type LocalizationLanguage = 'en' | 'tr';
export type TranslationStatus = 'draft' | 'qa' | 'published' | 'rejected';

export const LOCALIZATION_LANGUAGES: LocalizationLanguage[] = ['en', 'tr'];

/** Switcher / UI list order — not URL canonical order. */
export const APP_LOCALE_UI_ORDER: AppLocale[] = ['en', 'ru', 'tr'];

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

export function localeScoutPath(locale: AppLocale): string {
  if (locale === 'ru') return '/scout';
  return `/${locale}/scout`;
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
  homeRailTitle: string;
  homeGridTitle: string;
  homeQuickTitle: string;
  homePastTitle: string;
  homeAllLink: string;
  homeArchiveLink: string;
  homePastPagerLabel: string;
  homeCategoryLabel: string;
  homeCategoryCount: string;
  localizationUnavailable: string;
  footerEditorial: string;
  footerScout: string;
  footerRights: string;
  siteDescription: string;
  siteTitle: string;
  scoutTitle: string;
  scoutIntro: string;
  scoutUrlLabel: string;
  scoutWhyLabel: string;
  scoutWhyPlaceholder: string;
  scoutNameLabel: string;
  scoutEmailLabel: string;
  scoutSubmit: string;
  scoutSubmitting: string;
  scoutFootnote: string;
  scoutDoneNote: string;
  scoutSendAnother: string;
  scoutErrorNetwork: string;
  scoutDoneMessage: string;
  archivePageTitle: string;
  archivePageCount: string;
};

export const LOCALE_UI: Record<AppLocale, LocaleUi> = {
  ru: {
    htmlLang: 'ru',
    ogLocale: 'ru_RU',
    tagline: 'Увидеть завтра до того, как оно станет обычным.',
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
    homeRailTitle: 'Новинки технологий',
    homeGridTitle: 'Лента',
    homeQuickTitle: 'Коротко',
    homePastTitle: 'Лента новостей',
    homeAllLink: 'Все →',
    homeArchiveLink: 'Архив →',
    homePastPagerLabel: 'Прошлые новости',
    homeCategoryLabel: 'Рубрика',
    homeCategoryCount: 'материалов',
    localizationUnavailable: 'Перевод недоступен',
    footerEditorial: 'Редакция и сотрудничество',
    footerScout: 'Прислать находку → /scout',
    footerRights: 'Все права защищены.',
    siteDescription:
      'SmartProto — интернет-издание о ранних технологиях, прототипах, инженерных решениях и научных открытиях.',
    siteTitle: 'SmartProto — Цифровая газета о технологиях',
    scoutTitle: 'Нашли интересную технологию?',
    scoutIntro:
      'Пришлите ссылку — редакция SmartProto проверит её и, если тема подходит, подготовит материал. Вы не публикуете статью: только передаёте находку «живому» редакционному конвейеру.',
    scoutUrlLabel: 'URL',
    scoutWhyLabel: 'Почему это интересно?',
    scoutWhyPlaceholder: 'Коротко: что нового для человека / почему стоит разобрать',
    scoutNameLabel: 'Имя / псевдоним',
    scoutEmailLabel: 'Email',
    scoutSubmit: 'Отправить в редакцию',
    scoutSubmitting: 'Отправляем…',
    scoutFootnote:
      'Находка проходит обычную проверку редакции (безопасность, дедуп, Scout, Editor, фото). Прямой publish недоступен. Email не публикуется.',
    scoutDoneNote: 'Публикация не гарантируется.',
    scoutSendAnother: 'Прислать ещё одну ссылку',
    scoutErrorNetwork: 'Сеть недоступна. Попробуйте ещё раз.',
    scoutDoneMessage: 'Спасибо. Находка передана в редакцию SmartProto.',
    archivePageTitle: 'Архив новостей',
    archivePageCount: 'материалов',
  },
  en: {
    htmlLang: 'en',
    ogLocale: 'en_US',
    tagline: 'See tomorrow before it becomes ordinary.',
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
    homeRailTitle: 'Tech highlights',
    homeGridTitle: 'Feed',
    homeQuickTitle: 'Brief',
    homePastTitle: 'News feed',
    homeAllLink: 'All →',
    homeArchiveLink: 'Archive →',
    homePastPagerLabel: 'Past stories',
    homeCategoryLabel: 'Section',
    homeCategoryCount: 'stories',
    localizationUnavailable: 'Translation unavailable',
    footerEditorial: 'Editorial & collaboration',
    footerScout: 'Tip a find → /scout',
    footerRights: 'All rights reserved.',
    siteDescription:
      'SmartProto covers early technology, prototypes, engineering, and scientific discoveries.',
    siteTitle: 'SmartProto — Technology newspaper',
    scoutTitle: 'Found an interesting technology?',
    scoutIntro:
      'Send a link — the SmartProto editorial team will review it and, if the topic fits, prepare a story. You are not publishing an article: only passing the find to a live editorial pipeline.',
    scoutUrlLabel: 'URL',
    scoutWhyLabel: 'Why is this interesting?',
    scoutWhyPlaceholder: 'Briefly: what is new for people / why it is worth covering',
    scoutNameLabel: 'Name / alias',
    scoutEmailLabel: 'Email',
    scoutSubmit: 'Send to editorial',
    scoutSubmitting: 'Sending…',
    scoutFootnote:
      'Finds go through the usual editorial checks (safety, dedupe, Scout, Editor, photos). Direct publish is not available. Email is not published.',
    scoutDoneNote: 'Publication is not guaranteed.',
    scoutSendAnother: 'Submit another link',
    scoutErrorNetwork: 'Network unavailable. Please try again.',
    scoutDoneMessage: 'Thank you. Your find was sent to the SmartProto editorial team.',
    archivePageTitle: 'News archive',
    archivePageCount: 'stories',
  },
  tr: {
    htmlLang: 'tr',
    ogLocale: 'tr_TR',
    tagline: 'Yarını sıradanlaşmadan önce gör.',
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
    homeRailTitle: 'Teknoloji öne çıkanlar',
    homeGridTitle: 'Akış',
    homeQuickTitle: 'Kısa',
    homePastTitle: 'Haber akışı',
    homeAllLink: 'Tümü →',
    homeArchiveLink: 'Arşiv →',
    homePastPagerLabel: 'Eski yazılar',
    homeCategoryLabel: 'Bölüm',
    homeCategoryCount: 'yazı',
    localizationUnavailable: 'Çeviri yok',
    footerEditorial: 'Editöryel ve iş birliği',
    footerScout: 'Bulgu gönder → /scout',
    footerRights: 'Tüm hakları saklıdır.',
    siteDescription:
      'SmartProto; erken teknoloji, prototipler, mühendislik ve bilimsel keşifler hakkında yayın yapar.',
    siteTitle: 'SmartProto — Teknoloji gazetesi',
    scoutTitle: 'İlginç bir teknoloji mi buldunuz?',
    scoutIntro:
      'Bir bağlantı gönderin — SmartProto editoryal ekibi inceler; konu uygunsa haber hazırlanır. Makaleyi siz yayımlamazsınız: bulguyu canlı editoryal hatta iletirsiniz.',
    scoutUrlLabel: 'URL',
    scoutWhyLabel: 'Neden ilginç?',
    scoutWhyPlaceholder: 'Kısaca: insanlar için ne yenilik / neden ele alınmalı',
    scoutNameLabel: 'Ad / takma ad',
    scoutEmailLabel: 'E-posta',
    scoutSubmit: 'Editoryale gönder',
    scoutSubmitting: 'Gönderiliyor…',
    scoutFootnote:
      'Bulgular olağan editoryal kontrolden geçer (güvenlik, dedup, Scout, Editor, foto). Doğrudan yayın yok. E-posta yayımlanmaz.',
    scoutDoneNote: 'Yayın garanti edilmez.',
    scoutSendAnother: 'Başka bir bağlantı gönder',
    scoutErrorNetwork: 'Ağ kullanılamıyor. Tekrar deneyin.',
    scoutDoneMessage: 'Teşekkürler. Bulgunuz SmartProto editoryal ekibine iletildi.',
    archivePageTitle: 'Haber arşivi',
    archivePageCount: 'yazı',
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
