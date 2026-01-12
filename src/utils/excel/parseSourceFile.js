// src/utils/excel/parseSourceFile.js

import * as XLSX from 'xlsx';
import { extractLast7Digits } from '../data/extractLast7Digits.js';
import { isTypicalLocationValue } from '../data/isTypicalLocationValue.js';
import { isValidApartmentColumn } from '../data/isValidApartmentColumn.js';
import { MODULE_FORMATS } from '../../constants/moduleFormats.js';

/**
 * Автоматически анализирует исходный Excel-файл и возвращает конфигурацию.
 * @param {ArrayBuffer} arrayBuffer - содержимое файла
 * @param {Function} addLog - функция логгирования
 * @returns {Promise<Object>} { config, workbook, cleanedRows }
 */
export async function parseSourceFile(arrayBuffer, addLog) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet || !sheet['!ref']) throw new Error('Пустой лист');

  const range = XLSX.utils.decode_range(sheet['!ref']);
  const allRows = [];

  for (let r = range.s.r; r <= range.e.r; r++) {
    const row = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      const val = cell && cell.v != null ? String(cell.v).trim() : '';
      row.push(val);
    }
    allRows.push(row);
  }

  if (allRows.length === 0) throw new Error('Нет данных');

  // === УДАЛЕНИЕ ПЕРВЫХ СТРОК БЕЗ МОДУЛЕЙ (1–4) ===
  const hasModuleInRow = (row) => {
    return row.some(cell => {
      if (!cell) return false;
      const clean = cell.replace(/В/g, 'B');
      return MODULE_FORMATS.some(fmt => fmt.regex.test(clean));
    });
  };

  let skipLines = 0;
  const maxCheck = Math.min(4, allRows.length);
  for (let i = 0; i < maxCheck; i++) {
    if (hasModuleInRow(allRows[i])) break;
    skipLines++;
  }

  let cleanedRows = allRows;
  if (skipLines > 0) {
    addLog(`Пропущено ${skipLines} начальных строк без номеров модулей`, 'info');
    cleanedRows = allRows.slice(skipLines);
  }

  if (cleanedRows.length === 0) throw new Error('После удаления начальных строк данных не осталось');

  // === ОПРЕДЕЛЕНИЕ ЗАГОЛОВКОВ ===
  const firstRow = cleanedRows[0];
  const secondRow = cleanedRows.length > 1 ? cleanedRows[1] : null;
  let hasHeaders = false;

  if (secondRow) {
    const numericInFirst = firstRow.filter(cell => /^\d+$/.test(cell.replace(/\D/g, ''))).length;
    const numericInSecond = secondRow.filter(cell => /^\d+$/.test(cell.replace(/\D/g, ''))).length;
    if (numericInSecond > numericInFirst) hasHeaders = true;
  }

  const dataRows = hasHeaders ? cleanedRows.slice(1) : cleanedRows;
  const allValues = dataRows.flat();

  // === ОПРЕДЕЛЕНИЕ ФОРМАТА МОДУЛЕЙ ===
  let detectedFormat = null;
  for (const val of allValues) {
    if (!val) continue;
    const clean = val.replace(/В/g, 'B');
    for (const fmt of MODULE_FORMATS) {
      if (fmt.regex.test(clean)) {
        detectedFormat = fmt.key;
        break;
      }
    }
    if (detectedFormat) break;
  }

  if (!detectedFormat) {
    const last7Values = allValues.map(v => extractLast7Digits(v)).filter(v => v.length === 7 && /^\d{7}$/.test(v));
    if (last7Values.length > 0) {
      detectedFormat = 'generic_last7';
    } else {
      throw new Error('Не удалось определить формат номеров модулей');
    }
  }

  // === ОПРЕДЕЛЕНИЕ КОЛОНКИ МОДУЛЕЙ ===
  const numCols = Math.max(...cleanedRows.map(r => r.length));
  const moduleCols = [];
  const locationCols = [];

  for (let c = 0; c < numCols; c++) {
    const sampleValue = dataRows.find(row => row[c] && row[c].trim() !== '')?.[c] || '';

    // Модули
    if (detectedFormat === 'generic_last7') {
      if (extractLast7Digits(sampleValue).length === 7) {
        moduleCols.push(c);
      }
    } else {
      const clean = sampleValue.replace(/В/g, 'B');
      if (MODULE_FORMATS.find(f => f.key === detectedFormat)?.regex.test(clean)) {
        moduleCols.push(c);
      }
    }

    // Места установки
    if (isTypicalLocationValue(sampleValue)) {
      locationCols.push(c);
    }
  }

  if (moduleCols.length === 0) throw new Error('Не найдено ни одного столбца с номерами модулей');

  // === ОПРЕДЕЛЕНИЕ КОЛОНКИ КВАРТИР ===
  const apartmentCols = [];
  for (let c = 0; c < numCols; c++) {
    if (moduleCols.includes(c) || locationCols.includes(c)) continue;
    const colValues = [];
    for (const row of dataRows) {
      let hasModuleInRow = false;
      for (const mc of moduleCols) {
        if (mc < row.length && row[mc] && extractLast7Digits(row[mc]).length >= 7) {
          hasModuleInRow = true;
          break;
        }
      }
      if (hasModuleInRow && c < row.length) {
        colValues.push(row[c]);
      }
    }
    if (isValidApartmentColumn(colValues)) {
      apartmentCols.push(c);
    }
  }

  if (apartmentCols.length === 0) {
    throw new Error('Не удалось определить столбец с номерами квартир');
  }

  // === ОБРАБОТКА ЛОКАЦИЙ В ЗАГОЛОВКАХ ===
  const headerRow = hasHeaders ? firstRow : null;
  let noLocation = locationCols.length === 0;
  let locationInHeader = false;
  let finalLocationCols = locationCols;

  if (noLocation && headerRow) {
    let allModuleHeadersAreLocations = true;
    for (const c of moduleCols) {
      if (c < headerRow.length && !isTypicalLocationValue(headerRow[c])) {
        allModuleHeadersAreLocations = false;
        break;
      }
    }
    if (allModuleHeadersAreLocations && moduleCols.length > 0) {
      locationInHeader = true;
      noLocation = false;
      finalLocationCols = [];
    }
  }

  // === ПРЕОБРАЗОВАНИЕ ИНДЕКСОВ В БУКВЕННЫЕ ИМЕНА ===
  const idxToCol = (idx) => {
    let s = '';
    while (idx >= 0) {
      s = String.fromCharCode(65 + (idx % 26)) + s;
      idx = Math.floor(idx / 26) - 1;
    }
    return s;
  };

  const config = {
    hasHeaders,
    colApartment: idxToCol(apartmentCols[0]),
    colLocation: finalLocationCols.length > 0 ? idxToCol(finalLocationCols[0]) : '',
    colModules: moduleCols.map(idxToCol).join(','),
    noLocation,
    locationInHeader,
    selectedFormat: detectedFormat === 'generic_last7' ? '860751078007207' : detectedFormat
  };

  return { config, workbook, cleanedRows };
}