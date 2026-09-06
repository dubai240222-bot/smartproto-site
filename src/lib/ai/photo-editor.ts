/**
 * SP-A-066c — Photo Editor desk identity for the AI newsroom.
 * Selection logic lives in collectors/photo-scout.ts (`editPhotoSelection`);
 * this module documents the role and exposes desk metadata for logs/UI.
 */
export const PHOTO_EDITOR_DESK = {
  id: 'mira-soloveva',
  name: 'Мира Соловьёва',
  desk: 'Photo desk',
  agentId: 'photo-editor',
  mandate: [
    'Реальное фото продукта / робота / демо важнее логотипа.',
    'Пустая brand-иллюстрация = NO IMAGE.',
    'Wrong image хуже, чем отсутствие фото.',
  ],
} as const;
