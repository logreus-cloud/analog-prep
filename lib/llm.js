// Единственное место, где приложение разговаривает с моделью.
//
// Модель здесь делает ровно одну работу: распознаёт название, которое не узнал
// локальный поиск. Решение о допустимости замены она не принимает никогда —
// это lib/safety.js. Поэтому демо-режим и живой ключ дают одинаковый вердикт.
import { playback, genericResponse } from './fixtures.js';
import { catalogForPrompt } from './catalog.js';

export const DEMO_MODE = process.env.DEMO_MODE !== '0';

// Идентификатор модели вынесен в переменную: у бесплатного тарифа он меняется
// чаще, чем успевают обновляться спецификации. Проверить в консоли Google AI Studio.
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const SYSTEM = `Ты сопоставляешь название лекарства, введённое пациентом, с записью справочника.

Правила:
1. Выбирай ТОЛЬКО из перечня ниже. Придумывать препараты и возвращать id, которого нет в перечне, запрещено.
2. Если подходящей записи нет — верни status "not_found". Выдуманное название опаснее отказа.
3. Если пользователь описывает симптом, а не препарат, — верни status "refused".
4. Ответ строго в JSON: {"status":"ok","productId":"...","confidence":0.0-1.0} либо {"status":"not_found"|"refused","reason":"..."}

Перечень справочника (id | наименование и дозировка | синонимы):
`;

function parseJson(text) {
  const cleaned = String(text).replace(/^```(?:json)?|```$/gm, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export async function resolveName(input) {
  if (DEMO_MODE) return { ...playback(input), source: 'demo' };

  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ...genericResponse(), source: 'fallback:no-key' };

  let response;
  try {
    response = await fetch(`${ENDPOINT(MODEL)}?key=${key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM + catalogForPrompt().join('\n') }] },
        contents: [{ role: 'user', parts: [{ text: input }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 256, responseMimeType: 'application/json' },
      }),
    });
  } catch {
    // Сеть отвалилась — продукт продолжает работать на локальном поиске.
    return { ...genericResponse(), source: 'fallback:network' };
  }

  // Квота бесплатного тарифа кончается тихо. Отвечаем отказом, а не пятисоткой.
  if (!response.ok) {
    return { ...genericResponse(), source: `fallback:http-${response.status}` };
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
  const parsed = parseJson(text);

  if (!parsed?.status) return { ...genericResponse(), source: 'fallback:unparsed' };
  return { ...parsed, source: 'api' };
}
