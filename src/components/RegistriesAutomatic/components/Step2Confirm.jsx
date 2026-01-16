// src/components/RegistriesAutomatic/Step2Confirm.jsx

import React from 'react';
import { LogEntry } from './LogEntry.jsx';

const Step2Confirm = ({ onContinue, logs, processing }) => {
  return (
    <div className="step" id="step2" style={{ textAlign: 'center' }}>
      <h3>Анализ завершён</h3>
      <p>Файл успешно обработан. Нажмите «Начать», чтобы загрузить файлы отгрузок.</p>
      <button
        className="btn-primary"
        onClick={onContinue}
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
      </div>
    </div>
  );
};

export default Step2Confirm;