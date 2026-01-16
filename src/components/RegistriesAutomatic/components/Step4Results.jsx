// src/components/RegistriesAutomatic/Step4Results.jsx
import React, { useState } from 'react';
import Step5InputProcessor from './Step5InputProcessor.jsx';

const Step4Results = ({
    outputBlob,
    csvBlob,
    reportBlob,
    totalInputRows,
    removedDuplicates,
    removedInvalid,
    validRecords,
    notFoundRecords,
    onDownload,
    singletonRecords = [],
    onShowInputProcessor // ← Новый проп
}) => {
    const foundCount = validRecords.length - notFoundRecords.length;

    const [showInputProcessor, setShowInputProcessor] = useState(false);

    return (
        <div className="step" id="step4" style={{ textAlign: 'center' }}>
            <h3>Готово!</h3>
            <p>Файлы обработаны и готовы к скачиванию.</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '15px' }}>
                <button className="btn-primary" onClick={() => onDownload(outputBlob, 'output')}>Скачать результат</button>
                <button className="btn-primary" onClick={() => onDownload(csvBlob, 'export')}>Скачать CSV</button>
                <button className="btn-primary" onClick={() => onDownload(reportBlob, 'report')}>Скачать отчет</button>
                <button
                    className="btn-secondary"
                    onClick={() => setShowInputProcessor(true)}
                    style={{ padding: '6px 12px' }}
                >
                    🔄 Обработать import.xlsx
                </button>
            </div>

            {showInputProcessor && (
                <div style={{ marginTop: '20px' }}>
                    <Step5InputProcessor
                        outputData={validRecords} // передаём массив объектов { apartment, location, normalized }
                        onProcessComplete={(blob) => {
                            // Скачиваем обработанный файл
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `import_${new Date().toISOString().slice(0, 10)}.xlsx`;
                            a.click();
                            URL.revokeObjectURL(url);
                            setShowInputProcessor(false);
                        }}
                        onCancel={() => setShowInputProcessor(false)}
                    />
                </div>
            )}

            <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '8px', textAlign: 'left' }}>
                <h4>Итоговая статистика:</h4>
                <ul>
                    <li>Всего строк в исходном файле: <strong>{totalInputRows}</strong></li>
                    <li>Всего номеров модулей в исходном файле: <strong>{removedDuplicates + removedInvalid + validRecords.length}</strong></li>
                    <li>Удалено дубликатов: <strong>{removedDuplicates}</strong></li>
                    <li>Удалено невалидных записей: <strong>{removedInvalid}</strong></li>
                    <li>Валидных модулей для поиска: <strong>{validRecords.length}</strong></li>
                    <li>Найдено совпадений: <strong>{foundCount}</strong></li>
                    <li>Удалено модулей с неверных листов отгрузок: <strong>{singletonRecords.length}</strong></li>
                    <li>Не найдено: <strong>{notFoundRecords.length}</strong></li>
                </ul>

                {(removedDuplicates > 0 || removedInvalid > 0) && (
                    <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#fff8e1', borderRadius: '6px' }}>
                        <h5 style={{ color: '#ff8f00' }}>Удалённые записи:</h5>
                        {removedDuplicates > 0 && <p>Дубликаты: {removedDuplicates} записей</p>}
                        {removedInvalid > 0 && <p>Невалидные форматы: {removedInvalid} записей</p>}
                    </div>
                )}

                {(singletonRecords.length > 0 || notFoundRecords.length > 0) && (
                    <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#ffebee', borderRadius: '6px' }}>
                        <h5 style={{ color: '#c62828' }}>Удалённые записи после сверки с отгрузками:</h5>
                        {notFoundRecords.length > 0 && (
                            <>
                                <p><strong>Не найденные модули:</strong></p>
                                <ul style={{ margin: '5px 0 10px 20px' }}>
                                    {notFoundRecords.map((r, i) => (
                                        <li key={`notfound-${i}`}>{r.normalized} (кв. {r.apartment})</li>
                                    ))}
                                </ul>
                            </>
                        )}
                        {singletonRecords.length > 0 && (
                            <>
                                <p><strong>Модули с неверных листов отгрузки:</strong></p>
                                <ul style={{ margin: '5px 0 0 20px' }}>
                                    {singletonRecords.map((r, i) => (
                                        <li key={`singleton-${i}`}>{r.normalized} (кв. {r.apartment})</li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Step4Results;