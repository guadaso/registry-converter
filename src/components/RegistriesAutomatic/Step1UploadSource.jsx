// src/components/RegistriesAutomatic/Step1UploadSource.jsx

import React from 'react';

const ProgressBar = ({ value, label }) => (
  <div className="progress-container" style={{ marginTop: '10px' }}>
    <div className="progress-bar" style={{ height: '10px', backgroundColor: '#e0e0e0', borderRadius: '5px', overflow: 'hidden' }}>
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
      color,
      fontSize: '13px',
      fontFamily: 'monospace'
    }}>
      [{log.timestamp}] {log.message}
    </div>
  );
};

const Step1UploadSource = ({ onFileSelect, progress, logs, processing }) => {
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) onFileSelect(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && /\.(xlsx|xls)$/i.test(file.name)) {
      onFileSelect(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  return (
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
        onChange={handleFileChange}
        disabled={processing}
        style={{ marginTop: '10px' }}
      />
      {progress > 0 && <ProgressBar value={progress} label="Анализ файла" />}
      <div className="logs-container" style={{
        maxHeight: '150px',
        overflowY: 'auto',
        border: '1px solid #eee',
        borderRadius: '6px',
        marginTop: '15px',
        padding: '5px'
      }}>
        {logs.map((log, i) => <LogEntry key={i} log={log} />)}
      </div>
    </div>
  );
};

export default Step1UploadSource;