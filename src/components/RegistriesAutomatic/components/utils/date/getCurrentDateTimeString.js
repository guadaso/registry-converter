// src/utils/date/getCurrentDateTimeString.js

/**
 * Возвращает строку текущей даты и времени в формате: ДД.ММ.ГГГГ ЧЧ-ММ
 * @returns {string}
 */
export function getCurrentDateTimeString() {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
}