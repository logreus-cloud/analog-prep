// Локальный поиск по справочнику. Стоит ПЕРЕД моделью, а не после неё:
// девять вводов из десяти находятся здесь — мгновенно, без сети и без квоты.
// Модель подключается только когда этот файл вернул пусто.
import { PRODUCTS, strengthLabel } from './catalog.js';

// Кириллическая нормализация: регистр, ё, дефисы, лишние пробелы.
export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// Дозировка из свободного ввода: «нольпаза 40», «эутирокс 50 мкг».
export function parseStrength(text) {
  const m = normalize(text).match(/(\d{1,4})\s*(мкг|mcg|мг|mg)?\b/);
  if (!m) return null;
  const value = Number(m[1]);
  const unit = m[2] && /мкг|mcg/.test(m[2]) ? 'мкг' : m[2] ? 'мг' : null;
  return { value, unit };
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length];
}

// Допуск опечаток растёт со длиной слова: «нолпаза» ловится, «омез» не путается
// с «омез» соседнего вещества из-за одной буквы.
const tolerance = (len) => (len >= 9 ? 2 : len >= 5 ? 1 : 0);

function nameScore(query, name) {
  if (!name) return 0;
  if (query === name) return 1;
  if (name.startsWith(query) && query.length >= 4) return 0.92;
  if (name.includes(query) && query.length >= 5) return 0.85;
  const d = levenshtein(query, name);
  if (d <= tolerance(Math.max(query.length, name.length))) return 0.8 - d * 0.08;
  return 0;
}

// Название без цифр: дозировку разбираем отдельно, иначе «нольпаза 40»
// не совпадёт с алиасом «нольпаза».
const nameOnly = (text) => normalize(text).replace(/\b\d+\b/g, '').replace(/\b(мг|mg|мкг|mcg|таб|табл|n|№)\b/g, '').trim();

export function search(rawQuery) {
  const query = nameOnly(rawQuery);
  const strength = parseStrength(rawQuery);
  if (!query) return { matches: [], needsClarification: null };

  const scored = [];
  for (const p of PRODUCTS) {
    const names = [normalize(p.brand), ...p.aliases.map(nameOnly)];
    const best = Math.max(...names.map((n) => nameScore(query, n)));
    if (best <= 0) continue;

    // Совпала дозировка — уверенность вверх; не совпала — вниз, но позиция
    // остаётся в выдаче: человек мог ошибиться в цифре, а не в препарате.
    let confidence = best;
    if (strength) {
      const same = p.strength === strength.value && (!strength.unit || p.strength_unit === strength.unit);
      confidence = same ? Math.min(1, best + 0.08) : best - 0.25;
    }
    scored.push({ productId: p.id, confidence: Number(confidence.toFixed(2)) });
  }

  scored.sort((a, b) => b.confidence - a.confidence);
  const matches = scored.filter((m) => m.confidence >= 0.5).slice(0, 6);
  if (!matches.length) return { matches: [], suggestions: suggest(rawQuery), needsClarification: null };

  // Один препарат в нескольких дозировках, а пользователь её не указал —
  // спрашиваем, вместо того чтобы угадывать.
  let needsClarification = null;
  if (!strength && matches.length > 1) {
    const top = PRODUCTS.find((p) => p.id === matches[0].productId);
    const sameBrand = matches
      .map((m) => PRODUCTS.find((p) => p.id === m.productId))
      .filter((p) => p && normalize(p.brand) === normalize(top.brand));
    const strengths = [...new Set(sameBrand.map(strengthLabel))];
    if (strengths.length > 1) {
      needsClarification = { question: 'Какая дозировка указана на упаковке?', options: strengths };
    }
  }

  return { matches, suggestions: [], needsClarification };
}

// «Возможно, вы имели в виду». Запускается только когда поиск не нашёл ничего:
// порог здесь заведомо мягче основного, потому что цена ошибки другая — не
// подставить препарат, а предложить кликнуть. Выбирает пользователь.
export function suggest(rawQuery) {
  const query = nameOnly(rawQuery);
  if (query.length < 3) return [];

  const best = new Map();
  for (const p of PRODUCTS) {
    const names = [normalize(p.brand), ...p.aliases.map(nameOnly)];
    for (const name of names) {
      if (!name) continue;
      const similarity = 1 - levenshtein(query, name) / Math.max(query.length, name.length);
      if (similarity < 0.55) continue;
      const prev = best.get(p.id);
      if (!prev || similarity > prev.similarity) {
        best.set(p.id, { productId: p.id, label: `${p.brand} ${strengthLabel(p)}`, similarity });
      }
    }
  }

  return [...best.values()]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 2)
    .map(({ productId, label }) => ({ productId, label }));
}
