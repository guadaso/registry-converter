// src/components/RegistriesAutomatic/Step5InputProcessor.jsx
import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';

const Step5InputProcessor = ({
    outputData, // массив записей из output.xlsx: [{ apartment, location, normalized }]
    onProcessComplete,
    onCancel
}) => {
    const [inputFile, setInputFile] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState('');
    const [formValues, setFormValues] = useState({
        Country: '',
        Region: '',
        City: '',
        Street: '',
        Building: '',
        Block: '',
        Group: '' // Новое поле
    });
    const [showForm, setShowForm] = useState(false);

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setInputFile(file);
        setError('');
        setShowForm(false);
        validateInputFile(file);
    };

    const validateInputFile = async (file) => {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];

            if (!sheet || !sheet['!ref']) {
                throw new Error('Пустой лист');
            }

            const range = XLSX.utils.decode_range(sheet['!ref']);
            const firstRow = [];
            for (let c = range.s.c; c <= range.e.c; c++) {
                const addr = XLSX.utils.encode_cell({ r: range.s.r, c });
                const cell = sheet[addr];
                firstRow.push(cell?.v != null ? String(cell.v).trim() : '');
            }

            // Проверяем наличие Sensor number
            const sensorNumberColIndex = firstRow.findIndex(col => col === 'Sensor number');
            if (sensorNumberColIndex === -1) {
                throw new Error('В файле нет столбца "Sensor number"');
            }

            // Проверяем, что адресные столбцы пусты (кроме Group)
            const addressFields = ['Country', 'Region', 'City', 'Street', 'Building', 'Block', 'Number', 'Room', 'Additional address'];
            const addressFieldIndices = {};
            for (const field of addressFields) {
                const idx = firstRow.findIndex(col => col === field);
                if (idx === -1) {
                    throw new Error(`В файле нет столбца "${field}"`);
                }
                addressFieldIndices[field] = idx;
            }

            // Проверяем, что столбец Group существует
            const groupColIndex = firstRow.findIndex(col => col === 'Group');
            if (groupColIndex === -1) {
                throw new Error('В файле нет столбца "Group"');
            }

            // Проверяем, что первая строка данных (после заголовков) не содержит значений в адресных столбцах (кроме Group)
            let hasDataInAddressFields = false;
            for (let r = range.s.r + 1; r <= Math.min(range.e.r, range.s.r + 5); r++) {
                for (const field of addressFields) {
                    const c = addressFieldIndices[field];
                    const addr = XLSX.utils.encode_cell({ r, c });
                    const cell = sheet[addr];
                    if (cell && cell.v != null && String(cell.v).trim() !== '') {
                        hasDataInAddressFields = true;
                        break;
                    }
                }
                if (hasDataInAddressFields) break;
            }

            if (hasDataInAddressFields) {
                throw new Error('Столбцы Country, Region, City, Street, Building, Block, Number, Room, Additional address должны быть пустыми');
            }

            setShowForm(true);
            setError('');

        } catch (err) {
            setError(err.message);
            setShowForm(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormValues(prev => ({ ...prev, [name]: value }));
    };

    const processInputFile = async () => {
        if (!inputFile) {
            setError('Файл не выбран');
            return;
        }

        setIsProcessing(true);
        setError('');

        try {
            const arrayBuffer = await inputFile.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const range = XLSX.utils.decode_range(sheet['!ref']);

            const firstRow = [];
            for (let c = range.s.c; c <= range.e.c; c++) {
                const addr = XLSX.utils.encode_cell({ r: range.s.r, c });
                const cell = sheet[addr];
                firstRow.push(cell?.v != null ? String(cell.v).trim() : '');
            }

            // Находим индексы нужных столбцов
            const sensorNumberColIndex = firstRow.findIndex(col => col === 'Sensor number');
            const numberColIndex = firstRow.findIndex(col => col === 'Number');
            const additionalAddressColIndex = firstRow.findIndex(col => col === 'Additional address');
            const addressTypeColIndex = firstRow.findIndex(col => col === 'Address type');
            const groupColIndex = firstRow.findIndex(col => col === 'Group'); // Индекс Group

            // Маппинг: Sensor number -> { apartment, location }
            const moduleMap = new Map();
            outputData.forEach(record => {
                moduleMap.set(record.normalized, record);
            });

            // Обрабатываем строки
            for (let r = range.s.r + 1; r <= range.e.r; r++) {
                const sensorNumberAddr = XLSX.utils.encode_cell({ r, c: sensorNumberColIndex });
                const sensorNumberCell = sheet[sensorNumberAddr];
                if (!sensorNumberCell || !sensorNumberCell.v) continue;

                const sensorNumber = String(sensorNumberCell.v).trim();
                const match = moduleMap.get(sensorNumber);

                if (match) {
                    // Заполняем Address fields
                    for (const field in formValues) {
                        if (field === 'Group') continue; // Пропускаем Group, он обрабатывается отдельно
                        const colIndex = firstRow.findIndex(col => col === field);
                        if (colIndex !== -1) {
                            const addr = XLSX.utils.encode_cell({ r, c: colIndex });
                            sheet[addr] = { t: 's', v: formValues[field] };
                        }
                    }

                    // Заполняем Number
                    if (numberColIndex !== -1) {
                        const addr = XLSX.utils.encode_cell({ r, c: numberColIndex });
                        sheet[addr] = { t: 's', v: match.apartment };
                    }

                    // Заполняем Additional address
                    if (additionalAddressColIndex !== -1) {
                        const addr = XLSX.utils.encode_cell({ r, c: additionalAddressColIndex });
                        sheet[addr] = { t: 's', v: match.location || '' };
                    }

                    // Заполняем Address type
                    if (addressTypeColIndex !== -1) {
                        const addr = XLSX.utils.encode_cell({ r, c: addressTypeColIndex });
                        const isNumeric = /^\d+$/.test(match.apartment);
                        sheet[addr] = { t: 's', v: isNumeric ? 'INDIVIDUAL' : 'ENTITY' };
                    }

                    // Заполняем Group (все строки получают одно и то же значение от пользователя)
                    if (groupColIndex !== -1) {
                        const addr = XLSX.utils.encode_cell({ r, c: groupColIndex });
                        sheet[addr] = { t: 's', v: formValues.Group };
                    }
                }
            }

            // Генерируем Blob
            const buf = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
            const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

            onProcessComplete(blob);

        } catch (err) {
            setError(`Ошибка обработки: ${err.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div style={{ textAlign: 'left', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
            <h4>Обработка файла Input</h4>
            <p>Загрузите файл с расширением .xlsx, содержащий колонку <strong>Sensor number</strong>.</p>

            <input
                type="file"
                accept=".xlsx"
                onChange={handleFileChange}
                style={{ marginBottom: '10px' }}
            />

            {error && <div style={{ color: 'red', marginBottom: '10px' }}>{error}</div>}

            {showForm && (
                <>
                    <div style={{ marginBottom: '15px' }}>
                        <h5>Введите адресные данные и группу (будут применены ко всем строкам):</h5>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                            {['Country', 'Region', 'City', 'Street', 'Building'].map(field => (
                                <div key={field}>
                                    <label>{field}:</label>
                                    <input
                                        type="text"
                                        name={field}
                                        value={formValues[field]}
                                        onChange={handleInputChange}
                                        style={{ width: '100%' }}
                                    />
                                </div>
                            ))}
                            <div>
                                <label>Block (необязательно):</label>
                                <input
                                    type="text"
                                    name="Block"
                                    value={formValues.Block}
                                    onChange={handleInputChange}
                                    style={{ width: '100%' }}
                                />
                            </div>
                            <div>
                                <label>Group:</label>
                                <input
                                    type="text"
                                    name="Group"
                                    value={formValues.Group}
                                    onChange={handleInputChange}
                                    style={{ width: '100%' }}
                                />
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                        <button
                            onClick={processInputFile}
                            disabled={isProcessing}
                            className="btn-primary"
                            style={{ padding: '6px 12px' }}
                        >
                            {isProcessing ? 'Обработка...' : 'Обработать файл'}
                        </button>
                        <button
                            onClick={onCancel}
                            className="btn-secondary"
                            style={{ padding: '6px 12px' }}
                        >
                            Отмена
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default Step5InputProcessor;