import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_MODE, resolveName } from './lib/llm.js';
import { search } from './lib/search.js';
import { alternativesFor } from './lib/safety.js';
import { describe, product, SNAPSHOT, PRODUCTS, SUBSTANCES } from './lib/catalog.js';
import { monthlyCost } from './lib/pricing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Какой коммит сейчас живой. Render и Vercel подставляют это сами —
// без этого «доехал ли фикс до прода» проверяется догадками.
const COMMIT =
  process.env.RENDER_GIT_COMMIT ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GIT_COMMIT ||
  'local';

const app = express();
app.use(express.json({ limit: '64kb' }));
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
  res.json({
    matches: [],
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

  res.json({
    current: { ...result.current, monthlyCost: monthlyCost(result.current) },
    substance: result.substance,
    blocked: result.blocked,
    warnings: result.warnings,
    alternatives: result.alternatives,
    reimbursed: result.substance.reimbursed?.eligible ? result.substance.reimbursed : null,
    snapshot: SNAPSHOT,
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(
    `http://localhost:${port}  DEMO_MODE=${DEMO_MODE ? 1 : 0}  commit=${COMMIT.slice(0, 7)}  ` +
      `справочник: ${SUBSTANCES.length} веществ / ${PRODUCTS.length} наименований`,
  );
});
