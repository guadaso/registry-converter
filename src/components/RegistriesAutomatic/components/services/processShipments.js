// src/utils/excel/processShipments.js

import * as XLSX from 'xlsx';
import { extractLast7Digits } from '../utils/data/extractLast7Digits.js'; // ✅ Исправленный путь
import { validateModuleFormat } from '../utils/excel/validateModuleFormat.js';
import { normalizeLocation } from '../utils/excel/normalizeLocation.js';
import { readFileAsArrayBuffer } from '../utils/file/readFileAsArrayBuffer.js';

/**
 * Проверяет, содержит ли строка хотя бы 4 подряд идущие цифры.
 * Это эвристика для отличия настоящего номера модуля от текста ("Холодный счётчик").
 */
function looksLikeModule(value) {
  if (!value || typeof value !== 'string') return false;
  const digitGroups = value.match(/\d+/g) || [];
  return digitGroups.some(group => group.length >= 4);
}

export async function processShipments({ sourceWorkbook, config, files, onLog }) {
  if (!config) throw new Error('Конфигурация не определена');
  if (!sourceWorkbook) throw new Error('Исходный workbook отсутствует');

  const {
    hasHeaders,
    colApartment,
    colLocation,
    colModules,
    noLocation,
    locationInHeader,
    selectedFormat
  } = config;

  const sheetName = sourceWorkbook.SheetNames[0];
  const sheet = sourceWorkbook.Sheets[sheetName];
  const range = XLSX.utils.decode_range(sheet['!ref']);

  const colToIndex = (col) => {
    if (!col) return null;
    let result = 0;
    for (let i = 0; i < col.length; i++) {
      const code = col.charCodeAt(i);
      result = result * 26 + (code - 65);
    }
    return result;
  };

  const idxApartment = colToIndex(colApartment.trim().toUpperCase());
  const idxLocation = noLocation || locationInHeader ? null : colToIndex(colLocation.trim().toUpperCase());
  const idxModules = colModules
    .split(',')
    .map(c => c.trim())
    .filter(c => c)
    .map(colToIndex);

  let lastNonEmptyRow = range.s.r;
  const colsToCheck = [idxApartment, ...(idxLocation !== null ? [idxLocation] : []), ...idxModules].filter(c => c !== null);
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (const c of colsToCheck) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      if (cell && cell.v != null && String(cell.v).trim() !== '') {
        lastNonEmptyRow = r;
        break;
      }
    }
  }

  const startRow = hasHeaders ? range.s.r + 1 : range.s.r;
  const totalInputRows = Math.max(0, lastNonEmptyRow - startRow + 1);

  const getCellValue = (colIdx, r) => {
    if (colIdx === null) return '';
    const addr = XLSX.utils.encode_cell({ r, c: colIdx });
    const cell = sheet[addr];
    return cell && cell.v != null ? String(cell.v).trim() : '';
  };

  let prevApartment = '';
  let prevLocation = '';

  const allRecords = [];
  const duplicates = new Map();
  const invalidRecords = [];
  let validModuleCount = 0;

  for (let row = startRow; row <= lastNonEmptyRow; row++) {
    let currentApartment = getCellValue(idxApartment, row);
    let currentLocation = noLocation ? '' : getCellValue(idxLocation, row);

    if (currentApartment === '') currentApartment = prevApartment;
    if (currentLocation === '') currentLocation = prevLocation;

    if (getCellValue(idxApartment, row) !== '') prevApartment = currentApartment;
    if (!noLocation && getCellValue(idxLocation, row) !== '') prevLocation = currentLocation;

    // Обрабатываем ТОЛЬКО строки, где в колонках модулей есть значения, похожие на модули
    const rowHasPotentialModule = idxModules.some(colIdx => {
      const val = getCellValue(colIdx, row);
      return looksLikeModule(val);
    });

    if (!rowHasPotentialModule) continue;

    if (locationInHeader) {
      for (let i = 0; i < idxModules.length; i++) {
        const colIdx = idxModules[i];
        const modVal = getCellValue(colIdx, row);
        if (!modVal || !looksLikeModule(modVal)) continue;

        const validation = validateModuleFormat(modVal, selectedFormat);
        const headerAddr = XLSX.utils.encode_cell({ r: range.s.r, c: colIdx });
        const headerCell = sheet[headerAddr];
        let location = headerCell?.v != null ? String(headerCell.v).trim() : '';
        location = normalizeLocation(location);

        if (!validation.valid) {
          const record = {
            apartment: currentApartment || '',
            location,
            fullModule: modVal,
            originalRow: row + 1,
            issue: 'invalid_format',
            error: validation.error
          };
          invalidRecords.push(record);
          allRecords.push(record);
          onLog(`Невалидный модуль "${modVal}" (кв. ${currentApartment || '—'}, строка ${row + 1}): ${validation.error}`, 'warning');
        } else {
          validModuleCount++;
          const record = {
            apartment: currentApartment || '',
            location,
            fullModule: modVal,
            originalRow: row + 1,
            searchKey: validation.searchKey,
            normalized: validation.full
          };
          const key = validation.full;
          if (duplicates.has(key)) {
            duplicates.get(key).push(record);
          } else {
            duplicates.set(key, [record]);
          }
          allRecords.push(record);
        }
      }
    } else {
      const location = normalizeLocation(currentLocation);
      for (const colIdx of idxModules) {
        const modVal = getCellValue(colIdx, row);
        if (!modVal || !looksLikeModule(modVal)) continue;

        const validation = validateModuleFormat(modVal, selectedFormat);
        if (!validation.valid) {
          const record = {
            apartment: currentApartment || '',
            location,
            fullModule: modVal,
            originalRow: row + 1,
            issue: 'invalid_format',
            error: validation.error
          };
          invalidRecords.push(record);
          allRecords.push(record);
          onLog(`Невалидный модуль "${modVal}" (кв. ${currentApartment || '—'}, строка ${row + 1}): ${validation.error}`, 'warning');
        } else {
          validModuleCount++;
          const record = {
            apartment: currentApartment || '',
            location,
            fullModule: modVal,
            originalRow: row + 1,
            searchKey: validation.searchKey,
            normalized: validation.full
          };
          const key = validation.full;
          if (duplicates.has(key)) {
            duplicates.get(key).push(record);
          } else {
            duplicates.set(key, [record]);
          }
          allRecords.push(record);
        }
      }
    }
  }

  // --- ОСТАЛЬНАЯ ЧАСТЬ БЕЗ ИЗМЕНЕНИЙ ---
  const validRecordsList = [];
  const duplicateRecords = [];
  duplicates.forEach((records, key) => {
    if (records.length > 1) {
      records.forEach(r => {
        r.issue = 'duplicate';
        duplicateRecords.push(r);
      });
    } else {
      validRecordsList.push(records[0]);
    }
  });

  const allRecordsWithIssues = [...invalidRecords, ...duplicateRecords];

  onLog(`Обнаружено ${invalidRecords.length} невалидных записей.`, 'info');
  onLog(`Обнаружено ${duplicateRecords.length} дублирующих записей.`, 'info');
  onLog(`Всего обработано ${validModuleCount} номеров модулей.`, 'info');
  onLog(`Осталось ${validRecordsList.length} валидных модулей для поиска.`, 'info');

  const allSearchKeys = new Set(validRecordsList.map(r => r.searchKey));
  const shipmentData = [];

  for (const file of files) {
    if (!file || !file.name) {
      throw new Error(`Один из файлов недействителен: ${file?.name || 'без имени'}`);
    }
    const data = await readFileAsArrayBuffer(file);
    const wb = XLSX.read(data, { type: 'array' });
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet || !sheet['!ref']) continue;
      const range = XLSX.utils.decode_range(sheet['!ref']);
      let moduleCount = 0;
      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r, c });
          const cell = sheet[addr];
          if (cell?.v != null) {
            const val = String(cell.v).trim();
            if (val !== '') moduleCount++;
          }
        }
      }
      shipmentData.push({ filename: file.name, sheetname: sheetName, sheet, range, totalModules: moduleCount });
    }
  }

  const foundMap = new Map();
  const sheetSearchKeyMap = new Map();

  for (const item of shipmentData) {
    const { sheet, range, filename, sheetname } = item;
    const sheetKey = `${filename}||${sheetname}`;
    if (!sheetSearchKeyMap.has(sheetKey)) sheetSearchKeyMap.set(sheetKey, new Set());
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = sheet[addr];
        if (cell?.v != null) {
          const val = String(cell.v).trim();
          const searchKey = extractLast7Digits(val);
          if (allSearchKeys.has(searchKey)) {
            foundMap.set(searchKey, { file: filename, sheet: sheetname });
            sheetSearchKeyMap.get(sheetKey).add(searchKey);
          }
        }
      }
    }
  }

  const notFound = validRecordsList.filter(r => !foundMap.has(r.searchKey));
  const largeGroupSearchKeys = new Set();
  for (const [sheetId, keys] of sheetSearchKeyMap.entries()) {
    if (keys.size >= 3) {
      for (const key of keys) largeGroupSearchKeys.add(key);
    }
  }

  const massValidRecords = validRecordsList.filter(r => largeGroupSearchKeys.has(r.searchKey));
  const singletonRecords = validRecordsList.filter(r => foundMap.has(r.searchKey) && !largeGroupSearchKeys.has(r.searchKey));

  if (singletonRecords.length > 0) {
    onLog(`Обнаружено ${singletonRecords.length} одиночных/парных совпадений (возможно, неверный лист отгрузки)`, 'warning');
    singletonRecords.forEach(r => {
      const info = foundMap.get(r.searchKey);
      onLog(`  Модуль "${r.normalized}" найден в файле "${info.file}", лист "${info.sheet}" (строка ${r.originalRow})`, 'info');
    });
  }

  // === Генерация output.xlsx ===
  const sorted = [...massValidRecords].sort((a, b) => b.fullModule.localeCompare(a.fullModule));
  const mainWb = XLSX.utils.book_new();
  const mainRows = sorted.map(r => {
    // ❗️ УБИРАЕМ 4-й столбец — "Файл и лист отгрузки"
    return noLocation
      ? [r.apartment, r.normalized] // ← 2 столбца
      : [r.apartment, r.location, r.normalized]; // ← 3 столбца (без matchStr)
  });
  const mainWs = XLSX.utils.aoa_to_sheet(mainRows);
  XLSX.utils.book_append_sheet(mainWb, mainWs, "Результат");
  const buf = XLSX.write(mainWb, { type: 'array', bookType: 'xlsx' });
  const outputBlob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  // === Генерация export.csv ===
  const csvLines = massValidRecords.map(r => r.normalized.trim()).filter(line => line !== '');
  const bom = '\uFEFF';
  const csvBlob = new Blob([bom + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });

  // === Генерация ПОЛНОГО ОТЧЁТА (report.xlsx) ===
  const reportWb = XLSX.utils.book_new();

  // --- Лист "Результаты" ---
  if (validRecordsList.length > 0) {
    const resultRows = validRecordsList.map(r => {
      const match = foundMap.get(r.searchKey);
      const matchStr = match ? `${match.file} — ${match.sheet}` : 'Не найден';
      return noLocation
        ? [r.apartment, r.normalized, matchStr, `Строка ${r.originalRow}`]
        : [r.apartment, r.location, r.normalized, matchStr, `Строка ${r.originalRow}`];
    });
    const resultHeaders = noLocation
      ? ['Квартира', 'Модуль', 'Файл и лист отгрузки', 'Исходная строка']
      : ['Квартира', 'Место установки', 'Модуль', 'Файл и лист отгрузки', 'Исходная строка'];
    const resultWs = XLSX.utils.aoa_to_sheet([resultHeaders, ...resultRows]);
    XLSX.utils.book_append_sheet(reportWb, resultWs, "Результаты");
  }

  // --- Лист "Статистика" ---
  const statsRows = [
    ['Статистика обработки'],
    ['Всего строк в исходном файле (после заголовков)', totalInputRows],
    ['Всего номеров модулей в исходном файле', validModuleCount],
    ['Удалено: дубликаты', duplicateRecords.length],
    ['Удалено: невалидные записи', invalidRecords.length],
    ['Осталось валидных модулей для поиска', validRecordsList.length],
    ['Найдено совпадений (всего)', validRecordsList.length - notFound.length],
    ['Найдено в массовых группах (>=3)', massValidRecords.length],
    ['Не найдено', notFound.length],
    ['Одиночные/парные совпадения (ошибки)', singletonRecords.length],
    [],
    ['Детализация по листам отгрузки']
  ];

  const sheetMatchCount = new Map();
  foundMap.forEach((info, searchKey) => {
    const sheetId = `${info.file}||${info.sheet}`;
    sheetMatchCount.set(sheetId, (sheetMatchCount.get(sheetId) || 0) + 1);
  });

  const sheetTotalModules = new Map();
  for (const item of shipmentData) {
    const sheetId = `${item.filename}||${item.sheetname}`;
    sheetTotalModules.set(sheetId, item.totalModules);
  }

  for (const [sheetId, foundCount] of sheetMatchCount.entries()) {
    const total = sheetTotalModules.get(sheetId) || 0;
    const displayId = sheetId.replace('||', ' — ');
    const ratio = total > 0 ? `${foundCount} / ${total}` : `${foundCount} / ?`;
    const warning = foundCount < 3 ? '(Возможно не верный лист отгрузки!)' : '';
    statsRows.push([displayId, ratio, warning]);
  }

  const statsWs = XLSX.utils.aoa_to_sheet(statsRows);
  XLSX.utils.book_append_sheet(reportWb, statsWs, "Статистика");

  // --- Листы "Не найденные", "Дубликаты", "Невалидные записи", "Неверный лист отгрузки" ---
  if (notFound.length > 0) {
    const notFoundRows = notFound.map(r =>
      noLocation
        ? [r.apartment, r.normalized, `Строка ${r.originalRow}`]
        : [r.apartment, r.location, r.normalized, `Строка ${r.originalRow}`]
    );
    const notFoundHeaders = noLocation
      ? ['Квартира', 'Модуль', 'Исходная строка']
      : ['Квартира', 'Место установки', 'Модуль', 'Исходная строка'];
    const notFoundWs = XLSX.utils.aoa_to_sheet([notFoundHeaders, ...notFoundRows]);
    XLSX.utils.book_append_sheet(reportWb, notFoundWs, "Не найденные");
  }

  const dupRecords = allRecordsWithIssues.filter(r => r.issue === 'duplicate');
  if (dupRecords.length > 0) {
    const dupRows = dupRecords.map(r =>
      noLocation
        ? [r.apartment, r.fullModule, `Строка ${r.originalRow}`]
        : [r.apartment, r.location, r.fullModule, `Строка ${r.originalRow}`]
    );
    const dupHeaders = noLocation
      ? ['Квартира', 'Модуль', 'Исходная строка']
      : ['Квартира', 'Место установки', 'Модуль', 'Исходная строка'];
    const dupWs = XLSX.utils.aoa_to_sheet([dupHeaders, ...dupRows]);
    XLSX.utils.book_append_sheet(reportWb, dupWs, "Дубликаты");
  }

  const invRecords = allRecordsWithIssues.filter(r => r.issue === 'invalid_format');
  if (invRecords.length > 0) {
    const invRows = invRecords.map(r =>
      noLocation
        ? [r.apartment, r.fullModule, r.error, `Строка ${r.originalRow}`]
        : [r.apartment, r.location, r.fullModule, r.error, `Строка ${r.originalRow}`]
    );
    const invHeaders = noLocation
      ? ['Квартира', 'Модуль', 'Ошибка', 'Исходная строка']
      : ['Квартира', 'Место установки', 'Модуль', 'Ошибка', 'Исходная строка'];
    const invWs = XLSX.utils.aoa_to_sheet([invHeaders, ...invRows]);
    XLSX.utils.book_append_sheet(reportWb, invWs, "Невалидные записи");
  }

  if (singletonRecords.length > 0) {
    const singletonRows = singletonRecords.map(r => {
      const info = foundMap.get(r.searchKey);
      return noLocation
        ? [r.normalized, r.apartment, info ? `${info.file} — ${info.sheet}` : '']
        : [r.normalized, r.apartment, r.location, info ? `${info.file} — ${info.sheet}` : ''];
    });
    const singletonHeaders = noLocation
      ? ['Модуль', 'Квартира', 'Файл и лист отгрузки']
      : ['Модуль', 'Квартира', 'Место установки', 'Файл и лист отгрузки'];
    const singletonWs = XLSX.utils.aoa_to_sheet([singletonHeaders, ...singletonRows]);
    XLSX.utils.book_append_sheet(reportWb, singletonWs, "Неверный лист отгрузки");
  }

  const sheetsWithMassMatches = new Set();
  for (const [sheetId, keys] of sheetSearchKeyMap.entries()) {
    if (keys.size >= 3) sheetsWithMassMatches.add(sheetId);
  }

  let shipmentIndex = 1;
  for (const item of shipmentData) {
    const sheetKey = `${item.filename}||${item.sheetname}`;
    if (!sheetsWithMassMatches.has(sheetKey)) continue;
    const { filename, sheetname, sheet: origSheet, range } = item;
    const newSheet = {};
    const newRange = { s: { r: range.s.r, c: range.s.c }, e: { r: range.e.r, c: range.e.c + 1 } };
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (origSheet[addr]) newSheet[addr] = { ...origSheet[addr] };
      }
    }
    const searchCol = range.e.c + 1;
    for (let r = range.s.r; r <= range.e.r; r++) {
      let found = false;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = origSheet[addr];
        if (cell?.v != null) {
          const val = String(cell.v).trim();
          const searchKey = extractLast7Digits(val);
          if (foundMap.has(searchKey) && sheetSearchKeyMap.get(sheetKey)?.size >= 3) {
            found = true;
            break;
          }
        }
      }
      const newAddr = XLSX.utils.encode_cell({ r, c: searchCol });
      newSheet[newAddr] = { t: 's', v: found ? 'Найден' : 'Не найден' };
    }
    newSheet['!ref'] = XLSX.utils.encode_range(newRange);
    if (hasHeaders && range.s.r === 0) {
      const headerAddr = XLSX.utils.encode_cell({ r: 0, c: searchCol });
      newSheet[headerAddr] = { t: 's', v: 'Результат поиска' };
    }
    let baseName = `Отгрузки ${shipmentIndex} (${sheetname})`;
    if (baseName.length > 31) {
      const prefix = `Отгр.${shipmentIndex} (`;
      const suffix = ')';
      const available = 31 - prefix.length - suffix.length;
      baseName = available > 0 ? prefix + sheetname.substring(0, available) + suffix : `Отгр.${shipmentIndex}`.substring(0, 31);
    }
    XLSX.utils.book_append_sheet(reportWb, newSheet, baseName);
    shipmentIndex++;
  }

  const reportBuf = XLSX.write(reportWb, { type: 'array', bookType: 'xlsx' });
  const reportBlob = new Blob([reportBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  onLog(`Количество одиночных/парных модулей (singletonRecords): ${singletonRecords.length}`, 'info');

  return {
    outputBlob,
    csvBlob,
    reportBlob,
    validRecords: validRecordsList,
    allRecordsWithIssues,
    notFoundRecords: notFound,
    singletonRecords,
    stats: {
      totalInputRows,
      removedDuplicates: duplicateRecords.length,
      removedInvalid: invalidRecords.length,
      validCount: validRecordsList.length,
      notFoundCount: notFound.length,
      singletonCount: singletonRecords.length
    }
  };
}