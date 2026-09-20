// Ядро продукта: правила допустимости замены.
//
// Выполняются в коде и ДО обращения к модели. Модель не участвует в решении и
// не может снять запрет. Поэтому на вопрос «а если ваш ИИ ошибётся» ответ такой:
// в худшем случае пользователь увидит лишнее предупреждение — ошибка в сторону
// опасного совета конструктивно невозможна.
import { PRODUCTS, substance } from './catalog.js';
import { comparison } from './pricing.js';

// SR-01. Узкий терапевтический диапазон: разница в биодоступности между
// производителями клинически значима, менять препарат можно только врачу.
const SR01 = {
  code: 'SR-01',
  title: 'Замену подбирает врач',
  text:
    'Это препарат узкого терапевтического диапазона. У разных производителей ' +
    'усвоение отличается настолько, что смена препарата требует контроля врача ' +
    'и повторных анализов. Самостоятельно заменять его нельзя, даже на препарат ' +
    'с тем же действующим веществом.',
  action: 'Обсудить с врачом',
};

// SR-02. Рецептурный отпуск: замены показываем справочно, но без рецепта
// их всё равно не купить, и решение всё равно за врачом.
const SR02 = {
  code: 'SR-02',
  title: 'Отпускается по рецепту',
  text: 'Препарат рецептурный. Список ниже — справочный: замену нужно согласовать с врачом, он же выпишет рецепт на выбранное наименование.',
};

// SR-03. Разная лекарственная форма невзаимозаменяема: пролонгированная
// таблетка отдаёт вещество постепенно, обычная — сразу.
const SR03 = {
  code: 'SR-03',
  title: 'Другая форма выпуска не подходит',
};

export function alternativesFor(currentId) {
  const current = PRODUCTS.find((p) => p.id === currentId);
  if (!current) return null;

  const subst = substance(current.substance);
  const warnings = [];

  // Запрет проверяется первым. Когда он сработал, список замен не собирается
  // вовсе: клиент не может показать то, чего нет в ответе.
  if (subst.narrow_therapeutic_index) {
    return { current, substance: subst, blocked: SR01, warnings: [], alternatives: [], excludedByForm: [] };
  }

  if (subst.rx_only) warnings.push(SR02);

  const sameSubstance = PRODUCTS.filter((p) => p.substance === current.substance && p.id !== current.id);

  const interchangeable = sameSubstance.filter(
    (p) => p.strength === current.strength && p.strength_unit === current.strength_unit && p.form === current.form,
  );

  // Отсеянные по форме не прячем: пользователю полезно знать, что такой
  // препарат существует, но заменой не является.
  const excludedByForm = sameSubstance
    .filter((p) => p.strength === current.strength && p.strength_unit === current.strength_unit && p.form !== current.form)
    .map((p) => ({ brand: p.brand, form: p.form, rule: SR03.code }));

  if (excludedByForm.length) warnings.push({ ...SR03, text: `Препараты с тем же веществом, но в другой форме выпуска, в список не включены: ${excludedByForm.map((e) => `${e.brand} (${e.form})`).join(', ')}.` });

  const alternatives = interchangeable
    .map((p) => ({ product: p, ...comparison(current, p) }))
    .sort((a, b) => a.monthlyCost - b.monthlyCost);

  return { current, substance: subst, blocked: null, warnings, alternatives, excludedByForm };
}
