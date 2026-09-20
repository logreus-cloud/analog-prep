// Справочник целиком живёт в репозитории: проверяющий получает данные вместе
// с кодом, база не нужна, и поиск работает даже когда модель недоступна.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const read = (name) => JSON.parse(readFileSync(path.join(dir, name), 'utf8'));

export const SUBSTANCES = read('substances.json');
export const PRODUCTS = read('products.json');
export const SNAPSHOT = read('snapshot.json');

const bySubstanceId = new Map(SUBSTANCES.map((s) => [s.id, s]));
const byProductId = new Map(PRODUCTS.map((p) => [p.id, p]));

export const substance = (id) => bySubstanceId.get(id) ?? null;
export const product = (id) => byProductId.get(id) ?? null;

// Полное описание позиции: препарат + его действующее вещество.
export function describe(id) {
  const p = product(id);
  if (!p) return null;
  return { product: p, substance: substance(p.substance) };
}

// Строка дозировки в том виде, в каком её читает человек: «40 мг», «50 мкг».
export const strengthLabel = (p) => `${p.strength} ${p.strength_unit}`;

// Компактный перечень для промпта: только то, из чего модели разрешено выбирать.
export function catalogForPrompt() {
  return PRODUCTS.map((p) => `${p.id} | ${p.brand} ${strengthLabel(p)} | ${p.aliases.join(', ')}`);
}
