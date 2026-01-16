import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';

const REQUIRED_FIELDS = [
  '№ письма',
  'Дата регистрации/отправки',
  'Получатель',
  'Адрес получателя',
  'Содержание/доп. информация',
  'Отправитель'
];

// === Настройки Google Таблицы ===
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1iF7VRUqMGde1vKDez9yxN1pRhMa1eLln7aY81Xw8lS0/gviz/tq?tqx=out:csv&gid=0';
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyS27_Ju5isrTaqxjxn4NlAmrYcuus1FlhV3oLVuLkg0ZN3MVo2-cwYIGvf0cPNnHrH/exec';

export default function Mails() {
  const [step, setStep] = useState('list');
  const [file, setFile] = useState(null);
  const [previewContent, setPreviewContent] = useState('');
  const [selectedRanges, setSelectedRanges] = useState([]);
  const [templateName, setTemplateName] = useState('');
  const [staticFields, setStaticFields] = useState({
    sheetsCount: '1',
    letterType: ''
  });
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [formData, setFormData] = useState({});
  const [outputFileName, setOutputFileName] = useState('');
  const [bitrixLink, setBitrixLink] = useState('');

  const previewRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem('mail_templates');
    if (saved) {
      try {
        setTemplates(JSON.parse(saved));
      } catch (e) {
        console.error('Ошибка загрузки шаблонов', e);
      }
    }
  }, []);

  // === Google Sheets ===

  const fetchLastLetterNumber = async () => {
    try {
      const response = await fetch(SHEET_CSV_URL);
      const text = await response.text();
      const lines = text.split('\n').filter(line => line.trim());
      if (lines.length <= 1) return '1';
      const lastLine = lines[lines.length - 1];
      const columns = lastLine.split(',');
      const lastNumberStr = columns[0]?.replace(/"/g, '').trim();
      const lastNumber = parseInt(lastNumberStr, 10);
      return isNaN(lastNumber) ? '1' : String(lastNumber + 1);
    } catch (err) {
      console.error('Ошибка чтения номера письма:', err);
      return '1';
    }
  };

  const fetchLastRegistryNumber = async () => {
    try {
      const response = await fetch(SHEET_CSV_URL);
      const text = await response.text();
      const lines = text.split('\n').filter(line => line.trim());
      let lastNum = 0;
      for (let i = lines.length - 1; i >= 1; i--) {
        const columns = lines[i].split(',');
        const content = columns[8]?.replace(/"/g, '') || '';
        if (content.startsWith('Реестр')) {
          const match = content.match(/Реестр\s+(\d+)/);
          if (match) {
            lastNum = parseInt(match[1], 10);
            break;
          }
        }
      }
      return lastNum + 1;
    } catch (err) {
      console.error('Ошибка чтения реестра:', err);
      return 1;
    }
  };

  const generateRegistryContent = async (baseContent) => {
    if (!baseContent.trim().toLowerCase().startsWith('реестр')) {
      return baseContent;
    }
    const nextNum = await fetchLastRegistryNumber();
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    return `Реестр ${nextNum}/${month} от ${day}.${month}.${year}`;
  };

  const appendToSheet = async (data) => {
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      mode: 'cors', // явно указываем
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('HTTP error ' + response.status);
  } catch (err) {
    console.error('Ошибка записи в Google Таблицу:', err);
    alert('Не удалось сохранить запись в таблицу.');
    throw err;
  }
};

  // === Обработка файла ===

  const handleFileChange = async (e) => {
    const uploadedFile = e.target.files[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    let content = '';

    try {
      if (uploadedFile.name.endsWith('.docx')) {
        const arrayBuffer = await uploadedFile.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        content = result.value;
      } else if (uploadedFile.name.endsWith('.xlsx') || uploadedFile.name.endsWith('.xls')) {
        const data = await uploadedFile.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        let sheetsText = '';
        workbook.SheetNames.forEach((sheetName) => {
          const worksheet = workbook.Sheets[sheetName];
          const csv = XLSX.utils.sheet_to_csv(worksheet);
          sheetsText += `=== ${sheetName} ===\n${csv}\n\n`;
        });
        content = sheetsText;
      } else {
        alert('Поддерживаются только .docx и .xlsx файлы');
        return;
      }

      setPreviewContent(content);
      setSelectedRanges([]);
      setStep('select');
    } catch (err) {
      console.error(err);
      alert('Ошибка при обработке файла');
    }
  };

  const handlePreviewMouseUp = () => {
    if (step !== 'select') return;
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    if (!selectedText) return;
    if (selectedRanges.some(r => r.text === selectedText)) return;

    setSelectedRanges(prev => [...prev, { text: selectedText }]);
    highlightText(selectedText);
    selection.removeAllRanges();
  };

  const highlightText = (text) => {
    const container = previewRef.current;
    if (!container) return;

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (parent?.classList?.contains('highlight')) continue;
      const index = node.nodeValue?.indexOf(text);
      if (index !== -1) {
        const span = document.createElement('span');
        span.className = 'highlight';
        span.textContent = text;
        const before = document.createTextNode(node.nodeValue.substring(0, index));
        const after = document.createTextNode(node.nodeValue.substring(index + text.length));
        parent.insertBefore(before, node);
        parent.insertBefore(span, node);
        parent.insertBefore(after, node);
        parent.removeChild(node);
        break;
      }
    }
  };

  const resetSelection = () => {
    setSelectedRanges([]);
    if (previewRef.current) {
      previewRef.current.innerHTML = previewContent
        .replace(/\n/g, '<br />')
        .replace(/ {2}/g, '&nbsp;&nbsp;');
    }
  };

  const confirmSelection = () => {
    if (selectedRanges.length === 0) {
      alert('Сначала выделите хотя бы один фрагмент');
      return;
    }
    const initialMappings = selectedRanges.map(r => ({
      fragment: r.text,
      variable: ''
    }));
    setVariables(initialMappings);
    setStep('map');
  };

  const [variables, setVariables] = useState([]);

  const handleVariableSelect = (index, value) => {
    const newVars = [...variables];
    newVars[index].variable = value;
    setVariables(newVars);
  };

  const handleSubmitTemplate = () => {
    if (!templateName.trim()) {
      alert('Введите название шаблона');
      return;
    }
    if (!staticFields.letterType.trim()) {
      alert('Укажите тип письма');
      return;
    }
    if (variables.some(v => !v.variable.trim())) {
      alert('Сопоставьте все выделенные фрагменты с полями');
      return;
    }

    const templateData = {
      id: Date.now(),
      templateName: templateName.trim(),
      fileName: file.name,
      fileType: file.name.endsWith('.docx') ? 'docx' : 'xlsx',
      staticFields: {
        sheetsCount: staticFields.sheetsCount,
        letterType: staticFields.letterType.trim()
      },
      mappings: variables.map(v => ({
        fragment: v.fragment,
        variable: v.variable
      }))
    };

    const updatedTemplates = [...templates, templateData];
    setTemplates(updatedTemplates);
    localStorage.setItem('mail_templates', JSON.stringify(updatedTemplates));

    alert('Шаблон успешно сохранён!');
    resetAll();
  };

  const resetAll = () => {
    setFile(null);
    setPreviewContent('');
    setSelectedRanges([]);
    setTemplateName('');
    setStaticFields({ sheetsCount: '1', letterType: '' });
    setVariables([]);
    setStep('list');
  };

  const startNewTemplate = () => {
    setStep('upload');
  };

  const selectTemplate = async (tpl) => {
    setSelectedTemplate(tpl);
    const nextNumber = await fetchLastLetterNumber();
    const today = new Date().toISOString().split('T')[0];

    const initialData = {};
    tpl.mappings.forEach(m => {
      if (m.variable === '№ письма') {
        initialData[m.variable] = nextNumber;
      } else if (m.variable === 'Дата регистрации/отправки') {
        initialData[m.variable] = today;
      } else {
        initialData[m.variable] = '';
      }
    });

    setFormData(initialData);
    setBitrixLink('');
    updateOutputFileName(tpl, initialData, today);
    setStep('generate');
  };

  const handleGenerateInputChange = async (field, value) => {
    let newValue = value;
    if (field === 'Содержание/доп. информация') {
      newValue = await generateRegistryContent(value);
    }
    const newData = { ...formData, [field]: newValue };
    setFormData(newData);
    const date = formData['Дата регистрации/отправки'] || new Date().toISOString().split('T')[0];
    updateOutputFileName(selectedTemplate, newData, date);
  };

  const updateOutputFileName = (tpl, data, dateStr) => {
    const recipient = data['Адрес получателя'] || 'получатель';
    const type = tpl.staticFields.letterType;
    const dateFormatted = dateStr.split('-').reverse().join('.');
    const name = `${type} ${recipient} ${dateFormatted}`.replace(/[<>:"/\\|?*]/g, '_');
    setOutputFileName(name);
  };

  const replaceInDocx = async (file, replacements) => {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    let html = result.value;

    // Простая замена текста
    Object.entries(replacements).forEach(([key, value]) => {
      const mapping = selectedTemplate.mappings.find(m => m.variable === key);
      if (mapping) {
        const regex = new RegExp(mammoth.escapeRegExp(mapping.fragment), 'g');
        html = html.replace(regex, String(value || ''));
      }
    });

    // Создаём новый .docx (упрощённо — через blob с HTML)
    const blob = new Blob([html], { type: 'text/html' });
    return blob;
  };

  const replaceInXlsx = async (file, replacements) => {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });

    workbook.SheetNames.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = { c: C, r: R };
          const cellRef = XLSX.utils.encode_cell(cellAddress);
          const cell = worksheet[cellRef];
          if (cell && cell.t === 's') {
            let cellValue = cell.v;
            selectedTemplate.mappings.forEach(mapping => {
              const replacement = replacements[mapping.variable];
              if (replacement !== undefined && cellValue.includes(mapping.fragment)) {
                cellValue = cellValue.replace(new RegExp(mammoth.escapeRegExp(mapping.fragment), 'g'), String(replacement));
              }
            });
            cell.v = cellValue;
          }
        }
      }
    });

    const output = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    return new Blob([output], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  };

  const handleGenerateSubmit = async () => {
    // Валидация
    for (const mapping of selectedTemplate.mappings) {
      if (mapping.variable && !formData[mapping.variable]?.trim()) {
        alert(`Заполните поле: ${mapping.variable}`);
        return;
      }
    }

    // Подготовка данных для таблицы
    const sheetData = {
      letterNumber: formData['№ письма'] || '',
      date: formData['Дата регистрации/отправки'] || '',
      recipient: formData['Получатель'] || '',
      address: formData['Адрес получателя'] || '',
      content: formData['Содержание/доп. информация'] || '',
      sheets: selectedTemplate.staticFields.sheetsCount,
      sender: formData['Отправитель'] || '',
      type: selectedTemplate.staticFields.letterType
    };

    // Запись в Google Таблицу
    await appendToSheet(sheetData);

    // Генерация файла
    let blob;
    try {
      if (selectedTemplate.fileType === 'docx') {
        blob = await replaceInDocx(file, formData);
      } else {
        blob = await replaceInXlsx(file, formData);
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = outputFileName + (selectedTemplate.fileType === 'docx' ? '.docx' : '.xlsx');
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 0);
    } catch (err) {
      console.error('Ошибка генерации документа:', err);
      alert('Не удалось сгенерировать файл');
      return;
    }

    alert('✅ Документ успешно сформирован и скачан!');
    setStep('list');
  };

  // === Рендеринг ===

  if (step === 'list') {
    return (
      <div className="mails-container">
        <h2>Шаблоны писем</h2>
        <button onClick={startNewTemplate} style={{ marginBottom: '15px' }}>
          Создать новый шаблон
        </button>
        {templates.length === 0 ? (
          <p>Нет сохранённых шаблонов</p>
        ) : (
          <ul>
            {templates.map(tpl => (
              <li key={tpl.id} style={{ margin: '10px 0' }}>
                <strong>{tpl.templateName}</strong> ({tpl.staticFields.letterType})
                <button
                  onClick={() => selectTemplate(tpl)}
                  style={{ marginLeft: '10px' }}
                >
                  Использовать
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (step === 'upload') {
    return (
      <div>
        <h2>Добавить шаблон письма (.docx или .xlsx)</h2>
        <input type="file" accept=".docx,.xlsx,.xls" onChange={handleFileChange} />
      </div>
    );
  }

  if (step === 'select') {
    return (
      <div>
        <h2>Выделите фрагменты для замены</h2>
        <div
          ref={previewRef}
          className="preview"
          onMouseUp={handlePreviewMouseUp}
          style={{
            whiteSpace: 'pre-wrap',
            border: '1px solid #ccc',
            padding: '10px',
            minHeight: '200px',
            userSelect: 'text'
          }}
          dangerouslySetInnerHTML={{
            __html: previewContent
              .replace(/\n/g, '<br />')
              .replace(/ {2}/g, '&nbsp;&nbsp;')
          }}
        />
        <div style={{ marginTop: '10px' }}>
          <button onClick={resetSelection}>Сбросить выделение</button>
          <button onClick={confirmSelection} style={{ marginLeft: '10px' }}>
            Подтвердить выделение
          </button>
        </div>
      </div>
    );
  }

  if (step === 'map') {
    return (
      <div>
        <h2>Сопоставьте выделенные фрагменты с полями</h2>

        <div style={{ marginBottom: '15px' }}>
          <input
            type="text"
            placeholder="Название шаблона"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            style={{ width: '100%', padding: '8px', fontSize: '16px' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label>Тип письма (статично): </label>
          <input
            type="text"
            value={staticFields.letterType}
            onChange={(e) => setStaticFields({ ...staticFields, letterType: e.target.value })}
            placeholder="Например: Исходящее"
            style={{ width: '100%', padding: '8px' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label>Количество листов (статично): </label>
          <input
            type="number"
            min="1"
            value={staticFields.sheetsCount}
            onChange={(e) => setStaticFields({ ...staticFields, sheetsCount: e.target.value })}
            style={{ width: '100px', padding: '6px' }}
          />
        </div>

        {variables.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
            <div
              style={{
                backgroundColor: '#e9ecef',
                padding: '6px 10px',
                borderRadius: '4px',
                minWidth: '150px',
                wordBreak: 'break-word'
              }}
            >
              {item.fragment}
            </div>
            <span style={{ margin: '0 10px' }}>→</span>
            <select
              value={item.variable}
              onChange={(e) => handleVariableSelect(idx, e.target.value)}
              style={{ flex: 1, padding: '6px' }}
            >
              <option value="">Выберите поле...</option>
              {REQUIRED_FIELDS.map(field => (
                <option key={field} value={field}>{field}</option>
              ))}
              <option value={`custom_${idx}`}>Своя переменная</option>
            </select>
            {item.variable.startsWith('custom_') && (
              <input
                type="text"
                placeholder="Имя переменной"
                style={{ marginLeft: '10px', flex: 1, padding: '6px' }}
                onBlur={(e) => {
                  if (e.target.value.trim()) {
                    handleVariableSelect(idx, e.target.value.trim());
                  }
                }}
              />
            )}
          </div>
        ))}

        <div style={{ marginTop: '20px' }}>
          <button onClick={() => setStep('select')}>Назад</button>
          <button
            onClick={handleSubmitTemplate}
            style={{ marginLeft: '10px', backgroundColor: '#28a745', color: 'white' }}
          >
            Сохранить шаблон
          </button>
        </div>
      </div>
    );
  }

  if (step === 'generate') {
    return (
      <div>
        <h2>Создание письма по шаблону: {selectedTemplate?.templateName}</h2>

        {selectedTemplate?.mappings.map((mapping, idx) => (
          <div key={idx} style={{ marginBottom: '12px' }}>
            <label>{mapping.variable}:</label>
            <input
              type={mapping.variable.includes('Дата') ? 'date' : 'text'}
              value={formData[mapping.variable] || ''}
              onChange={(e) => handleGenerateInputChange(mapping.variable, e.target.value)}
              style={{ width: '100%', padding: '6px', marginTop: '4px' }}
            />
          </div>
        ))}

        <div style={{ marginBottom: '12px' }}>
          <label>Ссылка на Битрикс (необязательно):</label>
          <input
            type="url"
            value={bitrixLink}
            onChange={(e) => setBitrixLink(e.target.value)}
            placeholder="https://..."
            style={{ width: '100%', padding: '6px', marginTop: '4px' }}
          />
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label>Имя выходного файла:</label>
          <input
            type="text"
            value={outputFileName}
            onChange={(e) => setOutputFileName(e.target.value)}
            style={{ width: '100%', padding: '6px', marginTop: '4px' }}
          />
        </div>

        <div style={{ marginTop: '20px' }}>
          <button onClick={() => setStep('list')}>Отмена</button>
          <button
            onClick={handleGenerateSubmit}
            style={{ marginLeft: '10px', backgroundColor: '#007bff', color: 'white' }}
          >
            Сформировать документ
          </button>
        </div>
      </div>
    );
  }

  return null;

  return (
    <>
      <style>{`
        .highlight {
          background-color: yellow;
          padding: 1px 2px;
        }
        .mails-container {
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }
      `}</style>
    </>
  );
}

// Добавляем escapeRegExp в mammoth, если его нет
if (typeof mammoth.escapeRegExp !== 'function') {
  mammoth.escapeRegExp = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };
}