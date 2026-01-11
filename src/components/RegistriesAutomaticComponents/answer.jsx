// src/components/RegistriesAutomaticComponents/answer.js
import React from 'react';

export const getCurrentDateTimeString = () => {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
};

export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const renderStep4 = ({ outputBlob, csvBlob, reportBlob, totalInputRows, removedDuplicates, removedInvalid, validRecords, notFoundRecords, getCurrentDateTimeString, downloadBlob, noLocation, foundMapRef, sheetSearchKeyMapRef }) => {
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
          <li>Одиночные/парные совпадения (исключены): <strong>{validRecords.length - notFoundRecords.length - validRecords.filter(r => {
            const info = foundMapRef?.current?.get(r.searchKey);
            if (!info) return false;
            const sheetId = `${info.file}||${info.sheet}`;
            return sheetSearchKeyMapRef?.current?.get(sheetId)?.size >= 3;
          }).length || 0}</strong></li>
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