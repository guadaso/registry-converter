import React, { useState, useRef } from 'react';

// Импортируем библиотеки
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';

export default function Mails() {
  const [file, setFile] = useState(null);
  const [previewContent, setPreviewContent] = useState('');
  const [selectedRanges, setSelectedRanges] = useState([]); // [{start: ..., end: ..., text: ...}]
  const [templateName, setTemplateName] = useState('');
  const [variables, setVariables] = useState([]); // [{fragment: '...', variableName: ''}]
  const [step, setStep] = useState('upload'); // 'upload' | 'select' | 'map'
  const previewRef = useRef(null);

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

  const handlePreviewMouseDown = (e) => {
    if (step !== 'select') return;
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    // Очистим предыдущее выделение при новом начале (опционально)
    // Здесь позволим множественное выделение
  };

  const handlePreviewMouseUp = () => {
    if (step !== 'select') return;
    const selection = window.getSelection();
    if (selection.toString().trim() === '') return;

    const range = selection.getRangeAt(0);
    const selectedText = selection.toString().trim();

    // Проверим, не пересекается ли с уже выделенным
    const alreadyExists = selectedRanges.some(r => r.text === selectedText);
    if (alreadyExists) return;

    // Сохраним диапазон по тексту (упрощённо — по тексту, а не по DOM)
    setSelectedRanges(prev => [...prev, { text: selectedText }]);
    
    // Подсветим в превью
    highlightText(selectedText);
    selection.removeAllRanges();
  };

  const highlightText = (text) => {
    const container = previewRef.current;
    if (!container) return;

    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

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
        break; // выделяем первое совпадение
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
    setVariables(selectedRanges.map(r => ({ fragment: r.text, variableName: '' })));
    setStep('map');
  };

  const handleVariableChange = (index, value) => {
    const newVars = [...variables];
    newVars[index].variableName = value;
    setVariables(newVars);
  };

  const handleSubmitTemplate = () => {
    if (!templateName.trim()) {
      alert('Введите название шаблона');
      return;
    }
    if (variables.some(v => !v.variableName.trim())) {
      alert('Заполните все названия переменных');
      return;
    }

    const templateData = {
      templateName: templateName.trim(),
      fileName: file.name,
      mappings: variables.map(v => ({
        fragment: v.fragment,
        variable: v.variableName.trim()
      }))
    };

    console.log('Сформированный JSON:', JSON.stringify(templateData, null, 2));
    alert('Шаблон успешно создан! См. консоль.');
    
    // Сброс
    setFile(null);
    setPreviewContent('');
    setSelectedRanges([]);
    setTemplateName('');
    setVariables([]);
    setStep('upload');
  };

  // Инициализация превью при смене контента
  React.useEffect(() => {
    if (previewContent && step === 'select') {
      resetSelection(); // Обновляем HTML без подсветки
    }
  }, [previewContent, step]);

  return (
    <div className="mails-container">
      {step === 'upload' && (
        <div>
          <h2>Добавить шаблон письма</h2>
          <input type="file" accept=".docx,.xlsx,.xls" onChange={handleFileChange} />
        </div>
      )}

      {step === 'select' && (
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
      )}

      {step === 'map' && (
        <div>
          <h2>Сопоставьте выделенные фрагменты с переменными</h2>
          <div style={{ marginBottom: '15px' }}>
            <input
              type="text"
              placeholder="Название шаблона"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              style={{ width: '100%', padding: '8px', fontSize: '16px' }}
            />
          </div>

          {variables.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
              <div
                style={{
                  backgroundColor: '#fff3cd',
                  padding: '6px 10px',
                  borderRadius: '4px',
                  minWidth: '150px',
                  wordBreak: 'break-word'
                }}
              >
                {item.fragment}
              </div>
              <span style={{ margin: '0 10px' }}>→</span>
              <input
                type="text"
                placeholder={`Переменная ${idx + 1}`}
                value={item.variableName}
                onChange={(e) => handleVariableChange(idx, e.target.value)}
                style={{ flex: 1, padding: '6px' }}
              />
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
      )}

      {/* Стили для подсветки */}
      <style>{`
        .highlight {
          background-color: yellow;
          padding: 1px 2px;
        }
      `}</style>
    </div>
  );
}