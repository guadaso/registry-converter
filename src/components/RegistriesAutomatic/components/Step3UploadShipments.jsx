// src/components/RegistriesAutomatic/Step3UploadShipments.jsx

import React, { useState, useRef, useEffect } from 'react';
import { LogEntry } from './LogEntry.jsx';
import { ProgressBar } from './ProgressBar.jsx';

const Step3UploadShipments = ({ cachedFiles, onProcess, onFileUpload, uploadedFiles, processing, progress, logs }) => {
  const [mode, setMode] = useState('new'); // 'new' | 'cached'
  const [selectedCachedFiles, setSelectedCachedFiles] = useState(new Set());

  // Реф для чекбокса "Выбрать все"
  const selectAllRef = useRef(null);

  const handleShipmentFilesUpload = (e) => {
    const files = e.target.files;
    if (files?.length) {
      onFileUpload(files);
    }
  };

  const toggleCachedFile = (name) => {
    const newSet = new Set(selectedCachedFiles);
    if (newSet.has(name)) {
      newSet.delete(name);
    } else {
      newSet.add(name);
    }
    setSelectedCachedFiles(newSet);
  };

  const toggleSelectAllCached = () => {
    if (selectedCachedFiles.size === cachedFiles.length) {
      setSelectedCachedFiles(new Set());
    } else {
      setSelectedCachedFiles(new Set(cachedFiles.map(f => f.name)));
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files?.length && /\.(xlsx|xls)$/i.test(files[0].name)) {
      onFileUpload(files);
    }
  };

  const handleDragOver = (e) => e.preventDefault();

  const handleStartProcessing = () => {
    onProcess({
      mode,
      uploadedFiles: mode === 'new' ? uploadedFiles : null,
      selectedCachedNames: mode === 'cached' ? selectedCachedFiles : new Set(),
      showCached: mode === 'cached'
    });
  };

  const canStart = mode === 'new'
    ? uploadedFiles && uploadedFiles.length > 0
    : mode === 'cached'
      ? selectedCachedFiles.size > 0
      : false;

  // Синхронизируем indeterminate через ref
  useEffect(() => {
    if (selectAllRef.current) {
      const isIndeterminate =
        selectedCachedFiles.size > 0 &&
        selectedCachedFiles.size < cachedFiles.length;
      selectAllRef.current.indeterminate = isIndeterminate;
    }
  }, [selectedCachedFiles.size, cachedFiles.length]);

  return (
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

      {/* Переключатель режима */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', margin: '15px 0' }}>
        {/* <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="radio"
            name="mode"
            checked={mode === 'new'}
            onChange={() => setMode('new')}
            style={{ marginRight: '6px' }}
          />
          Новые файлы
        </label> */}
        {/* <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="radio"
            name="mode"
            checked={mode === 'cached'}
            onChange={() => {
              setMode('cached');
              if (selectedCachedFiles.size === 0 && cachedFiles.length > 0) {
                setSelectedCachedFiles(new Set(cachedFiles.map(f => f.name)));
              }
            }}
            style={{ marginRight: '6px' }}
          />
          Из кэша ({cachedFiles.length})
        </label> */}
      </div>

      {/* Режим: Новые файлы */}
      {mode === 'new' && (
        <>
          <p>Загрузите файлы отгрузок:</p>
          <input
            type="file"
            accept=".xlsx,.xls"
            multiple
            onChange={handleShipmentFilesUpload}
            disabled={processing}
            style={{ marginTop: '10px' }}
          />
        </>
      )}

      {/* Режим: Кэш */}
      {mode === 'cached' && (
        <>
          {cachedFiles.length > 0 ? (
            <>
              <p><strong>Выберите файлы из кэша:</strong></p>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginBottom: '8px' }}>
                <input
                  ref={selectAllRef} // ← привязываем ref
                  type="checkbox"
                  checked={selectedCachedFiles.size === cachedFiles.length}
                  // УБРАЛИ indeterminate из JSX!
                  onChange={toggleSelectAllCached}
                  style={{ marginRight: '8px' }}
                />
                Выбрать все ({cachedFiles.length})
              </label>
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
                      onChange={() => toggleCachedFile(file.name)}
                      style={{ marginRight: '8px' }}
                    />
                    <span>{file.name}</span>
                    <span style={{ fontSize: '11px', color: '#777', marginLeft: '8px' }}>
                      ({new Date(file.lastModified).toLocaleString()})
                    </span>
                  </label>
                ))}
              </div>
            </>
          ) : (
            <p style={{ color: '#888', fontStyle: 'italic' }}>Нет сохранённых файлов в кэше.</p>
          )}
        </>
      )}

      <button
        className="btn-primary"
        onClick={handleStartProcessing}
        disabled={processing || !canStart}
        style={{ marginTop: '20px', padding: '10px 20px' }}
      >
        Начать обработку
      </button>

      <p style={{ marginTop: '15px', fontWeight: 'bold', color: '#333', fontSize: '14px' }}>
        После нажатия начнётся поиск совпадений...
      </p>

      {progress > 0 && <ProgressBar value={progress} label="Поиск совпадений" />}

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
        {logs.map((log, i) => <LogEntry key={i} log={log} />)}
      </div>
    </div>
  );
};

export default Step3UploadShipments;