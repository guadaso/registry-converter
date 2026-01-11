// src/components/RegistriesAutomaticComponents/matchingDispatch.js
import * as XLSX from 'xlsx';

export const processShipmentFiles = async ({ files, addLog, setProcessing, setProgress, progress, autoDetectedConfigRef, sourceWorkbookRef, setValidRecords, setAllRecordsWithIssues, setRemovedInvalid, setRemovedDuplicates, setTotalInputRows, setShipmentFilesData, setNotFoundRecords, setOutputBlob, setCsvBlob, setReportBlob, setStep, normalizeLocation, validateModuleFormat, extractLast7Digits, readFileAsArrayBuffer, XLSX, detectedFormatRef, setLogs }) => {
  if (!files || files.length === 0) {
    addLog('Нет файлов для обработки', 'error');
    setProcessing(false);
    return;
  }

  setLogs([]);
  addLog(`Начало обработки ${files.length} файл(ов) отгрузок...`);
  setProcessing(true);
  setProgress({ ...progress, step3: 10 });

  try {
    const config = autoDetectedConfigRef.current;
    if (!config) throw new Error('Конфигурация не определена');

    const { hasHeaders, colApartment, colLocation, colModules, noLocation, locationInHeader, selectedFormat } = config;
    const workbook = sourceWorkbookRef.current;
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
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
    const idxModules = colModules.split(',').map(c => c.trim()).filter(c => c).map(colToIndex);

    let lastNonEmptyRow = range.s.r;
    const colsToCheck = [idxApartment, ...(idxLocation !== null ? [idxLocation] : []), ...idxModules];
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (const c of colsToCheck) {
        if (c === null) continue;
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = sheet[addr];
        if (cell && cell.v != null && String(cell.v).trim() !== '') {
          lastNonEmptyRow = r;
          break;
        }
      }
    }

    const startRow = hasHeaders ? range.s.r + 1 : range.s.r;
    const getCellValue = (colIdx, r) => {
      if (colIdx === null) return '';
      const addr = XLSX.utils.encode_cell({ r, c: colIdx });
      const cell = sheet[addr];
      return cell && cell.v != null ? String(cell.v).trim() : '';
    };

    const allRecords = [];
    const duplicates = new Map();
    const invalidRecords = [];
    let totalModules = 0;

    for (let row = startRow; row <= lastNonEmptyRow; row++) {
      const apartment = getCellValue(idxApartment, row);
      const rowHasModule = idxModules.some(colIdx => {
        const val = getCellValue(colIdx, row);
        return val && (detectedFormatRef.current === 'generic_last7'
          ? extractLast7Digits(val).length === 7
          : validateModuleFormat(val, config.selectedFormat).valid);
      });

      if (!rowHasModule) continue;

      if (locationInHeader) {
        for (let i = 0; i < idxModules.length; i++) {
          const colIdx = idxModules[i];
          const modVal = getCellValue(colIdx, row);
          if (modVal) {
            totalModules++;
            const headerAddr = XLSX.utils.encode_cell({ r: range.s.r, c: colIdx });
            const headerCell = sheet[headerAddr];
            let location = headerCell && headerCell.v != null ? String(headerCell.v).trim() : '';
            location = normalizeLocation(location);
            const validation = validateModuleFormat(modVal, selectedFormat);
            const record = {
              apartment: apartment || '',
              location,
              fullModule: modVal,
              originalRow: row + 1,
              ...(validation.valid ? { searchKey: validation.searchKey, normalized: validation.full } : {})
            };
            if (!validation.valid) {
              record.issue = 'invalid_format';
              record.error = validation.error;
              invalidRecords.push(record);
              allRecords.push(record);
              continue;
            }
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
        let location = noLocation ? '' : getCellValue(idxLocation, row);
        location = normalizeLocation(location);
        for (const colIdx of idxModules) {
          const modVal = getCellValue(colIdx, row);
          if (modVal) {
            totalModules++;
            const validation = validateModuleFormat(modVal, selectedFormat);
            const record = {
              apartment: apartment || '',
              location,
              fullModule: modVal,
              originalRow: row + 1,
              ...(validation.valid ? { searchKey: validation.searchKey, normalized: validation.full } : {})
            };
            if (!validation.valid) {
              record.issue = 'invalid_format';
              record.error = validation.error;
              invalidRecords.push(record);
              allRecords.push(record);
              continue;
            }
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

    const allWithIssues = [...invalidRecords, ...duplicateRecords];
    setValidRecords(validRecordsList);
    setAllRecordsWithIssues(allWithIssues);
    setRemovedInvalid(invalidRecords.length);
    setRemovedDuplicates(duplicateRecords.length);
    setTotalInputRows(totalModules);

    const allSearchKeys = new Set(validRecordsList.map(r => r.searchKey));
    const foundMap = new Map();
    const sheetSearchKeyMap = new Map();
    const shipmentData = [];

    for (const file of files) {
      // 🔍 КРИТИЧЕСКАЯ ПРОВЕРКА: есть ли у файла имя?
      if (!file || !file.name) {
        throw new Error('Один из файлов недействителен (возможно, повреждён кэш)');
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

    setShipmentFilesData(shipmentData);

    for (const item of shipmentData) {
      const { sheet, range, filename, sheetname } = item;
      const sheetKey = `${filename}||${sheetname}`;
      if (!sheetSearchKeyMap.has(sheetKey)) sheetSearchKeyMap.set(sheetKey, new Set());
      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cell = sheet[XLSX.utils.encode_cell({ r, c })];
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
    setNotFoundRecords(notFound);

    const largeGroupSearchKeys = new Set();
    for (const [sheetId, keys] of sheetSearchKeyMap.entries()) {
      if (keys.size >= 3) {
        for (const key of keys) largeGroupSearchKeys.add(key);
      }
    }

    const massValidRecords = validRecordsList.filter(r => largeGroupSearchKeys.has(r.searchKey));
    const singletonRecords = validRecordsList.filter(r => foundMap.has(r.searchKey) && !largeGroupSearchKeys.has(r.searchKey));

    const outputRecords = massValidRecords.map(record => ({
      ...record,
      matchInfo: foundMap.get(record.searchKey) || null
    }));

    const sorted = [...outputRecords].sort((a, b) => b.fullModule.localeCompare(a.fullModule));
    const mainWb = XLSX.utils.book_new();
    const mainRows = sorted.map(r => {
      const matchStr = r.matchInfo ? `${r.matchInfo.file} — ${r.matchInfo.sheet}` : 'Не найден';
      return noLocation
        ? [r.apartment, r.normalized, matchStr]
        : [r.apartment, r.location, r.normalized, matchStr];
    });
    const mainWs = XLSX.utils.aoa_to_sheet(mainRows);
    XLSX.utils.book_append_sheet(mainWb, mainWs, "Результат");
    const buf = XLSX.write(mainWb, { type: 'array', bookType: 'xlsx' });
    setOutputBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));

    const csvLines = massValidRecords.map(r => r.normalized.trim()).filter(line => line !== '');
    const bom = '\uFEFF';
    setCsvBlob(new Blob([bom + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' }));

    updateReportWithMatches({validRecordsList, foundMap, notFound, singletonRecords, shipmentData, sheetSearchKeyMap, noLocation, setReportBlob, XLSX, totalInputRows: totalModules, removedDuplicates: duplicateRecords.length, removedInvalid: invalidRecords.length, validRecords: validRecordsList, notFoundRecords: notFound, allRecordsWithIssues: allWithIssues, autoDetectedConfigRef});

    setProgress({ ...progress, step3: 100 });
    setProcessing(false);
    setStep(4);
  } catch (err) {
    addLog(`Ошибка обработки файлов отгрузок: ${err.message}`, 'error');
    setProcessing(false);
    setProgress({ ...progress, step3: 0 });
  }
};

export const updateReportWithMatches = ({ validRecordsList, foundMap, notFound, singletonRecords, shipmentData, sheetSearchKeyMap, noLocation, setReportBlob, XLSX, totalInputRows, removedDuplicates, removedInvalid, validRecords, notFoundRecords, allRecordsWithIssues, autoDetectedConfigRef }) => {
  const wb = XLSX.utils.book_new();

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
    XLSX.utils.book_append_sheet(wb, resultWs, "Результаты");
  }

  const statsRows = [
    ['Статистика обработки'],
    ['Всего строк в исходном файле (после заголовков)', totalInputRows],
    ['Удалено: дубликаты', removedDuplicates],
    ['Удалено: невалидные записи', removedInvalid],
    ['Осталось валидных модулей для поиска', validRecords.length],
    ['Найдено совпадений (всего)', validRecords.length - notFoundRecords.length],
    ['Найдено в массовых группах (>=3)', validRecords.filter(r => {
      const info = foundMap.get(r.searchKey);
      if (!info) return false;
      const sheetId = `${info.file}||${info.sheet}`;
      return sheetSearchKeyMap.has(sheetId) && sheetSearchKeyMap.get(sheetId).size >= 3;
    }).length],
    ['Не найдено', notFoundRecords.length],
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
  XLSX.utils.book_append_sheet(wb, statsWs, "Статистика");

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
    XLSX.utils.book_append_sheet(wb, notFoundWs, "Не найденные");
  }

  const dupRecords = allRecordsWithIssues.filter(r => r.issue === 'duplicate');
  const invRecords = allRecordsWithIssues.filter(r => r.issue === 'invalid_format');

  if (dupRecords.length > 0) {
    const dupRows = dupRecords.map(r =>
      noLocation ? [r.apartment, r.fullModule, `Строка ${r.originalRow}`] :
        [r.apartment, r.location, r.fullModule, `Строка ${r.originalRow}`]
    );
    const dupHeaders = noLocation ? ['Квартира', 'Модуль', 'Исходная строка'] :
      ['Квартира', 'Место установки', 'Модуль', 'Исходная строка'];
    const dupWs = XLSX.utils.aoa_to_sheet([dupHeaders, ...dupRows]);
    XLSX.utils.book_append_sheet(wb, dupWs, "Дубликаты");
  }

  if (invRecords.length > 0) {
    const invRows = invRecords.map(r =>
      noLocation ? [r.apartment, r.fullModule, r.error, `Строка ${r.originalRow}`] :
        [r.apartment, r.location, r.fullModule, r.error, `Строка ${r.originalRow}`]
    );
    const invHeaders = noLocation ? ['Квартира', 'Модуль', 'Ошибка', 'Исходная строка'] :
      ['Квартира', 'Место установки', 'Модуль', 'Ошибка', 'Исходная строка'];
    const invWs = XLSX.utils.aoa_to_sheet([invHeaders, ...invRows]);
    XLSX.utils.book_append_sheet(wb, invWs, "Невалидные записи");
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
    XLSX.utils.book_append_sheet(wb, singletonWs, "Неверный лист отгрузки");
  }

  const sheetsWithMassMatches = new Set();
  for (const [sheetId, keys] of sheetSearchKeyMap.entries()) {
    if (keys.size >= 3) sheetsWithMassMatches.add(sheetId);
  }

  let shipmentIndex = 1;
  for (const item of shipmentData) {
    const sheetKey = `${item.filename}||${item.sheetname}`;
    if (!sheetsWithMassMatches.has(sheetKey)) continue;
    const { filename, sheetname, sheet, range } = item;
    const newSheet = {};
    const newRange = { s: { r: range.s.r, c: range.s.c }, e: { r: range.e.r, c: range.e.c + 1 } };
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (sheet[addr]) newSheet[addr] = { ...sheet[addr] };
      }
    }
    const searchCol = range.e.c + 1;
    for (let r = range.s.r; r <= range.e.r; r++) {
      let found = false;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = sheet[addr];
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
    if (autoDetectedConfigRef.current?.hasHeaders && range.s.r === 0) {
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
    XLSX.utils.book_append_sheet(wb, newSheet, baseName);
    shipmentIndex++;
  }

  const reportBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  setReportBlob(new Blob([reportBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
};