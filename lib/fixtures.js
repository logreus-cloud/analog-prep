// Записанные ответы модели. В DEMO_MODE приложение проигрывает их вместо
// обращения к API — поэтому публичная ссылка работает без вашего ключа.
//
// Модель здесь вызывается редко: сначала отрабатывает локальный поиск
// (lib/search.js), и до фикстур доходят только вводы, которые он не узнал.
//
// Как записать свою: прогнать запрос с DEMO_MODE=0, скопировать ответ сюда,
// подобрать к нему match-паттерн.

export const FIXTURES = [
  {
    // Подбор препарата по симптому — за границей продукта.
    match: /от\s+(головы|живота|горла|температуры)|что.?нибудь|болит/i,
    response: {
      status: 'refused',
      reason: 'Система не подбирает препарат по симптому — только ищет аналоги уже назначенного.',
    },
  },
  {
    // Несуществующее наименование: отказ честнее, чем похожий по звучанию.
    match: /пенталгинум|форте\s*$/i,
    response: {
      status: 'not_found',
      reason: 'Такого препарата нет в справочнике.',
    },
  },
  {
    match: /нольпаз|нолпаз|nolpaza/i,
    response: { status: 'ok', productId: 'nolpaza-40-28', confidence: 0.9 },
  },
  {
    match: /эутирокс|euthyrox/i,
    response: { status: 'ok', productId: 'euthyrox-50-100', confidence: 0.95 },
  },
];

export function genericResponse() {
  return {
    status: 'not_found',
    reason: 'Не удалось распознать название. Проверьте написание на упаковке.',
  };
}

export function playback(input) {
  const hit = FIXTURES.find((f) => f.match.test(input));
  return hit ? { ...hit.response } : genericResponse();
}
