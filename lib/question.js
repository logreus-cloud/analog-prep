// Готовый вопрос врачу.
//
// Собирается кодом из данных справочника, а не моделью: текст, который пациент
// понесёт в кабинет, обязан быть одинаковым в демо-режиме и с живым ключом,
// и не должен зависеть от того, в каком настроении сегодня языковая модель.
import { formatKzt } from './pricing.js';

const dose = (p) => `${p.strength} ${p.strength_unit}`;

export function questionFor({ current, substance, blocked, alternatives, reimbursed }) {
  const lines = [];
  lines.push(`Здравствуйте. Мне назначен препарат ${current.brand} ${dose(current)} (${substance.inn_ru}).`);

  if (blocked) {
    lines.push(
      'Я прочитал, что это препарат узкого терапевтического диапазона и менять ' +
        'производителя самостоятельно нельзя. Подскажите, пожалуйста: есть ли смысл ' +
        'рассматривать замену в моём случае и какие анализы для этого понадобятся?',
    );
  } else if (alternatives?.length) {
    const cheapest = alternatives[0];
    lines.push(
      `Можно ли заменить его на ${cheapest.product.brand} ${dose(cheapest.product)}? ` +
        'Насколько я понимаю, это то же действующее вещество, та же дозировка и та же ' +
        'лекарственная форма.',
    );
    lines.push(
      `Разница в стоимости месяца приёма: ${formatKzt(current.monthlyCost)} против ` +
        `${formatKzt(cheapest.monthlyCost)}.`,
    );
    if (substance.rx_only) {
      lines.push('Если замена возможна, прошу выписать рецепт на выбранное наименование.');
    }
  } else {
    lines.push('Подскажите, пожалуйста, есть ли у него аналоги, которые мне подойдут?');
  }

  if (reimbursed) {
    lines.push('Также прошу уточнить, положен ли мне этот препарат бесплатно при моём диагнозе.');
  }

  lines.push('Спасибо.');
  return lines.join('\n\n');
}
