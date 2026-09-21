import express from 'express';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEMO_MODE, resolveName } from './lib/llm.js';
import { search } from './lib/search.js';
import { alternativesFor } from './lib/safety.js';
import { describe, product, substance, SNAPSHOT, PRODUCTS, SUBSTANCES } from './lib/catalog.js';
import { monthlyCost } from './lib/pricing.js';
import { questionFor } from './lib/question.js';
import { record, top, total } from './lib/stats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Какой коммит сейчас живой. Render и Vercel подставляют это сами —
// без этого «доехал ли фикс до прода» проверяется догадками.
const COMMIT =
  process.env.RENDER_GIT_COMMIT ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GIT_COMMIT ||
  'local';

const app = express();

// Render держит приложение за прокси. Без этого req.protocol всегда 'http',
// и в og:image на https-странице уедет http-адрес — скрейперы такое отбросят.
app.set('trust proxy', true);

app.use(express.json({ limit: '64kb' }));

// Главную отдаём через обработчик, а не статикой: в og-тегах нужен абсолютный
// адрес, а домен известен только в рантайме. Скрейперы мессенджеров не исполняют
// JavaScript, поэтому подставить его на клиенте нельзя.
const PAGE = readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
app.get('/', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  res.type('html').send(PAGE.replaceAll('__BASE__', base));
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    demoMode: DEMO_MODE,
    commit: COMMIT.slice(0, 7),
    uptimeSec: Math.round(process.uptime()),
    catalog: { substances: SUBSTANCES.length, products: PRODUCTS.length, snapshot: SNAPSHOT.date },
  });
});

// FR-01. Сначала локальный поиск, и только если он не узнал название —
// один вызов модели. Порядок важен: так продукт работает при исчерпанной
// квоте бесплатного тарифа и отвечает мгновенно почти на всех вводах.
app.post('/api/search', async (req, res) => {
  const query = String(req.body?.query ?? '').trim();
  if (!query) return res.status(400).json({ error: 'Введите название препарата.' });

  const local = search(query);
  if (local.matches.length) {
    return res.json({ ...local, source: 'catalog' });
  }

  const guess = await resolveName(query);

  if (guess.status === 'ok' && product(guess.productId)) {
    return res.json({
      matches: [{ productId: guess.productId, confidence: guess.confidence ?? 0.7 }],
      needsClarification: null,
      source: guess.source,
    });
  }

  // Отказ — это результат, а не ошибка. Подбор по симптому за границей продукта.
  // Но тупик — плохой результат, поэтому к отказу прикладываем ближайшие
  // совпадения: решает пользователь, а не порог уверенности.
  res.json({
    matches: [],
    suggestions: guess.status === 'refused' ? [] : local.suggestions,
    needsClarification: null,
    refused: guess.status === 'refused',
    reason: guess.reason ?? 'Не удалось распознать название. Проверьте написание на упаковке.',
    source: guess.source,
  });
});

// FR-02. Карточка препарата.
app.get('/api/drug/:id', (req, res) => {
  const found = describe(req.params.id);
  if (!found) return res.status(404).json({ error: 'Препарат не найден.' });
  res.json({
    product: found.product,
    substance: found.substance,
    monthlyCost: monthlyCost(found.product),
    snapshot: SNAPSHOT,
  });
});

// FR-03, FR-04, FR-05. Замены, правила и льгота одним ответом.
app.get('/api/alternatives/:id', (req, res) => {
  const result = alternativesFor(req.params.id);
  if (!result) return res.status(404).json({ error: 'Препарат не найден.' });

  // Обезличенный счётчик: только идентификатор вещества, без текста запроса,
  // адреса и времени. Подробности о том, почему именно так, — в lib/stats.js.
  record(result.substance.id);

  const payload = {
    current: { ...result.current, monthlyCost: monthlyCost(result.current) },
    substance: result.substance,
    blocked: result.blocked,
    warnings: result.warnings,
    alternatives: result.alternatives,
    reimbursed: result.substance.reimbursed?.eligible ? result.substance.reimbursed : null,
    snapshot: SNAPSHOT,
  };

  res.json({ ...payload, question: questionFor(payload) });
});

// Агрегат спроса. Отдаётся всем: восстановить по нему отдельное обращение
// невозможно, потому что в нём нет ничего, кроме счётчиков по веществам.
app.get('/api/stats', (req, res) => {
  res.json({
    total: total(),
    top: top(3).map(({ substanceId, count }) => ({
      inn: substance(substanceId)?.inn_ru ?? substanceId,
      count,
    })),
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(
    `http://localhost:${port}  DEMO_MODE=${DEMO_MODE ? 1 : 0}  commit=${COMMIT.slice(0, 7)}  ` +
      `справочник: ${SUBSTANCES.length} веществ / ${PRODUCTS.length} наименований`,
  );
});
