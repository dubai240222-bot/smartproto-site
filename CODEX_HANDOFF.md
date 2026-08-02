# CODEX_HANDOFF — SmartProto

**ID задачи:** SP-A-031-R1 (ранее SP-A-027 handoff)  
**Дата:** 2026-08-02  
**Источник:** фактическое состояние репо + выводы SP-A-026-R1 / решение владельца SP-A-026-D1 / автономия SP-A-031  
**Назначение:** полная передача проекта агенту Codex + статус промежуточной автономии.  
**Язык:** русский (ключевые идентификаторы — как в коде).

---

## 0. Автономия SP-A-031-R1 (текущий рабочий режим)

**Цель владельца:** 100% автономная публикация без команд Cursor каждые 10 минут.

**Что сделано (interim, без Postgres):**

| Артефакт | Путь |
|---|---|
| GitHub Actions cron | `.github/workflows/newsroom-cron.yml` |
| Один цикл публикации | `scripts/run-newsroom-tick.ts` → `npm run newsroom:tick` |

**Как работает:**

1. GHA schedule `*/10 * * * *` (+ `workflow_dispatch` вручную).
2. Если секрет `SMARTPROTO_FACTORY_ENABLED` ≠ `true` → workflow тихо выходит (factory OFF).
3. Иначе: `npm ci` → `npm run newsroom:tick` (1 кандидат: RSS → hardReject/novelty → Scout → Reviewer → Editor → `articles.json`).
4. Если изменились `articles.json` / journal / drafts → bot commit + `git push` на `main` → Vercel деплоит сайт.

**Stage B** (Vercel Cron → `/api/newsroom/tick` → Worker → Postgres) по-прежнему **PLANNED**, не блокирует interim-автономию.

### GitHub Secrets (обязательно выставить владельцу)

Repo → **Settings → Secrets and variables → Actions**:

| Secret | Значение | Зачем |
|---|---|---|
| `OPENROUTER_API_KEY` | ключ OpenRouter | Scout / Reviewer / Editor |
| `SMARTPROTO_FACTORY_ENABLED` | `true` | Включить автономию |

`GITHUB_TOKEN` выдаётся Actions автоматически (`permissions: contents: write`).

**Выключить автономию:** `SMARTPROTO_FACTORY_ENABLED=false` (или удалить секрет). Workflow продолжит тикать по cron, но AI-цикл пропускается.

**После установки secrets Cursor больше не нужен** для 10-минутных публикаций.

---

## 0b. Исторические ограничения SP-A-027 (архив)

- **Этап B (Stage B)** в рамках SP-A-027 не стартовал (Vercel Cron / Postgres / admin API).
- Handoff SP-A-027 остаётся справочным; рабочая автономия — через GHA выше (SP-A-031-R1).

---

## 1. Обзор проекта

| Поле | Значение |
|---|---|
| Название | **SmartProto** |
| Тип | Consumer-gadget медиа (умные/полезные потребительские гаджеты и товары для быта/работы) |
| Live | https://www.smartproto.net |
| Стек | Next.js 15 (App Router), React 19, TypeScript, Tailwind 4 |
| Хостинг | **Vercel** (основной прод) |
| Репо | `D:\AI-CITY\smartproto-site` (локальный путь владельца) |
| Язык сайта/статей | Русский (`lang="ru"`) |

Миссия редакции (SP-A-025): публиковать **покупаемые** устройства и товары, которые обычный человек захочет купить / предзаказать — не DevOps, не политику, не celebrity, не абстрактные исследования.

---

## 2. Текущая проблема автономии (из SP-A-026-R1)

**Сайт сейчас НЕ автономен.**

Фактическая цепочка публикации:

1. Локально (Cursor / PowerShell) запускается `npm run factory:shift` / `test:newsroom` / burst-скрипты.
2. AI пишет черновик → статья **аппендится в `src/data/articles.json`**.
3. Скрипт делает `git commit` + `git push` (обычно `origin main`).
4. Vercel подхватывает git → build → сайт читает **зашитый в билд** JSON через `src/data/articles.ts`.

| Факт в репо | Следствие |
|---|---|
| Нет `vercel.json` / Postgres; есть GHA cron (SP-A-031) | Interim-автономия через Actions → git push |
| Единственный API: `src/app/api/feed/route.ts` (Hacker News proxy) | Нет protected worker endpoint |
| Сайт импортирует `articles.json` на build/SSR | Vercel **не видит** локальные правки без push |
| Publisher пишет в файловую систему | На serverless Vercel нельзя надёжно «дописать файл» в прод |
| `SMARTPROTO_FACTORY_ENABLED` только в env | Нет admin ON/OFF без правки env |
| Источники factory: Hackaday / Ars / TechCrunch (+ HN в newsroom) | Китайских площадок нет |
| `src/lib/ai/pipeline.ts` — stub | Оркестрации production нет |

**Итог SP-A-026-R1:**

- статьи хранятся в локальном `src/data/articles.json`;
- публикация идёт через **git push → Vercel**;
- **Cron, worker API и production-БД отсутствуют**;
- без живого оператора и git push на `www.smartproto.net` новые статьи сами не появляются.

---

## 3. Рекомендуемая будущая архитектура (PLANNED / NOT STARTED)

```
Vercel Cron
  → защищённый /api/newsroom/tick  (Bearer CRON_SECRET)
      → Newsroom Worker
           [опц.] China Collector → Qwen Analyst → dossier
           → Scout → Reviewer → Editor → Publisher
      → Postgres (статьи + journal + run stats)
  → сайт читает статьи из DB
```

### Статус этапов (после SP-A-026-D1)

| Этап | Содержание | Статус |
|---|---|---|
| **A** | Audit + план (SP-A-026-R1) | DONE |
| **B** | Cron tick + env gate + run stats | **PLANNED / NOT STARTED** — владелец **запретил** начинать сейчас |
| **C** | Postgres schema + миграция seed из JSON | PLANNED |
| **D** | Publisher → DB; сайт читает DB (+ fallback JSON) | PLANNED |
| **E** | Admin factory ON/OFF API (secret) | PLANNED |
| **F** | Лимиты автономного режима | PLANNED |
| **G–H** | China dossier + Qwen + allowlisted collector | PLANNED |
| **I** | Soft-launch ops | PLANNED |

`articles.json` в будущем — **миграционный seed / fallback**, не production write-store.

Предпочтительный стек (из SP-A-026-R1): Vercel Cron + route handlers, Vercel Postgres/Neon, KV или DB-row для runtime-рубильника, существующий OpenRouter клиент.

---

## 4. Ключевые пути в репозитории

### Данные и типы

| Путь | Роль |
|---|---|
| `src/data/articles.json` | **Текущий write-store опубликованных статей** (append через скрипты) |
| `src/data/articles.ts` | Runtime-чтение: `import articles from './articles.json'`, фильтр removed-slugs, `getArticleBySlug` / `getAllSlugs` |
| `src/data/types.ts` | Альтернативный/legacy тип `Article` + `Draft` (status-модель) — не путать с типом в `articles.ts` |
| `src/data/removed-slugs.json` | Список slug, скрытых с сайта |
| `src/lib/removed-slugs.ts` | Фильтр `filterRemovedArticles` |
| `drafts/*.json` | Черновики newsroom/factory |
| `data/factory-journal.json` | Журнал дедупа/статусов factory |

### AI-редакция (`src/lib/ai/*`)

| Файл | Роль |
|---|---|
| `shared.ts` | OpenRouter client (`OPENROUTER_API_KEY` only), `parseJsonObject`, `clampText` |
| `scout.ts` | Разведчик: score A–E, `SCOUT_SCORE_THRESHOLD = 75` |
| `reviewer.ts` | Технический/стилевой вердикт |
| `editor.ts` | Черновик на русском + calm tone + masculine voice + `toneCheck` |
| `hard-reject.ts` | Кодовый HARD FILTER до/поверх LLM |
| `pipeline.ts` | **Stub** — «future AI pipeline orchestration» |

### Коллекторы (`src/lib/collectors/*`)

| Файл | Роль |
|---|---|
| `rss.ts` | `fetchRssFeed(feedUrl, …)` |
| `hn.ts` | Hacker News top stories |
| `image-extractor.ts` | og:image / article image |

Factory RSS-источники (`scripts/run-factory-shift.ts`):

- `https://hackaday.com/feed/`
- `https://feeds.arstechnica.com/arstechnica/index`
- `https://techcrunch.com/feed/`

### Скрипты

| Скрипт | npm | Назначение |
|---|---|---|
| `scripts/run-newsroom.ts` | `test:newsroom` | Тест пайплайна Scout→Reviewer→Editor→draft (без публикации при обычном тесте) |
| `scripts/run-newsroom-tick.ts` | `newsroom:tick` | **Один** цикл: RSS→фильтры→Scout→Review→Editor→publish в `articles.json` (для GHA cron) |
| `scripts/publish-latest.ts` | `publish:latest` | Берёт latest draft → пишет в `articles.json` |
| `scripts/run-factory-shift.ts` | `factory:shift` | Цикл RSS → Scout → Review → Editor → publish (+ git) |
| `scripts/polish-published.ts` | `polish:published` | Полировка опубликованных |
| `scripts/inspect-polish-articles.ts` | `polish:inspect` / `inspect:articles` | Инспекция/полировка |
| `scripts/audit-published-tone.ts` | `audit:tone` | Аудит тона KEEP/REWRITE/REMOVE |
| `scripts/run-gadgets-loop.ts` | `gadgets:loop` | Цикл гаджетов (локальный) |
| `scripts/run-burst-hour.ts` | *(нет npm alias)* | Burst-режим публикации |
| `scripts/moderate-drafts.ts` | `moderate` | Модерация черновиков |

Также есть временные `scripts/tmp-*.js` и batch-скрипты — не часть production architecture.

### API на сайте сейчас

- `src/app/api/feed/route.ts` — только HN live-signal proxy.
- **Нет** `/api/newsroom/tick`, **нет** admin API.

### Env / ключи (факт кода)

| Переменная | Статус |
|---|---|
| `OPENROUTER_API_KEY` | **Единственный обязательный AI-ключ** (`shared.ts`, newsroom) |
| `SMARTPROTO_FACTORY_ENABLED` | Default **false**; factory/publish работают только при `"true"` (или `--force` где поддержано) |
| `OPENROUTER_SCOUT_MODEL` | Default `deepseek/deepseek-v4-flash:latest` |
| `OPENROUTER_REVIEW_MODEL` | Default `google/gemini-2.5-flash-lite` |
| `OPENROUTER_EDITOR_MODEL` | Default `google/gemini-2.5-flash-lite` |
| `GEMINI_API_KEY` / прямой Gemini SDK path | **Удалён ранее** — в коде AI-клиента не используется; пакет `@google/generative-ai` может оставаться в `package.json` как неиспользуемая зависимость |

Загрузка env в скриптах: сначала `.env.local` (`override: true`), затем `.env` как fallback.

---

## 5. Редакционные правила (сводка)

### 5.1 Что публикуем

- **Только buyable / preorder** полезные гаджеты и товары для быта/работы.
- Без конкретного продукта → всегда reject (`hard-reject.ts` + prompts).
- Жёсткий reject: политика, celebrities, певцы, книги/писатели, кино, wildlife/музеи, лабораторные прототипы без buy path, Docker/HN-meta/DevOps, shopping guide без одного товара, OEM без consumer SKU и т.п.

### 5.2 Тон (SP-A-025-U1)

Спокойный компетентный редактор — **не** блогер/продавец/развлекательный ведущий.

Запрещены (prompt + кодовый `BANNED_CLICHE_RE` в `editor.ts`):

- «вау» / wow / guys / «ребята» / «друзья» / «посмотрите»;
- «дожили», «вчера фантастика», pathos-клише;
- «это бомба», невероятный/революционный/потрясающий/гениальный;
- «убийца iPhone», «изменит мир», «перевернёт рынок», «вы обязаны», «мы в восторге» и клоны.

Нужно ясно объяснять: что за продукт, задача, отличие, аудитория, цена, сроки, ограничения, неизвестное. Не выдумывать спеки.

### 5.3 Голос автора

- **Только мужской** голос в русском 1-м лице (или безличное/редакционное).
- Женские формы («я пришла», «я увидела», «я решила», …) — запрещены; аудит помечает как REWRITE.

### 5.4 Scout score / threshold (как в коде)

`SCOUT_SCORE_THRESHOLD = 75` (`src/lib/ai/scout.ts`).

Формула 0–100 = сумма A–E:

| Часть | Макс | Смысл |
|---|---|---|
| A | 30 | желание купить |
| B | 20 | новизна / wow-disbelief *(скоринг; в тексте статьи wow-тон запрещён)* |
| C | 20 | практическая польза |
| D | 15 | визуальная привлекательность |
| E | 15 | коммерческий потенциал |

`interesting = true` только если `score >= 75` и есть покупаемый продукт (`productType` не `none`).  
`hardRejectTopic` может обнулить до вызова модели.

### 5.5 China / Qwen отдел

**Запланирован в SP-A-026, НЕ построен.**

Планируемая схема:

```
China Collector (allowlisted RSS/API/manual URL)
  → Qwen China Analyst (OpenRouter, zh)
  → Normalized Dossier JSON
  → hardReject + Scout → Reviewer → Editor → Publisher → DB
```

- Qwen = исследователь/переводчик/первый фильтр — **не** главный редактор и не publisher.
- **Не изобретать scrapers** для Taobao/Tmall/JD/Xiaohongshu и т.п.
- v1 China: manufacturer newsrooms + crowdfunding PR + официальные/affiliate фиды; marketplace HTML-scrape — нет.

---

## 6. npm-скрипты, которые важны

```json
"dev": "next dev",
"build": "next build",
"start": "next start",
"lint": "eslint",
"moderate": "tsx scripts/moderate-drafts.ts",
"test:newsroom": "tsx scripts/run-newsroom.ts",
"newsroom:tick": "tsx scripts/run-newsroom-tick.ts",
"factory:shift": "tsx scripts/run-factory-shift.ts",
"publish:latest": "tsx scripts/publish-latest.ts",
"polish:published": "tsx scripts/polish-published.ts",
"gadgets:loop": "tsx scripts/run-gadgets-loop.ts",
"polish:inspect": "tsx scripts/inspect-polish-articles.ts",
"inspect:articles": "tsx scripts/inspect-polish-articles.ts",
"audit:tone": "tsx scripts/audit-published-tone.ts"
```

Полезные флаги (где поддержано):

- `npm run test:newsroom -- --limit 1` — один кандидат, без публикации.
- `npm run newsroom:tick` — один автономный цикл (GHA); `--force` / `--dry-run`.
- `factory:shift` / `publish:latest`: требуют `SMARTPROTO_FACTORY_ENABLED=true` или `--force`.
- `factory:shift`: `--hours`, `--interval-min`, `--max-ai-runs`, `--max-published`, `--dry-run`, `--force`.

---

## 7. Что Codex должен делать дальше

1. **Дождаться явного разрешения владельца** на Stage B (и последующие этапы).  
   Сейчас: Stage B = **PLANNED / NOT STARTED**, старт запрещён SP-A-026-D1.
2. После разрешения — начинать с **минимального slice B**:  
   `vercel.json` cron → protected `/api/newsroom/tick` → factory gate → run stats (без China, без смены дизайна).
3. Затем C→D (Postgres + чтение сайта из DB), E (admin switch), F (лимиты), G–H (China/Qwen allowlisted).
4. **Не изобретать scrapers** для Taobao / Tmall / JD / Xiaohongshu / Xianyu и т.п.; только официальные/allowlisted каналы или ручной URL→dossier.
5. Не менять модели Editor/Reviewer/Scout без разрешения.
6. Сохранять редакционные правила SP-A-025 / SP-A-025-U1 (buyable + calm + masculine).
7. Локальные npm-скрипты оставить для отладки; production-двигатель — серверный cron, не Cursor.

Ориентир лимитов из SP-A-026 (когда автономный режим включат): ≤12 AI-кандидатов/сутки, ≤5 публикаций, ≤2 china, 1 материал/цикл, 3 errors → STOP.

---

## 8. Подтверждение границ SP-A-027

В рамках этой задачи:

| Действие | Статус |
|---|---|
| Создан/обновлён только `CODEX_HANDOFF.md` | Да |
| Stage B implementation | **Не начат** |
| Vercel Cron | **Не создан** |
| `/api/newsroom/tick` | **Не создан** |
| Postgres / worker / admin API | **Не созданы** |
| Новые env-переменные | **Не добавлены** |
| Deployment | **Не выполнялся** |
| Код SP-A-026 | **Не реализован** |

---

## 9. Краткая шпаргалка для следующего агента

```
Interim (SP-A-031): GHA cron */10 → newsroom:tick → articles.json → git push → Vercel
Цель Stage B:       Vercel Cron → /api/newsroom/tick → Worker → Postgres → сайт из DB
Ключ:               OPENROUTER_API_KEY (GitHub Secret)
Рубильник:          SMARTPROTO_FACTORY_ENABLED=true чтобы ON; false/пусто = OFF
```

---

**Подпись документа:** Cursor (SP-A-031-R1)  
**Связанные ID:** SP-A-025, SP-A-025-U1, SP-A-026-R1, SP-A-026-D1, SP-A-027, SP-A-030-U1, SP-A-031-R1
