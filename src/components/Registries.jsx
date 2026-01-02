// src/components/Registries.jsx
import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';

function Registries() {
  const [step, setStep] = useState(1);
  const [sourceFile, setSourceFile] = useState(null);
  const [outputBlob, setOutputBlob] = useState(null);
  const [csvBlob, setCsvBlob] = useState(null);
  const [reportBlob, setReportBlob] = useState(null);
  
  // Настройки
  const [hasHeaders, setHasHeaders] = useState(true);
  const [noLocation, setNoLocation] = useState(false);
  const [locationInHeader, setLocationInHeader] = useState(false);
  const [colApartment, setColApartment] = useState('B');
  const [colLocation, setColLocation] = useState('C');
  const [colModules, setColModules] = useState('D,E,F');
  const [createB2Folder, setCreateB2Folder] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState('04B6481958134315');

  // Состояния прогресса
  const [progress, setProgress] = useState({ step1: 0, step2: 0, step3: 0 });
  const [logs, setLogs] = useState([]);
  const [processing, setProcessing] = useState(false);

  // Статистика
  const [totalInputRows, setTotalInputRows] = useState(0);
  const [removedDuplicates, setRemovedDuplicates] = useState(0);
  const [removedInvalid, setRemovedInvalid] = useState(0);
  const [notFoundRecords, setNotFoundRecords] = useState([]);

  // Все записи с метками
  const [allRecordsWithIssues, setAllRecordsWithIssues] = useState([]);
  const [validRecords, setValidRecords] = useState([]);

  // Для отслеживания исходных данных отгрузок
  const [shipmentFilesData, setShipmentFilesData] = useState([]);

  const sourceWorkbookRef = useRef(null);
  const logsEndRef = useRef(null);

  const moduleFormats = [
    { value: '04B6481958134315', label: '04B6481958134315 (16 символов, начинается с 04B)' },
    { value: '6ZRI8911468998', label: '6ZRI8911468998 (14 символов, начинается с цифры + ZRI)' },
    { value: '8ZRI9960014284', label: '8ZRI9960014284 (14 символов, начинается с цифры + ZRI)' }
  ];

  const addLog = (message, type = 'info') => {
    setLogs(prev => [...prev, { message, type, timestamp: new Date().toLocaleTimeString() }]);
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

  const colToIndex = (col) => {
    if (!col || typeof col !== 'string') throw new Error('Некорректное имя столбца');
    let result = 0;
    for (let i = 0; i < col.length; i++) {
      const code = col.charCodeAt(i);
      if (code < 65 || code > 90) throw new Error('Столбец должен быть в формате A, B, ..., Z, AA и т.д.');
      result = result * 26 + (code - 65);
    }
    return result;
  };

  const extractLast7Digits = (str) => {
    const digits = str.replace(/\D/g, '');
    if (digits.length === 0) return str.trim();
    return digits.slice(-7).padStart(7, '0');
  };

  const validateModuleFormat = (module) => {
    const trimmed = module.trim();
    const replaced = trimmed.replace(/В/g, 'B');
    if (/[\u0400-\u04FF]/.test(replaced)) {
      return { valid: false, error: 'кириллица запрещена' };
    }
    switch (selectedFormat) {
      case '04B6481958134315':
        if (!/^04B\d{13}$/.test(replaced)) {
          return { valid: false, error: 'некорректный формат (ожидается 04B + 13 цифр)' };
        }
        break;
      case '6ZRI8911468998':
      case '8ZRI9960014284':
        if (!/^\dZRI\d{10}$/.test(replaced)) {
          return { valid: false, error: 'некорректный формат (ожидается [цифра]ZRI + 10 цифр)' };
        }
        break;
      default:
        return { valid: true };
    }
    return { valid: true, full: replaced, searchKey: extractLast7Digits(replaced) };
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
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${day}.${month}.${year} ${hours}-${minutes}`;
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

  const sanitizeSheetName = (name, maxLength = 31) => {
    if (name.length <= maxLength) return name;
    return name.substring(0, maxLength);
  };

  // === ОБРАБОТЧИКИ ===

  const handleSourceFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLogs([]);
    setTotalInputRows(0);
    setRemovedDuplicates(0);
    setRemovedInvalid(0);
    setNotFoundRecords([]);
    setAllRecordsWithIssues([]);
    setValidRecords([]);
    setShipmentFilesData([]);
    addLog(`Загрузка файла: ${file.name}`);
    setSourceFile(file);
    setProgress({ ...progress, step1: 10 });
    try {
      addLog('Чтение файла...', 'info');
      const data = await readFileAsArrayBuffer(file);
      const workbook = XLSX.read(data, { type: 'array' });
      sourceWorkbookRef.current = workbook;
      setProgress({ ...progress, step1: 100 });
      addLog('Файл успешно загружен!', 'success');
      setStep(2);
    } catch (err) {
      addLog(`Ошибка чтения файла: ${err.message}`, 'error');
      setProgress({ ...progress, step1: 0 });
    }
  };

  const handleParseSource = () => {
    setLogs([]);
    addLog('Начало парсинга исходного файла...');
    setProcessing(true);
    setProgress({ ...progress, step2: 20 });

    try {
      const workbook = sourceWorkbookRef.current;
      if (!workbook) throw new Error('Файл не загружен');
      
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      if (!sheet || !sheet['!ref']) throw new Error('Исходный файл содержит пустой лист');
      
      const range = XLSX.utils.decode_range(sheet['!ref']);
      const idxApartment = colToIndex(colApartment.trim().toUpperCase());
      const idxLocation = noLocation || locationInHeader ? null : colToIndex(colLocation.trim().toUpperCase());
      const idxModules = colModules.trim().toUpperCase().split(',').map(c => c.trim()).filter(c => c).map(colToIndex);
      
      if (idxModules.length === 0) throw new Error('Укажите хотя бы один столбец для модулей');
      if (!noLocation && !locationInHeader && idxLocation === null) throw new Error('Укажите столбец для места установки');

      let lastNonEmptyRow = range.s.r;
      const colsToCheck = [idxApartment, ...(idxLocation !== null ? [idxLocation] : []), ...idxModules];
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

        if (locationInHeader) {
          for (let i = 0; i < idxModules.length; i++) {
            const colIdx = idxModules[i];
            const modVal = getCellValue(colIdx, row);
            if (modVal) {
              totalModules++;
              const headerAddr = XLSX.utils.encode_cell({ r: range.s.r, c: colIdx });
              const headerCell = sheet[headerAddr];
              const location = headerCell && headerCell.v != null ? String(headerCell.v).trim() : '';
              
              const validation = validateModuleFormat(modVal);
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
          const location = noLocation ? '' : getCellValue(idxLocation, row);
          for (const colIdx of idxModules) {
            const modVal = getCellValue(colIdx, row);
            if (modVal) {
              totalModules++;
              const validation = validateModuleFormat(modVal);
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

      // Помечаем ВСЕ дубликаты
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

      const allWithIssues = [
        ...invalidRecords,
        ...duplicateRecords
      ];

      setValidRecords(validRecordsList);
      setAllRecordsWithIssues(allWithIssues);
      setRemovedInvalid(invalidRecords.length);
      setRemovedDuplicates(duplicateRecords.length);
      setTotalInputRows(totalModules);
      setProgress({ ...progress, step2: 100 });
      setProcessing(false);

      addLog(`Парсинг завершен: ${validRecordsList.length} валидных модулей из ${totalModules} записей`, 'success');
      if (duplicateRecords.length > 0) {
        addLog(`${duplicateRecords.length} записей удалено как дубликаты`, 'warning');
      }
      if (invalidRecords.length > 0) {
        addLog(`${invalidRecords.length} записей удалено из-за невалидного формата`, 'error');
      }

      createReportFile(validRecordsList, duplicateRecords, invalidRecords);
      setStep(3);
    } catch (err) {
      addLog(`Ошибка парсинга: ${err.message}`, 'error');
      setProcessing(false);
      setProgress({ ...progress, step2: 0 });
    }
  };

  const createReportFile = (validRecords, duplicates, invalids) => {
    const wb = XLSX.utils.book_new();
    
    // Валидные записи
    if (validRecords.length > 0) {
      const validRows = validRecords.map(r => 
        noLocation ? [r.apartment, r.normalized, `Строка ${r.originalRow}`] : 
                     [r.apartment, r.location, r.normalized, `Строка ${r.originalRow}`]
      );
      const validHeaders = noLocation ? ['Квартира', 'Модуль', 'Исходная строка'] : 
                                      ['Квартира', 'Место установки', 'Модуль', 'Исходная строка'];
      const validWs = XLSX.utils.aoa_to_sheet([validHeaders, ...validRows]);
      XLSX.utils.book_append_sheet(wb, validWs, "Валидные записи");
    }

    // Дубликаты
    if (duplicates.length > 0) {
      const dupRows = duplicates.map(r => 
        noLocation ? [r.apartment, r.fullModule, `Строка ${r.originalRow}`] : 
                     [r.apartment, r.location, r.fullModule, `Строка ${r.originalRow}`]
      );
      const dupHeaders = noLocation ? ['Квартира', 'Модуль', 'Исходная строка'] : 
                                     ['Квартира', 'Место установки', 'Модуль', 'Исходная строка'];
      const dupWs = XLSX.utils.aoa_to_sheet([dupHeaders, ...dupRows]);
      XLSX.utils.book_append_sheet(wb, dupWs, "Дубликаты");
    }

    // Невалидные
    if (invalids.length > 0) {
      const invalidRows = invalids.map(r => 
        noLocation ? [r.apartment, r.fullModule, r.error, `Строка ${r.originalRow}`] : 
                     [r.apartment, r.location, r.fullModule, r.error, `Строка ${r.originalRow}`]
      );
      const invalidHeaders = noLocation ? ['Квартира', 'Модуль', 'Ошибка', 'Исходная строка'] : 
                                         ['Квартира', 'Место установки', 'Модуль', 'Ошибка', 'Исходная строка'];
      const invalidWs = XLSX.utils.aoa_to_sheet([invalidHeaders, ...invalidRows]);
      XLSX.utils.book_append_sheet(wb, invalidWs, "Невалидные записи");
    }

    const reportBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    setReportBlob(new Blob([reportBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
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
      const allSearchKeys = new Set(validRecords.map(r => r.searchKey));
      const foundMap = new Map(); // searchKey => { file, sheet }
      const shipmentData = []; // [{ filename, sheetname, sheet, range }]
      let totalSheets = 0;

      // Считываем и сохраняем данные отгрузок
      for (const file of files) {
        const data = await readFileAsArrayBuffer(file);
        const wb = XLSX.read(data, { type: 'array' });
        totalSheets += wb.SheetNames.length;
        for (const sheetName of wb.SheetNames) {
          const sheet = wb.Sheets[sheetName];
          if (!sheet || !sheet['!ref']) continue;
          const range = XLSX.utils.decode_range(sheet['!ref']);
          // Подсчитываем общее количество "модульных" значений на листе
          let moduleCount = 0;
          for (let r = range.s.r; r <= range.e.r; r++) {
            for (let c = range.s.c; c <= range.e.c; c++) {
              const addr = XLSX.utils.encode_cell({ r, c });
              const cell = sheet[addr];
              if (cell?.v != null) {
                const val = String(cell.v).trim();
                if (val !== '') {
                  moduleCount++;
                }
              }
            }
          }
          shipmentData.push({
            filename: file.name,
            sheetname: sheetName,
            sheet,
            range,
            totalModules: moduleCount
          });
        }
      }

      setShipmentFilesData(shipmentData);

      addLog(`Всего листов для поиска: ${shipmentData.length}`);

      // Поиск совпадений
      for (const item of shipmentData) {
        if (foundMap.size >= allSearchKeys.size) break;
        const { sheet, range, filename, sheetname } = item;
        for (let r = range.s.r; r <= range.e.r; r++) {
          for (let c = range.s.c; c <= range.e.c; c++) {
            const cell = sheet[XLSX.utils.encode_cell({ r, c })];
            if (cell?.v != null) {
              const val = String(cell.v).trim();
              const searchKey = extractLast7Digits(val);
              if (allSearchKeys.has(searchKey) && !foundMap.has(searchKey)) {
                foundMap.set(searchKey, { file: filename, sheet: sheetname });
              }
            }
          }
        }
      }

      // Определяем не найденные
      const notFound = validRecords.filter(r => !foundMap.has(r.searchKey));
      setNotFoundRecords(notFound);

      // Обновляем отчёт с информацией о найденных
      updateReportWithMatches(validRecords, foundMap, notFound, shipmentData);
      
            // === ГЕНЕРАЦИЯ output и csv ТОЛЬКО ИЗ НАЙДЕННЫХ ЗАПИСЕЙ ===
      const foundValidRecords = validRecords.filter(record => foundMap.has(record.searchKey));
      const outputRecords = foundValidRecords.map(record => ({
        ...record,
        matchInfo: foundMap.get(record.searchKey) || null
      }));

      const sorted = [...outputRecords].sort((a, b) => b.fullModule.localeCompare(a.fullModule));
      const mainWb = XLSX.utils.book_new();
      const mainRows = sorted.map(r => {
        const matchStr = r.matchInfo 
          ? `${r.matchInfo.file} — ${r.matchInfo.sheet}` 
          : 'Не найден'; // на практике этого не будет
        return noLocation 
          ? [r.apartment, r.normalized, matchStr] 
          : [r.apartment, r.location, r.normalized, matchStr];
      });
      // Убираем заголовки — передаём только данные
      const mainWs = XLSX.utils.aoa_to_sheet(mainRows);
      XLSX.utils.book_append_sheet(mainWb, mainWs, "Результат");

      const buf = XLSX.write(mainWb, { type: 'array', bookType: 'xlsx' });
      const dateTimeStr = getCurrentDateTimeString();
      const newOutputBlob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      // CSV: только найденные модули (без метаданных)
      const csvContent = foundValidRecords.map(r => `"${r.normalized}"`).join('\n');
      const bom = '\uFEFF';
      const newCsvBlob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });

      setOutputBlob(newOutputBlob);
      setCsvBlob(newCsvBlob);
      setProgress({ ...progress, step3: 100 });
      setProcessing(false);
      setStep(4);

    } catch (err) {
      addLog(`Ошибка обработки: ${err.message}`, 'error');
      setProcessing(false);
      setProgress({ ...progress, step3: 0 });
    }
  };

  const updateReportWithMatches = (validRecords, foundMap, notFoundRecords, shipmentData) => {
    const wb = XLSX.utils.book_new();
    
    // Валидные записи с результатами поиска
    if (validRecords.length > 0) {
      const resultRows = validRecords.map(r => {
        const match = foundMap.get(r.searchKey);
        const matchStr = match 
          ? `${match.file} — ${match.sheet}` 
          : 'Не найден';
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
    
    // Статистика
    const statsRows = [
      ['Статистика обработки'],
      ['Всего строк в исходном файле (после заголовков)', totalInputRows],
      ['Удалено: дубликаты', removedDuplicates],
      ['Удалено: невалидные записи', removedInvalid],
      ['Осталось валидных модулей для поиска', validRecords.length],
      ['Найдено совпадений', validRecords.length - notFoundRecords.length],
      ['Не найдено', notFoundRecords.length],
      ['Процент совпадений', `${(((validRecords.length - notFoundRecords.length) / validRecords.length) * 100).toFixed(2)}%`],
      [],
      ['Детализация по листам отгрузки']
    ];

    // Подсчет совпадений по листам
    const sheetMatchCount = new Map();
    foundMap.forEach((info, searchKey) => {
      const sheetId = `${info.file}||${info.sheet}`;
      sheetMatchCount.set(sheetId, (sheetMatchCount.get(sheetId) || 0) + 1);
    });

    // Находим общее количество модулей на каждом листе
    const sheetTotalModules = new Map();
    for (const item of shipmentData) {
      const sheetId = `${item.filename}||${item.sheetname}`;
      sheetTotalModules.set(sheetId, item.totalModules);
    }

    // Добавляем строки: "Файл — Лист" → "найдено / всего"
    for (const [sheetId, foundCount] of sheetMatchCount.entries()) {
      const total = sheetTotalModules.get(sheetId) || 0;
      const displayId = sheetId.replace('||', ' — ');
      const ratio = total > 0 ? `${foundCount} / ${total}` : `${foundCount} / ?`;
      statsRows.push([displayId, ratio]);
    }

    const statsWs = XLSX.utils.aoa_to_sheet(statsRows);
    XLSX.utils.book_append_sheet(wb, statsWs, "Статистика");
    
    // Не найденные
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
    
    // Повторно добавляем листы с проблемами
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

    // === ДОБАВЛЯЕМ ТОЛЬКО ЛИСТЫ, НА КОТОРЫХ ЕСТЬ ХОТЯ БЫ 1 СОВПАДЕНИЕ ===
    const sheetsWithMatches = new Set();
    foundMap.forEach((info) => {
      sheetsWithMatches.add(`${info.file}||${info.sheet}`);
    });

    let shipmentIndex = 1;
    for (const item of shipmentData) {
      const sheetKey = `${item.filename}||${item.sheetname}`;
      if (!sheetsWithMatches.has(sheetKey)) {
        continue; // Пропускаем листы без совпадений
      }

      const { filename, sheetname, sheet, range } = item;
      
      // Создаем копию листа
      const newSheet = {};
      const newRange = { s: { r: range.s.r, c: range.s.c }, e: { r: range.e.r, c: range.e.c + 1 } };

      // Копируем все ячейки
      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r, c });
          if (sheet[addr]) {
            newSheet[addr] = { ...sheet[addr] };
          }
        }
      }

      // Добавляем столбец с результатом поиска
      const searchCol = range.e.c + 1;
      for (let r = range.s.r; r <= range.e.r; r++) {
        let found = false;
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r, c });
          const cell = sheet[addr];
          if (cell?.v != null) {
            const val = String(cell.v).trim();
            const searchKey = extractLast7Digits(val);
            if (foundMap.has(searchKey)) {
              found = true;
              break;
            }
          }
        }
        const newAddr = XLSX.utils.encode_cell({ r, c: searchCol });
        newSheet[newAddr] = { t: 's', v: found ? 'Найден' : 'Не найден' };
      }

      // Устанавливаем новый диапазон
      newSheet['!ref'] = XLSX.utils.encode_range(newRange);

      // Добавляем заголовок для нового столбца
      if (hasHeaders && range.s.r === 0) {
        const headerAddr = XLSX.utils.encode_cell({ r: 0, c: searchCol });
        newSheet[headerAddr] = { t: 's', v: 'Результат поиска' };
      }

      // Формируем имя листа и гарантируем длину ≤ 31
      let baseName = `Отгрузки ${shipmentIndex} (${sheetname})`;
      if (baseName.length > 31) {
        const prefix = `Отгр.${shipmentIndex} (`;
        const suffix = ')';
        const available = 31 - prefix.length - suffix.length;
        if (available > 0) {
          baseName = prefix + sheetname.substring(0, available) + suffix;
        } else {
          baseName = `Отгр.${shipmentIndex}`.substring(0, 31);
        }
      }
      const sheetNameInReport = baseName;

      XLSX.utils.book_append_sheet(wb, newSheet, sheetNameInReport);
      shipmentIndex++;
    }

    const reportBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    setReportBlob(new Blob([reportBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  };

  // === УПРАВЛЕНИЕ ВИДИМОСТЬЮ ПОЛЕЙ ===

  const renderLocationControls = () => {
    if (noLocation) {
      return null;
    }
    return (
      <>
        <div className="checkbox-group" style={{ marginTop: '10px' }}>
          <label>
            <input
              type="checkbox"
              checked={locationInHeader}
              onChange={(e) => setLocationInHeader(e.target.checked)}
              disabled={processing}
            />
            Место установки указано в заголовке каждого столбца с модулями
          </label>
        </div>
        {!locationInHeader && (
          <>
            <label style={{ marginTop: '10px' }}>Место установки (один столбец, например: C):</label>
            <input
              type="text"
              value={colLocation}
              onChange={(e) => setColLocation(e.target.value)}
              maxLength="3"
              disabled={processing}
            />
          </>
        )}
      </>
    );
  };

  // === РЕНДЕР ШАГОВ ===

  const renderStep1 = () => (
    <div className="step" id="step1">
      <h3>1. Загрузите исходный Excel-файл</h3>
      <input type="file" accept=".xlsx,.xls" onChange={handleSourceFileChange} disabled={processing} />
      {progress.step1 > 0 && <ProgressBar value={progress.step1} label="Загрузка" />}
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
    <div className="step" id="step2">
      <h3>2. Укажите столбцы и настройки</h3>
      
      <div className="checkbox-group">
        <label>
          <input
            type="checkbox"
            checked={hasHeaders}
            onChange={(e) => setHasHeaders(e.target.checked)}
            disabled={processing}
          />
          Данные содержат заголовки (первая строка — заголовки)
        </label>
      </div>
      
      <label>Квартира (один столбец, например: B):</label>
      <input
        type="text"
        value={colApartment}
        onChange={(e) => setColApartment(e.target.value)}
        maxLength="3"
        disabled={processing}
      />
      
      <div className="checkbox-group" style={{ marginTop: '15px' }}>
        <label>
          <input
            type="checkbox"
            checked={noLocation}
            onChange={(e) => setNoLocation(e.target.checked)}
            disabled={processing}
          />
          Нет данных о месте установки
        </label>
      </div>

      {renderLocationControls()}
      
      <label style={{ marginTop: '15px' }}>Модули (один или несколько, например: D,E,F):</label>
      <input
        type="text"
        value={colModules}
        onChange={(e) => setColModules(e.target.value)}
        maxLength="20"
        disabled={processing}
      />
      
      <div style={{ marginTop: '15px' }}>
        <label>Формат номера модуля:</label>
        <select 
          value={selectedFormat} 
          onChange={(e) => setSelectedFormat(e.target.value)}
          style={{ 
            width: '100%', 
            padding: '8px 10px', 
            border: '1px solid #ccc', 
            borderRadius: '6px',
            fontSize: '15px',
            marginTop: '5px'
          }}
          disabled={processing}
        >
          {moduleFormats.map(format => (
            <option key={format.value} value={format.value}>
              {format.label}
            </option>
          ))}
        </select>
      </div>
      
      <button 
        className="btn-primary" 
        onClick={handleParseSource} 
        disabled={processing}
        style={{ marginTop: '15px' }}
      >
        {processing ? 'Обработка...' : 'Далее'}
      </button>
      
      {progress.step2 > 0 && <ProgressBar value={progress.step2} label="Парсинг" />}
      
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
    <div className="step" id="step3">
      <h3>3. Загрузите файл(ы) отгрузок</h3>
      <input 
        type="file" 
        accept=".xlsx,.xls" 
        multiple 
        onChange={handleProcess} 
        disabled={processing} 
      />
      <p style={{ marginTop: '15px', fontWeight: 'bold', color: '#333' }}>
        После выбора файлов начнётся обработка...
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

  return (
    <div className="registries-container" style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100%',
      overflowY: 'auto'
    }}>
      <div className="page-header">
        <h2>Реестры</h2>
        <p>Сверка реестров модулей с отгрузками</p>
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

export default Registries;