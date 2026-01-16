// src/utils/data/isTypicalLocationValue.js

/**
 * Проверяет, похоже ли значение на типичное место установки.
 * @param {any} val
 * @returns {boolean}
 */
export function isTypicalLocationValue(val) {
  if (!val) return false;
  const l = String(val).trim().toLowerCase();

  // Основные бытовые/санитарные зоны
  if (/кух(ня|\.|)/.test(l)) return true;
  if (/санузел|с[\/\\]у|с\.у\.|сан/.test(l)) return true;
  if (/ввод/.test(l)) return true;
  // Комната уборщицы / КУИ
  if (/к\s*у\s*и|комната\s+уборщи(цы|цей)/.test(l)) return true;
  // Полив
  if (/полив/.test(l)) return true;
  // Общедомовое / общие зоны
  if (/общ(ий|ая|ее|их|\.|едомовой|едомовая|едомовое)/.test(l)) return true;
  // Подвал, чердак, техэтаж
  if (/подвал|чердак|техэтаж|т\.э\./.test(l)) return true;
  // Лестничные клетки, холлы, коридоры
  if (/лестниц|лестничная|л\.к\.|холл|коридор|прихожая/.test(l)) return true;
  // Кладовые, бойлерные, насосные
  if (/кладов|бойлер|насос|электрощит|щитовая|венткамера|вентиляц/.test(l)) return true;
  // Номер подъезда / этажа
  if (/\d+\s*(под\.?|подъезд|эт\.?|этаж)/.test(l)) return true;
  // Прочие типичные сокращения и термины
  if (/офис|магазин|парикмахер|прачечн|сушилк|мусор|мопед|вход|вестибюл|фойе/.test(l)) return true;

  return false;
}