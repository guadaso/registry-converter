// src/utils/data/isValidApartmentColumn.js

/**
 * Проверяет, является ли массив значений подходящим для колонки "квартира".
 * @param {any[]} values - значения колонки
 * @returns {boolean}
 */
export function isValidApartmentColumn(values) {
  const numericValues = [];
  const nonNumericValues = [];
  let totalNonEmpty = 0;

  for (const val of values) {
    if (val === '' || val == null) continue;
    totalNonEmpty++;
    const clean = String(val).trim().replace(/\s+/g, '');
    const num = Number(clean);
    if (!isNaN(num) && Number.isInteger(num) && num > 0) {
      numericValues.push(num);
    } else {
      nonNumericValues.push(val);
    }
  }

  if (totalNonEmpty === 0) return false;

  // Разрешаем до 20% неподходящих значений
  const nonNumericRatio = nonNumericValues.length / totalNonEmpty;
  if (nonNumericRatio > 0.2) return false;

  // Проверка: нет ли >6 одинаковых чисел подряд
  if (numericValues.length > 0) {
    let current = numericValues[0];
    let count = 1;
    for (let i = 1; i < numericValues.length; i++) {
      if (numericValues[i] === current) {
        count++;
        if (count > 6) return false;
      } else {
        current = numericValues[i];
        count = 1;
      }
    }
    // Доп. проверка: если все числа <= 10 — скорее всего подъезд или дом
    const maxVal = Math.max(...numericValues);
    if (maxVal <= 10 && numericValues.length > 10) return false;
  }

  return true;
}