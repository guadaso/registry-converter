// src/components/RegistriesAutomaticComponents/Logging.js
import React from 'react';

export const addLog = (message, type = 'info', setLogs) => {
  setLogs(prev => [...prev, { message, type, timestamp: new Date().toLocaleTimeString() }]);
};

export const ProgressBar = ({ value, label }) => (
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

export const LogEntry = ({ log }) => {
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