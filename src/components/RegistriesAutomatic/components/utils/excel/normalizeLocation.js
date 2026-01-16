// src/utils/excel/normalizeLocation.js

/**
 * Нормализует значение места установки.
 * @param {string} loc - исходное значение
 * @returns {string} нормализованное значение
 */
export function normalizeLocation(loc) {
  if (!loc) return '';
  const originalTrimmed = loc.trim();
  const l = originalTrimmed.toLowerCase();
  if (/кух(ня|\.|)/.test(l)) return 'кух.';
  if (/санузел|с[\/\\]у|с\.у\.|сан/.test(l)) return 'с/у';
  if (/ввод/.test(l)) return 'Ввод';
  return originalTrimmed;
}