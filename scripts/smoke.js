// Семь тестовых вводов из ТЗ. Один и тот же файл гоняется локально и по бою:
//   npm run smoke
//   BASE_URL=https://ваш-сервис.onrender.com npm run smoke
// Без этого «работает у меня» и «работает у жюри» — разные утверждения.
import { BASE, get, post } from './_base.js';

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
};

const find = (query) => post('/api/search', { query });
const alts = (id) => get('/api/alternatives/' + id);

console.log(`цель: ${BASE}\n`);

const health = await get('/api/health');
check('health отвечает', health.ok === true, `commit=${health.commit} demoMode=${health.demoMode}`);
check('включён демо-режим', health.demoMode === true, 'иначе проверяющему нужен ваш ключ');
check('справочник загружен', health.catalog.products >= 32, `${health.catalog.substances} веществ / ${health.catalog.products} наименований`);

console.log('');

// 01. Основной положительный случай.
const r1 = await find('Нольпаза 40');
check('01 «Нольпаза 40» находится', r1.matches[0]?.productId === 'nolpaza-40-28', `source=${r1.source}`);
const a1 = await alts('nolpaza-40-28');
check('01 есть замены и экономия', a1.alternatives.length >= 3 && a1.alternatives[0].savesKzt > 0,
  `дешевле в ${a1.alternatives[0]?.savesTimes}×`);

// 02. Опечатка и отсутствие дозировки — находится локально, без модели.
const r2 = await find('нолпаза');
check('02 опечатка без дозировки', r2.matches.length > 0 && r2.source === 'catalog', 'модель не вызывалась');

// 03. Латиница.
const r3 = await find('Nolpaza');
check('03 латиница', r3.matches[0]?.productId?.startsWith('nolpaza'), `source=${r3.source}`);

// 04. SR-01: запрет замены. Массив должен быть пустым в ответе сервера.
const r4 = await find('Эутирокс 50');
const a4 = await alts(r4.matches[0]?.productId ?? 'euthyrox-50-100');
check('04 SR-01 сработал', a4.blocked?.code === 'SR-01', a4.blocked?.title ?? 'запрета нет');
check('04 список замен пуст на сервере', Array.isArray(a4.alternatives) && a4.alternatives.length === 0,
  `в ответе ${a4.alternatives?.length} позиций`);

// 05. SR-03: пролонгированная форма невзаимозаменяема с обычной.
const r5 = await find('Глюкофаж Лонг 750');
const a5 = await alts(r5.matches[0]?.productId ?? 'glucophage-long-750');
check('05 SR-03 отсекает форму', a5.alternatives.every((a) => a.product.form === a5.current.form),
  `${a5.alternatives.length} замен, все той же формы`);

// 06. Льгота.
const r6 = await find('Лизиноприл 10');
const a6 = await alts(r6.matches[0]?.productId ?? 'lizinopril-teva-10');
check('06 отметка о льготе', Boolean(a6.reimbursed?.eligible), a6.reimbursed?.condition ?? 'нет');

// 07. Граница продукта: подбор по симптому.
const r7 = await find('от головы что-нибудь');
check('07 отказ по симптому', r7.matches.length === 0 && r7.refused === true, r7.reason ?? '');

console.log(failed ? `\n${failed} проверок упало` : '\nвсё зелёное');
process.exit(failed ? 1 : 0);
