// src/utils/data/extractLast7Digits.js

/**
 * Извлекает последние 7 цифр из строки.
 * @param {string} str
 * @returns {string} строка из 7 цифр (с ведущими нулями)
 */
export function extractLast7Digits(str) {
  const digits = str.replace(/\D/g, '');
  if (digits.length === 0) return str.trim();
  return digits.slice(-7).padStart(7, '0');
}