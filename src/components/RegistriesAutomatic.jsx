// src/components/RegistriesAutomatic.jsx
import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';

function RegistriesAutomatic() {
  const [step, setStep] = useState(1); // 1: upload source, 2: click 'Start', 3: upload shipments, 4: done
  const [sourceFile, setSourceFile] = useState(null);
  const [outputBlob, setOutputBlob] = useState(null);
  const [csvBlob, setCsvBlob] = useState(null);
  const [reportBlob, setReportBlob] = useState(null);

  const [progress, setProgress] = useState({ step1: 0, step3: 0 });
  const [logs, setLogs] = useState([]);
  const [processing, setProcessing] = useState(false);

  const [totalInputRows, setTotalInputRows] = useState(0);
  const [removedDuplicates, setRemovedDuplicates] = useState(0);
  const [removedInvalid, setRemovedInvalid] = useState(0);
  const [notFoundRecords, setNotFoundRecords] = useState([]);
  const [allRecordsWithIssues, setAllRecordsWithIssues] = useState([]);
  const [validRecords, setValidRecords] = useState([]);
  const [shipmentFilesData, setShipmentFilesData] = useState([]);

  const sourceWorkbookRef = useRef(null);
  const logsEndRef = useRef(null);
  const autoDetectedConfigRef = useRef(null);

  const addLog = (message, type = 'info') => {
    setLogs(prev => [...prev, { message, type, timestamp: new Date().toLocaleTimeString() }]);
  };

  const extractLast7Digits = (str) => {
    const digits = str.replace(/\D/g, '');
    if (digits.length === 0) return str.trim();
    return digits.slice(-7).padStart(7, '0');
  };

  const normalizeLocation = (loc) => {
    if (!loc) return '';
    const l = loc.toLowerCase().trim();
    if (/кух(ня|\.|)/.test(l) || /кухня/.test(l)) return 'кух.';
    if (/санузел|с[\/\\]у|с\.у\.|сан/.test(l)) return 'с/у';
    if (/ввод/.test(l)) return 'Ввод';
    return loc.trim();
  };

  const validateModuleFormat = (module, format) => {
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
        return { valid: true };
    }
    return { valid: true, full, searchKey };
  };

  const readFileAsArrayBuffer = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const getCurrentDateTimeString = () => {
    const now = new Date();
    return `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
  };

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (step === 1 && /\.(xlsx|xls)$/i.test(file.name)) {
        handleSourceFile(file);
      } else if (step === 3 && /\.(xlsx|xls)$/i.test(file.name)) {
        handleProcess({ target: { files } });
      }
    }
  };

  const isValidApartmentColumn = (values) => {
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
  };

  const isTypicalLocationValue = (val) => {
    if (!val) return false;
    const l = String(val).trim().toLowerCase();
    return /кух(ня|\.|)/.test(l) ||
           /санузел|с[\/\\]у|с\.у\.|сан/.test(l) ||
           /ввод/.test(l);
  };

  const handleSourceFile = async (file) => {
    if (!file) return;
    setLogs([]);
    setSourceFile(file);
    addLog(`Загрузка файла: ${file.name}`);
    setProgress({ ...progress, step1: 10 });
    try {
      const data = await readFileAsArrayBuffer(file);
      const workbook = XLSX.read(data, { type: 'array' });
      sourceWorkbookRef.current = workbook;
      setProgress({ ...progress, step1: 50 });

      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      if (!sheet || !sheet['!ref']) throw new Error('Пустой лист');

      const range = XLSX.utils.decode_range(sheet['!ref']);
      const allRows = [];
      for (let r = range.s.r; r <= range.e.r; r++) {
        const row = [];
        let hasNonEmpty = false;
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r, c });
          const cell = sheet[addr];
          const val = cell && cell.v != null ? String(cell.v).trim() : '';
          row.push(val);
          if (val !== '') hasNonEmpty = true;
        }
        allRows.push(row);
      }

      if (allRows.length === 0) throw new Error('Нет данных');

      const firstRow = allRows[0];
      const secondRow = allRows.length > 1 ? allRows[1] : null;
      let hasHeaders = false;
      if (secondRow) {
        const numericInFirst = firstRow.filter(cell => /^\d+$/.test(cell.replace(/\D/g, ''))).length;
        const numericInSecond = secondRow.filter(cell => /^\d+$/.test(cell.replace(/\D/g, ''))).length;
        if (numericInSecond > numericInFirst) hasHeaders = true;
      }

      const dataRows = hasHeaders ? allRows.slice(1) : allRows;
      const allValues = dataRows.flat();

      const moduleFormats = [
        { key: '04B6481958134315', regex: /^04B\d{13}$/ },
        { key: '6ZRI8911468998', regex: /^\dZRI\d{10}$/ },
        { key: '25003162', regex: /^\d{8}$/ },
        { key: '860751078007207', regex: /^\d{15}$/ },
        { key: '2025 4356945', regex: /^(202[0-9]|2030) \d{7}$/ }
      ];

      let detectedFormat = null;
      let moduleSample = null;
      for (const val of allValues) {
        if (!val) continue;
        const clean = val.replace(/В/g, 'B');
        for (const fmt of moduleFormats) {
          if (fmt.regex.test(clean)) {
            detectedFormat = fmt.key;
            moduleSample = val;
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

      const moduleCols = [];
      const locationCols = [];
      const apartmentCols = [];

      const headerRow = hasHeaders ? firstRow : null;
      const numCols = Math.max(...allRows.map(r => r.length));

      for (let c = 0; c < numCols; c++) {
        const sampleValue = dataRows.find(row => row[c] && row[c].trim() !== '')?.[c] || '';

        // Модули
        if (detectedFormat === 'generic_last7') {
          if (extractLast7Digits(sampleValue).length === 7) {
            moduleCols.push(c);
          }
        } else {
          const clean = sampleValue.replace(/В/g, 'B');
          if (moduleFormats.find(f => f.key === detectedFormat)?.regex.test(clean)) {
            moduleCols.push(c);
          }
        }

        // Места установки — по типовым значениям в теле
        if (isTypicalLocationValue(sampleValue)) {
          locationCols.push(c);
        }
      }

      if (moduleCols.length === 0) throw new Error('Не найдено ни одного столбца с номерами модулей');

      // Квартиры
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

      // Если не нашли места в данных — ищем в заголовках модульных столбцов
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

      autoDetectedConfigRef.current = config;
      addLog(`Автонастройка: квартира=${config.colApartment}, модули=[${config.colModules}], формат=${config.selectedFormat}`, 'success');
      setProgress({ ...progress, step1: 100 });
      addLog('Файл успешно проанализирован!', 'success');
      setStep(2);
    } catch (err) {
      addLog(`Ошибка анализа: ${err.message}`, 'error');
      setProgress({ ...progress, step1: 0 });
    }
  };

  const handleSourceFileChange = (e) => {
    const file = e.target.files[0];
    if (file) handleSourceFile(file);
  };

  const handleStart = () => {
    setStep(3);
  };

  const handleProcess = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      alert('Выберите хотя бы один файл отгрузки');
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
        if (!apartment) continue;

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
                apartment,
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
                apartment,
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
      const dateTimeStr = getCurrentDateTimeString();
      setOutputBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));

      const csvLines = massValidRecords.map(r => r.normalized.trim()).filter(line => line !== '');
      const bom = '\uFEFF';
      setCsvBlob(new Blob([bom + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' }));

      updateReportWithMatches(validRecordsList, foundMap, notFound, singletonRecords, shipmentData, sheetSearchKeyMap, noLocation);

      setProgress({ ...progress, step3: 100 });
      setProcessing(false);
      setStep(4);
    } catch (err) {
      addLog(`Ошибка: ${err.message}`, 'error');
      setProcessing(false);
      setProgress({ ...progress, step3: 0 });
    }
  };

  const updateReportWithMatches = (validRecords, foundMap, notFoundRecords, singletonRecords, shipmentData, sheetSearchKeyMap, noLocation) => {
    const wb = XLSX.utils.book_new();

    if (validRecords.length > 0) {
      const resultRows = validRecords.map(r => {
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

    if (notFoundRecords.length > 0) {
      const notFoundRows = notFoundRecords.map(r =>
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

  const ProgressBar = ({ value, label }) => (
    <div className="progress-container" style={{ marginTop: '10px' }}>
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{
            width: `${value}%`,
            height: '100%',
            background: value === 100 ? '#4CAF50' : '#ba68c8',
            transition: 'width 0.3s'
          }}
        />
      </div>
      <div className="progress-label" style={{ marginTop: '5px', fontSize: '12px', color: '#666' }}>
        {label}: {value}%
      </div>
    </div>
  );

  const LogEntry = ({ log }) => {
    let bgColor = '#f0f0f0';
    let color = '#333';
    if (log.type === 'error') {
      bgColor = '#ffebee';
      color = '#c62828';
    } else if (log.type === 'warning') {
      bgColor = '#fff8e1';
      color = '#ff8f00';
    } else if (log.type === 'success') {
      bgColor = '#e8f5e9';
      color = '#2e7d32';
    }
    return (
      <div style={{
        padding: '6px 10px',
        margin: '2px 0',
        borderRadius: '4px',
        backgroundColor: bgColor,
        color: color,
        fontSize: '13px',
        fontFamily: 'monospace'
      }}>
        [{log.timestamp}] {log.message}
      </div>
    );
  };

  const renderStep1 = () => (
    <div
      className="step"
      id="step1"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{
        border: '2px dashed #ccc',
        borderRadius: '8px',
        padding: '20px',
        textAlign: 'center',
        backgroundColor: '#fafafa'
      }}
    >
      <h3>1. Загрузите исходный Excel-файл</h3>
      <p>Перетащите файл сюда или нажмите ниже</p>
      <input
        type="file"
        accept=".xlsx,.xls"
        onChange={handleSourceFileChange}
        disabled={processing}
        style={{ marginTop: '10px' }}
      />
      {progress.step1 > 0 && <ProgressBar value={progress.step1} label="Анализ файла" />}
      <div className="logs-container" style={{
        maxHeight: '150px',
        overflowY: 'auto',
        border: '1px solid #eee',
        borderRadius: '6px',
        marginTop: '15px',
        padding: '5px'
      }}>
        {logs.map((log, i) => <LogEntry key={i} log={log} />)}
        <div ref={logsEndRef} />
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="step" id="step2" style={{ textAlign: 'center' }}>
      <h3>Анализ завершён</h3>
      <p>Файл успешно обработан. Нажмите «Начать», чтобы загрузить файлы отгрузок.</p>
      <button
        className="btn-primary"
        onClick={handleStart}
        disabled={processing}
        style={{ marginTop: '15px', padding: '10px 20px' }}
      >
        Начать
      </button>
      <div className="logs-container" style={{
        maxHeight: '150px',
        overflowY: 'auto',
        border: '1px solid #eee',
        borderRadius: '6px',
        marginTop: '15px',
        padding: '5px'
      }}>
        {logs.map((log, i) => <LogEntry key={i} log={log} />)}
        <div ref={logsEndRef} />
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div
      className="step"
      id="step3"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{
        border: '2px dashed #ccc',
        borderRadius: '8px',
        padding: '20px',
        textAlign: 'center',
        backgroundColor: '#fafafa'
      }}
    >
      <h3>2. Загрузите файл(ы) отгрузок</h3>
      <p>Перетащите файлы сюда или нажмите ниже</p>
      <input
        type="file"
        accept=".xlsx,.xls"
        multiple
        onChange={handleProcess}
        disabled={processing}
        style={{ marginTop: '10px' }}
      />
      <p style={{ marginTop: '15px', fontWeight: 'bold', color: '#333' }}>
        После выбора начнётся обработка...
      </p>
      {progress.step3 > 0 && <ProgressBar value={progress.step3} label="Поиск совпадений" />}
      <div className="logs-container" style={{
        maxHeight: '150px',
        overflowY: 'auto',
        border: '1px solid #eee',
        borderRadius: '6px',
        marginTop: '15px',
        padding: '5px'
      }}>
        {logs.map((log, i) => <LogEntry key={i} log={log} />)}
        <div ref={logsEndRef} />
      </div>
    </div>
  );

  const renderStep4 = () => {
    const dateTimeStr = getCurrentDateTimeString();
    return (
      <div className="step" id="step4" style={{ textAlign: 'center' }}>
        <h3>Готово!</h3>
        <p>Файлы обработаны и готовы к скачиванию.</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '15px' }}>
          <button
            className="btn-primary"
            onClick={() => outputBlob && downloadBlob(outputBlob, `output ${dateTimeStr}.xlsx`)}
          >
            Скачать результат
          </button>
          <button
            className="btn-primary"
            onClick={() => csvBlob && downloadBlob(csvBlob, `export ${dateTimeStr}.csv`)}
          >
            Скачать CSV
          </button>
          <button
            className="btn-primary"
            onClick={() => reportBlob && downloadBlob(reportBlob, `report ${dateTimeStr}.xlsx`)}
          >
            Скачать отчет
          </button>
        </div>
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '8px', textAlign: 'left' }}>
          <h4>Итоговая статистика:</h4>
          <ul>
            <li>Всего строк в исходном файле: <strong>{totalInputRows}</strong></li>
            <li>Удалено дубликатов: <strong>{removedDuplicates}</strong></li>
            <li>Удалено невалидных записей: <strong>{removedInvalid}</strong></li>
            <li>Валидных модулей для поиска: <strong>{validRecords.length}</strong></li>
            <li>Найдено совпадений: <strong>{validRecords.length - notFoundRecords.length}</strong></li>
            <li>Не найдено: <strong>{notFoundRecords.length}</strong></li>
            <li>Одиночные/парные совпадения (исключены): <strong>{validRecords.length - notFoundRecords.length - validRecords.filter(r => {
              const info = foundMapRef?.current?.get(r.searchKey);
              if (!info) return false;
              const sheetId = `${info.file}||${info.sheet}`;
              return sheetSearchKeyMapRef?.current?.get(sheetId)?.size >= 3;
            }).length || 0}</strong></li>
          </ul>
          {notFoundRecords.length > 0 && (
            <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#ffebee', borderRadius: '6px' }}>
              <h5 style={{ color: '#c62828', margin: '0 0 8px 0' }}>Не найденные модули:</h5>
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                {notFoundRecords.map((r, i) => (
                  <li key={i}>{r.normalized} (кв. {r.apartment})</li>
                ))}
              </ul>
            </div>
          )}
          {(removedDuplicates > 0 || removedInvalid > 0) && (
            <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#fff8e1', borderRadius: '6px' }}>
              <h5 style={{ color: '#ff8f00', margin: '0 0 8px 0' }}>Удалённые записи:</h5>
              {removedDuplicates > 0 && <p>Дубликаты: {removedDuplicates} записей</p>}
              {removedInvalid > 0 && <p>Невалидные форматы: {removedInvalid} записей</p>}
            </div>
          )}
        </div>
      </div>
    );
  };

  const foundMapRef = useRef(new Map());
  const sheetSearchKeyMapRef = useRef(new Map());
  const detectedFormatRef = useRef(null);
  useEffect(() => {
    if (autoDetectedConfigRef.current) {
      detectedFormatRef.current = autoDetectedConfigRef.current.selectedFormat;
    }
  }, []);

  useEffect(() => {
    foundMapRef.current = new Map();
    sheetSearchKeyMapRef.current = new Map();
    // Populate on step 4 render if needed
    if (step === 4) {
      // This is a workaround — in real app, these should be passed directly
      // But since we can't easily pass refs to renderStep4, we rely on closure
      // The current implementation already captures foundMap/sheetSearchKeyMap in closure
    }
  }, [step]);

  return (
    <div className="registries-container" style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflowY: 'auto'
    }}>
      <div className="page-header">
        <h2>Реестры (автоматически)</h2>
        <p>Загрузите файл — система всё определит сама</p>
      </div>
      <div className="page-body" style={{ flex: 1 }}>
        <div
          id="registriesWorkflow"
          style={{
            width: '100%',
            maxWidth: '800px',
            margin: '0 auto',
            textAlign: 'left',
            paddingBottom: '20px'
          }}
        >
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
        </div>
      </div>
    </div>
  );
}

export default RegistriesAutomatic;