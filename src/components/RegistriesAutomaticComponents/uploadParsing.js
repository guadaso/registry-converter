// src/components/RegistriesAutomaticComponents/uploadParsing.js
import * as XLSX from 'xlsx';

export const extractLast7Digits = (str) => {
  const digits = str.replace(/\D/g, '');
  if (digits.length === 0) return str.trim();
  return digits.slice(-7).padStart(7, '0');
};

export const normalizeLocation = (loc) => {
  if (!loc) return '';
  const originalTrimmed = loc.trim();
  const l = originalTrimmed.toLowerCase();

  if (/кух(ня|\.|)/.test(l)) return 'кух.';
  if (/санузел|с[\/\\]у|с\.у\.|сан/.test(l)) return 'с/у';
  if (/ввод/.test(l)) return 'Ввод';

  return originalTrimmed;
};

export const validateModuleFormat = (module, format) => {
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

export const readFileAsArrayBuffer = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

export const isValidApartmentColumn = (values) => {
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

export const isTypicalLocationValue = (val) => {
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
};

export const handleSourceFile = async (file, setLogs, setSourceFile, addLog, setProgress, progress, sourceWorkbookRef, autoDetectedConfigRef, setStep) => {
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

    // Считываем все строки как есть
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

    // === НОВАЯ ЛОГИКА: ПРОВЕРКА И УДАЛЕНИЕ ПЕРВЫХ СТРОК (1–4), ЕСЛИ ТАМ НЕТ МОДУЛЕЙ ===
    const moduleFormats = [
      { key: '04B6481958134315', regex: /^04B\d{13}$/ },
      { key: '6ZRI8911468998', regex: /^\dZRI\d{10}$/ },
      { key: '25003162', regex: /^\d{8}$/ },
      { key: '860751078007207', regex: /^\d{15}$/ },
      { key: '2025 4356945', regex: /^(202[0-9]|2030) \d{7}$/ }
    ];

    const hasModuleInRow = (row) => {
      return row.some(cell => {
        if (!cell) return false;
        const clean = cell.replace(/В/g, 'B');
        return moduleFormats.some(fmt => fmt.regex.test(clean));
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

    // === ДАЛЬНЕЙШАЯ ОБРАБОТКА НА ОСНОВЕ cleanedRows ===
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
    const numCols = Math.max(...cleanedRows.map(r => r.length));

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

      // Места установки
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

export const handleSourceFileChange = (e, handleSourceFile, setLogs, setSourceFile, addLog, setProgress, progress, sourceWorkbookRef, autoDetectedConfigRef, setStep) => {
  const file = e.target.files[0];
  if (file) handleSourceFile(file, setLogs, setSourceFile, addLog, setProgress, progress, sourceWorkbookRef, autoDetectedConfigRef, setStep);
};

export const handleStart = (setStep) => {
  setStep(3);
};

export const handleDragOver = (e) => {
  e.preventDefault();
};

export const handleDrop = (e, step, handleSourceFile, setLogs, setSourceFile, addLog, setProgress, progress, sourceWorkbookRef, autoDetectedConfigRef, setUploadedFilesForProcessing, setStep) => {
  e.preventDefault();
  const files = e.dataTransfer.files;
  if (files && files.length > 0) {
    const file = files[0];
    if (step === 1 && /\.(xlsx|xls)$/i.test(file.name)) {
      handleSourceFile(file, setLogs, setSourceFile, addLog, setProgress, progress, sourceWorkbookRef, autoDetectedConfigRef, setStep);
    } else if (step === 3 && /\.(xlsx|xls)$/i.test(files[0].name)) {
      setUploadedFilesForProcessing(files);
      addLog(`Перетащено ${files.length} файл(ов). Нажмите "Начать".`, 'info');
    }
  }
};