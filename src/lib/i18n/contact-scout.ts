import type { AppLocale } from '@/lib/i18n/locales';

export type ContactScoutCopy = {
  contactTitle: string;
  contactLead: string;
  contactEmailLabel: string;
  contactCopy: string;
  contactCopied: string;
  contactOpenMail: string;
  topicEditorial: string;
  topicEditorialDesc: string;
  topicDev: string;
  topicDevDesc: string;
  topicPartner: string;
  topicPartnerDesc: string;
  topicAds: string;
  topicAdsDesc: string;
  topicTip: string;
  topicTipDesc: string;
  topicTipCta: string;
  socialLater: string;
  aboutTitle: string;
  aboutBody: string;
  scoutTitle: string;
  scoutLead: string;
  scoutEmail: string;
  scoutUrl: string;
  scoutName: string;
  scoutNote: string;
  scoutContinue: string;
  scoutSendingCode: string;
  scoutCodeLabel: string;
  scoutSubmit: string;
  scoutSubmitting: string;
  scoutSuccess: string;
  scoutSuccessHint: string;
  scoutAgain: string;
  scoutEmailConfig: string;
  scoutPrivacy: string;
  footerAbout: string;
  footerContact: string;
  footerScout: string;
  backHome: string;
};

export const CONTACT_SCOUT_UI: Record<AppLocale, ContactScoutCopy> = {
  ru: {
    contactTitle: 'Связаться с редакцией',
    contactLead:
      'Пишите по редакционным вопросам, сотрудничеству и коммерческим предложениям. Для срочных находок используйте форму «Предложить новость».',
    contactEmailLabel: 'Email редакции',
    contactCopy: 'Скопировать',
    contactCopied: 'Скопировано',
    contactOpenMail: 'Написать письмо',
    topicEditorial: 'Редакционные вопросы',
    topicEditorialDesc: 'Уточнения, исправления, вопросы по материалам.',
    topicDev: 'Разработчики и стартапы',
    topicDevDesc: 'Предложить разработку, исследование или технологический продукт.',
    topicPartner: 'Партнёрство',
    topicPartnerDesc: 'Сотрудничество с компаниями, университетами и изданиями.',
    topicAds: 'Реклама и коммерция',
    topicAdsDesc: 'Деловые и рекламные предложения.',
    topicTip: 'Предложить новость',
    topicTipDesc: 'Ссылка на интересную технологическую историю — через подтверждение email.',
    topicTipCta: 'Открыть форму',
    socialLater:
      'Официальные страницы в социальных сетях появятся здесь, когда будут подтверждены.',
    aboutTitle: 'О проекте',
    aboutBody:
      'SmartProto — премиальный технологический журнал о ранних технологиях, прототипах и инженерных решениях. Материалы готовит автономная редакция; публикация остаётся под редакционным контролем.',
    scoutTitle: 'Предложить новость',
    scoutLead:
      'Пришлите ссылку и подтвердите email. Редакция рассмотрит находку; публикация не гарантируется.',
    scoutEmail: 'Email',
    scoutUrl: 'Ссылка на новость',
    scoutName: 'Имя (необязательно)',
    scoutNote: 'Почему это интересно (необязательно)',
    scoutContinue: 'Продолжить',
    scoutSendingCode: 'Отправляем код…',
    scoutCodeLabel: 'Код из письма',
    scoutSubmit: 'Отправить',
    scoutSubmitting: 'Отправляем…',
    scoutSuccess:
      'Спасибо! Ваша находка передана на рассмотрение редакции. Публикация не гарантируется.',
    scoutSuccessHint: 'Можно прислать ещё одну ссылку.',
    scoutAgain: 'Прислать ещё',
    scoutEmailConfig:
      'Подтверждение email временно недоступно. Напишите редакции напрямую через страницу контактов.',
    scoutPrivacy: 'Email не публикуется. Прямая публикация недоступна.',
    footerAbout: 'О проекте',
    footerContact: 'Контакты',
    footerScout: 'Предложить новость',
    backHome: '← SmartProto',
  },
  en: {
    contactTitle: 'Contact the Editorial Team',
    contactLead:
      'Reach us for editorial questions, partnerships, and commercial inquiries. To tip a tech story, use the verified news form.',
    contactEmailLabel: 'Editorial email',
    contactCopy: 'Copy',
    contactCopied: 'Copied',
    contactOpenMail: 'Compose email',
    topicEditorial: 'Editorial questions',
    topicEditorialDesc: 'Clarifications, corrections, and story questions.',
    topicDev: 'Developers and startups',
    topicDevDesc: 'Share a product, research, or technology worth covering.',
    topicPartner: 'Partnerships',
    topicPartnerDesc: 'Collaboration with companies, universities, and other outlets.',
    topicAds: 'Advertising and business',
    topicAdsDesc: 'Commercial and advertising proposals.',
    topicTip: 'Suggest a story',
    topicTipDesc: 'Submit a tech link after confirming your email.',
    topicTipCta: 'Open the form',
    socialLater: 'Official social channels will appear here once confirmed.',
    aboutTitle: 'About',
    aboutBody:
      'SmartProto is a premium technology magazine covering early tech, prototypes, and engineering. Stories are prepared by an autonomous newsroom and published under editorial control.',
    scoutTitle: 'Suggest a story',
    scoutLead:
      'Paste a link and confirm your email. The desk will review it; publication is not guaranteed.',
    scoutEmail: 'Email',
    scoutUrl: 'Story URL',
    scoutName: 'Name (optional)',
    scoutNote: 'Why it matters (optional)',
    scoutContinue: 'Continue',
    scoutSendingCode: 'Sending code…',
    scoutCodeLabel: 'Code from email',
    scoutSubmit: 'Submit',
    scoutSubmitting: 'Submitting…',
    scoutSuccess:
      'Thank you! Your tip was sent for editorial review. Publication is not guaranteed.',
    scoutSuccessHint: 'You can tip another link.',
    scoutAgain: 'Tip another',
    scoutEmailConfig:
      'Email verification is temporarily unavailable. Contact the desk directly via the contacts page.',
    scoutPrivacy: 'Your email is never published. Direct publishing is not available.',
    footerAbout: 'About',
    footerContact: 'Contacts',
    footerScout: 'Suggest a story',
    backHome: '← SmartProto',
  },
  tr: {
    contactTitle: 'Editör Ekibiyle İletişim',
    contactLead:
      'Editöryel sorular, iş birliği ve ticari teklifler için yazın. Haber önermek için doğrulamalı formu kullanın.',
    contactEmailLabel: 'Editöryel e-posta',
    contactCopy: 'Kopyala',
    contactCopied: 'Kopyalandı',
    contactOpenMail: 'E-posta yaz',
    topicEditorial: 'Editöryel sorular',
    topicEditorialDesc: 'Düzeltmeler, açıklamalar ve içerik soruları.',
    topicDev: 'Geliştiriciler ve girişimler',
    topicDevDesc: 'Ürün, araştırma veya teknoloji önerisi.',
    topicPartner: 'Ortaklık',
    topicPartnerDesc: 'Şirketler, üniversiteler ve diğer yayınlarla iş birliği.',
    topicAds: 'Reklam ve ticari teklifler',
    topicAdsDesc: 'İş ve reklam başvuruları.',
    topicTip: 'Haber öner',
    topicTipDesc: 'E-posta doğrulamasından sonra teknoloji bağlantısı gönderin.',
    topicTipCta: 'Formu aç',
    socialLater: 'Resmi sosyal kanallar onaylandığında burada görünecek.',
    aboutTitle: 'Proje hakkında',
    aboutBody:
      'SmartProto; erken teknoloji, prototipler ve mühendislik üzerine premium bir teknoloji dergisidir. İçerik özerk haber odasında hazırlanır ve editöryel kontrol altında yayınlanır.',
    scoutTitle: 'Haber öner',
    scoutLead:
      'Bağlantıyı yapıştırın ve e-postanızı doğrulayın. Editör ekibi inceler; yayın garantisi yoktur.',
    scoutEmail: 'E-posta',
    scoutUrl: 'Haber bağlantısı',
    scoutName: 'Ad (isteğe bağlı)',
    scoutNote: 'Neden önemli (isteğe bağlı)',
    scoutContinue: 'Devam',
    scoutSendingCode: 'Kod gönderiliyor…',
    scoutCodeLabel: 'E-postadaki kod',
    scoutSubmit: 'Gönder',
    scoutSubmitting: 'Gönderiliyor…',
    scoutSuccess:
      'Teşekkürler! Bulgunuz editör incelemesine iletildi. Yayın garantisi yoktur.',
    scoutSuccessHint: 'Başka bir bağlantı da gönderebilirsiniz.',
    scoutAgain: 'Yeniden gönder',
    scoutEmailConfig:
      'E-posta doğrulama geçici olarak kullanılamıyor. İletişim sayfasından editör ekibine yazın.',
    scoutPrivacy: 'E-postanız yayınlanmaz. Doğrudan yayın mümkün değildir.',
    footerAbout: 'Proje hakkında',
    footerContact: 'İletişim',
    footerScout: 'Haber öner',
    backHome: '← SmartProto',
  },
};
