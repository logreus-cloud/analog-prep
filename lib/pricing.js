// Цена упаковки обманчива: пачка на 100 таблеток дороже пачки на 28, но месяц
// приёма выходит дешевле. Сравнивать можно только стоимость курса.
const DAYS = 30;

export function monthlyCost(p) {
  const unitsPerMonth = p.daily_doses * DAYS;
  return Math.round((p.price_kzt / p.pack_size) * unitsPerMonth);
}

export function comparison(current, candidate) {
  const from = monthlyCost(current);
  const to = monthlyCost(candidate);
  return {
    monthlyCost: to,
    savesKzt: from - to,
    savesTimes: to > 0 ? Number((from / to).toFixed(1)) : null,
  };
}

export const formatKzt = (n) => `${n.toLocaleString('ru-RU')} ₸`;
