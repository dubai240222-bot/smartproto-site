# SmartProto - Итоги проекта
## Что сделано
- ✅ Установлен Node.js 24.18.0
- ✅ Создан проект Next.js 16 с TypeScript и Tailwind CSS
- ✅ Настроен тёмный дизайн с циановыми акцентами
- ✅ Создана база данных статей (src/data/articles.ts)
- ✅ Добавлены страницы статей (/articles/[slug])
- ✅ Создана страница "Все материалы" (/all)
- ✅ Добавлен парсер Hacker News (/api/feed)
- ✅ Добавлены SEO-метатеги, robots.txt, sitemap.xml
- ✅ Развёрнут на Cloudflare Pages
- ✅ Подключён домен smartproto.net с SSL
## Ссылки
- Локальная разработка: http://localhost:3000
- Cloudflare Pages: https://smartproto-site.pages.dev
- Основной домен: https://smartproto.net
## Как работать с проектом
### Добавить новую статью
1. Открой src/data/articles.ts
2. Добавь новый объект в массив articles
3. Запусти деплой: npx wrangler pages deploy .next --project-name=smartproto-site
### Запустить локально
```bash
npm run dev
