// src/components/RegistriesAutomatic/Step3UploadShipments.jsx

import React, { useState } from 'react';
import { LogEntry } from './LogEntry.jsx';
import { ProgressBar } from './ProgressBar.jsx'; // если вынесете ProgressBar тоже

const Step3UploadShipments = ({ cachedFiles, onProcess, onFileUpload, uploadedFiles, processing, progress, logs }) => {
  const [showCachedFiles, setShowCachedFiles] = useState(false);
  const [selectedCachedFiles, setSelectedCachedFiles] = useState(new Set(cachedFiles.map(f => f.name)));

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
      uploadedFiles,
      selectedCachedNames: selectedCachedFiles,
      showCached: showCachedFiles
    });
  };

  const canStart = uploadedFiles ||
    (showCachedFiles && selectedCachedFiles.size > 0);

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

      <p>Выберите новые файлы:</p>
      <input
        type="file"
        accept=".xlsx,.xls"
        multiple
        onChange={handleShipmentFilesUpload}
        disabled={processing}
        style={{ marginTop: '10px' }}
      />

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

      {showCachedFiles && cachedFiles.length > 0 && (
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
        </div>
      )}

      {showCachedFiles && cachedFiles.length === 0 && (
        <p style={{ color: '#888', fontStyle: 'italic', marginTop: '10px' }}>Нет сохранённых файлов.</p>
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