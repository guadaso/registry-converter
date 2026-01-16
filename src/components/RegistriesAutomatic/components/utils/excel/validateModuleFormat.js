// src/utils/excel/validateModuleFormat.js

import { extractLast7Digits } from '../data/extractLast7Digits.js';
import { MODULE_FORMATS } from '../../constants/moduleFormats.js';

/**
 * Проверяет, соответствует ли значение указанному формату модуля.
 * @param {string} module - исходное значение
 * @param {string} format - ключ формата (например, '04B6481958134315')
 * @returns {{ valid: boolean, full?: string, searchKey?: string, error?: string }}
 */
export function validateModuleFormat(module, format) {
  const trimmed = module.trim();
  const replaced = trimmed.replace(/В/g, 'B');

  if (/[\u0400-\u04FF]/.test(replaced)) {
    return { valid: false, error: 'кириллица запрещена' };
  }

  let full, searchKey;

  switch (format) {
    case '04B6481958134315':
      if (!/^04B\d{13}$/.test(replaced)) return { valid: false, error: 'ожидается 04B + 13 цифр' };
      full = replaced;
      searchKey = extractLast7Digits(replaced);
      break;

    case '6ZRI8911468998':
    case '8ZRI9960014284':
      if (!/^\dZRI\d{10}$/.test(replaced)) return { valid: false, error: 'ожидается [цифра]ZRI + 10 цифр' };
      full = replaced;
      searchKey = extractLast7Digits(replaced);
      break;

    case '25003162':
      if (!/^\d{8}$/.test(replaced)) return { valid: false, error: 'ровно 8 цифр' };
      full = replaced;
      searchKey = replaced;
      break;

    case '860751078007207':
      if (!/^\d{15}$/.test(replaced)) return { valid: false, error: 'ровно 15 цифр' };
      full = replaced;
      searchKey = extractLast7Digits(replaced);
      break;

    case '2025 4356945':
      if (!/^(202[0-9]|2030) \d{7}$/.test(replaced)) return { valid: false, error: 'год 2020–2030, пробел, 7 цифр' };
      full = replaced.replace(/\s+/g, '');
      searchKey = extractLast7Digits(replaced);
      break;

    default:
      // generic_last7 обрабатывается отдельно — здесь не должен попадать
      return { valid: true };
  }

  return { valid: true, full, searchKey };
}