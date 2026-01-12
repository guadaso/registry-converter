import React from 'react';

const Step4Results = ({
    outputBlob,
    csvBlob,
    reportBlob,
    totalInputRows,
    removedDuplicates,
    removedInvalid,
    validRecords,
    notFoundRecords,
    onDownload
}) => {
    const foundCount = validRecords.length - notFoundRecords.length;

    return (
        <div className="step" id="step4" style={{ textAlign: 'center' }}>
            <h3>Готово!</h3>
            <p>Файлы обработаны и готовы к скачиванию.</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '15px' }}>
                <button className="btn-primary" onClick={() => onDownload(outputBlob, 'output')}>Скачать результат</button>
                <button className="btn-primary" onClick={() => onDownload(csvBlob, 'export')}>Скачать CSV</button>
                <button className="btn-primary" onClick={() => onDownload(reportBlob, 'report')}>Скачать отчет</button>
            </div>

            <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '8px', textAlign: 'left' }}>
                <h4>Итоговая статистика:</h4>
                <ul>
                    <li>Всего строк в исходном файле: <strong>{totalInputRows}</strong></li>
                    {/* ✅ Изменено: теперь это количество номеров модулей */}
                    <li>Всего номеров модулей в исходном файле: <strong>{removedDuplicates + removedInvalid + validRecords.length}</strong></li>
                    <li>Удалено дубликатов: <strong>{removedDuplicates}</strong></li>
                    <li>Удалено невалидных записей: <strong>{removedInvalid}</strong></li>
                    <li>Валидных модулей для поиска: <strong>{validRecords.length}</strong></li>
                    <li>Найдено совпадений: <strong>{foundCount}</strong></li>
                    <li>Не найдено: <strong>{notFoundRecords.length}</strong></li>
                </ul>

                {notFoundRecords.length > 0 && (
                    <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#ffebee', borderRadius: '6px' }}>
                        <h5 style={{ color: '#c62828' }}>Не найденные модули:</h5>
                        <ul style={{ margin: 0, paddingLeft: '20px' }}>
                            {notFoundRecords.map((r, i) => (
                                <li key={i}>{r.normalized} (кв. {r.apartment})</li>
                            ))}
                        </ul>
                    </div>
                )}

                {(removedDuplicates > 0 || removedInvalid > 0) && (
                    <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#fff8e1', borderRadius: '6px' }}>
                        <h5 style={{ color: '#ff8f00' }}>Удалённые записи:</h5>
                        {removedDuplicates > 0 && <p>Дубликаты: {removedDuplicates} записей</p>}
                        {removedInvalid > 0 && <p>Невалидные форматы: {removedInvalid} записей</p>}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Step4Results;