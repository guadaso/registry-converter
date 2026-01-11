// src/components/RegistriesAutomaticComponents/visual.jsx
import React from 'react';

export const renderStep1 = ({ handleDragOver, handleDrop, handleSourceFileChange, processing, progress, logs, logsEndRef, LogEntry, ProgressBar }) => (
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

export const renderStep2 = ({ handleStart, processing, logs, logsEndRef, LogEntry }) => (
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

export const renderStep3 = ({ handleDragOver, handleDrop, handleShipmentFilesUpload, setUploadedFilesForProcessing, addLog, processing, showCachedFiles, setShowCachedFiles, cachedFiles, selectedCachedFiles, setSelectedCachedFiles, uploadedFilesForProcessing, handleStartProcessing, progress, logs, logsEndRef, LogEntry, ProgressBar }) => (
  <div
    className="step"
    id="step3"
    onDragOver={handleDragOver}
    onDrop={(e) => {
      e.preventDefault();
      const files = e.dataTransfer.files;
      if (files && files.length > 0 && /\.(xlsx|xls)$/i.test(files[0].name)) {
        setUploadedFilesForProcessing(files);
        addLog(`Перетащено ${files.length} файл(ов). Нажмите "Начать".`, 'info');
      }
    }}
    style={{
      border: '2px dashed #ccc',
      borderRadius: '8px',
      padding: '20px',
      textAlign: 'center',
      backgroundColor: '#fafafa'
    }}
  >
    <h3>2. Загрузите файл(ы) отгрузок</h3>

    {/* Загрузка новых файлов */}
    <p>Выберите новые файлы:</p>
    <input
      type="file"
      accept=".xlsx,.xls"
      multiple
      onChange={handleShipmentFilesUpload}
      disabled={processing}
      style={{ marginTop: '10px' }}
    />

    {/* Галочка показа кэша */}
    <div style={{ marginTop: '20px', textAlign: 'left' }}>
      <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={showCachedFiles}
          onChange={(e) => setShowCachedFiles(e.target.checked)}
          style={{ marginRight: '8px' }}
        />
        Показать сохранённые файлы отгрузок ({cachedFiles.length})
      </label>
    </div>

    {/* Список кэшированных файлов */}
    {showCachedFiles && cachedFiles.length > 0 ? (
      <div style={{ marginTop: '15px', textAlign: 'left' }}>
        <p><strong>Сохранённые файлы (выберите нужные):</strong></p>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            maxHeight: '200px',
            overflowY: 'auto',
            padding: '8px',
            border: '1px solid #eee',
            borderRadius: '6px',
            backgroundColor: '#fff'
          }}
        >
          {cachedFiles.map((file) => (
            <label key={file.name} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={selectedCachedFiles.has(file.name)}
                onChange={(e) => {
                  const newSet = new Set(selectedCachedFiles);
                  if (e.target.checked) {
                    newSet.add(file.name);
                  } else {
                    newSet.delete(file.name);
                  }
                  setSelectedCachedFiles(newSet);
                }}
                style={{ marginRight: '8px' }}
              />
              <span>{file.name}</span>
              <span style={{ fontSize: '11px', color: '#777', marginLeft: '8px' }}>
                ({new Date(file.lastModified).toLocaleString()})
              </span>
            </label>
          ))}
        </div>
      </div>
    ) : null}

    {showCachedFiles && cachedFiles.length === 0 ? (
      <p style={{ color: '#888', fontStyle: 'italic', marginTop: '10px' }}>Нет сохранённых файлов.</p>
    ) : null}

    {/* Кнопка "Начать" */}
    <button
      className="btn-primary"
      onClick={handleStartProcessing}
      disabled={
        processing ||
        (!uploadedFilesForProcessing && (!showCachedFiles || selectedCachedFiles.size === 0))
      }
      style={{ marginTop: '20px', padding: '10px 20px' }}
    >
      Начать обработку
    </button>

    <p style={{ marginTop: '15px', fontWeight: 'bold', color: '#333', fontSize: '14px' }}>
      После нажатия начнётся поиск совпадений...
    </p>

    {progress.step3 > 0 && <ProgressBar value={progress.step3} label="Поиск совпадений" />}

    <div
      className="logs-container"
      style={{
        maxHeight: '150px',
        overflowY: 'auto',
        border: '1px solid #eee',
        borderRadius: '6px',
        marginTop: '15px',
        padding: '5px',
        backgroundColor: '#fcfcfc'
      }}
    >
      {logs.map((log, i) => (
        <LogEntry key={i} log={log} />
      ))}
      <div ref={logsEndRef} />
    </div>
  </div>
);