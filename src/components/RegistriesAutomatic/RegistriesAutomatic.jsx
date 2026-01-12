import React, { useState, useEffect, useRef } from 'react';
import Step1UploadSource from './Step1UploadSource.jsx';
import Step2Confirm from './Step2Confirm.jsx';
import Step3UploadShipments from './Step3UploadShipments.jsx';
import Step4Results from './Step4Results.jsx';
import { useShipmentCache } from '../../hooks/useShipmentCache.js';
import { parseSourceFile } from '../../utils/excel/parseSourceFile.js';
import { processShipments } from '../../services/processShipments.js';
import { readFileAsArrayBuffer } from '../../utils/file/readFileAsArrayBuffer.js';
import { downloadBlob } from '../../utils/file/downloadBlob.js';
import { getCurrentDateTimeString } from '../../utils/date/getCurrentDateTimeString.js';

function RegistriesAutomatic() {
    const [step, setStep] = useState(1);
    const [sourceFile, setSourceFile] = useState(null);
    const [outputBlob, setOutputBlob] = useState(null);
    const [csvBlob, setCsvBlob] = useState(null);
    const [reportBlob, setReportBlob] = useState(null);
    const [logs, setLogs] = useState([]);
    const [processing, setProcessing] = useState(false);
    const [progress, setProgress] = useState({ step1: 0, step3: 0 });

    // Данные после анализа исходного файла
    const [sourceWorkbook, setSourceWorkbook] = useState(null);
    const [autoDetectedConfig, setAutoDetectedConfig] = useState(null);

    // Результаты обработки
    const [totalInputRows, setTotalInputRows] = useState(0);
    const [removedDuplicates, setRemovedDuplicates] = useState(0);
    const [removedInvalid, setRemovedInvalid] = useState(0);
    const [notFoundRecords, setNotFoundRecords] = useState([]);
    const [allRecordsWithIssues, setAllRecordsWithIssues] = useState([]);
    const [validRecords, setValidRecords] = useState([]);

    // Для шага 3
    const [uploadedFilesForProcessing, setUploadedFilesForProcessing] = useState(null);

    const addLog = (message, type = 'info') => {
        setLogs(prev => [...prev, { message, type, timestamp: new Date().toLocaleTimeString() }]);
    };

    const { cachedFiles, refresh: refreshCache, saveFileToCache, loadFileFromCache, clearCache } = useShipmentCache();

    // === ШАГ 1: Загрузка и анализ исходного файла ===
    const handleSourceFile = async (file) => {
        if (!file) return;
        setLogs([]);
        setSourceFile(file);
        addLog(`Загрузка файла: ${file.name}`);
        setProgress({ ...progress, step1: 10 });
        try {
            const arrayBuffer = await readFileAsArrayBuffer(file);
            const { config, workbook } = await parseSourceFile(arrayBuffer, addLog);
            setSourceWorkbook(workbook);
            setAutoDetectedConfig(config);
            setProgress({ ...progress, step1: 100 });
            addLog('Файл успешно проанализирован!', 'success');
            setStep(2);
        } catch (err) {
            addLog(`Ошибка анализа: ${err.message}`, 'error');
            setProgress({ ...progress, step1: 0 });
        }
    };

    // === ШАГ 2 → ШАГ 3 ===
    const handleStart = () => {
        setStep(3);
    };

    // === ШАГ 3: Обработка отгрузок ===
    const handleStartProcessing = async ({ uploadedFiles, selectedCachedNames, showCached }) => {
        setLogs([]);
        setProcessing(true);
        setProgress({ ...progress, step3: 10 });
        let filesToProcess = [];

        if (uploadedFiles) {
            // Новые файлы → очищаем кэш и сохраняем их
            addLog('Режим: поиск по новым загруженным файлам', 'info');
            await clearCache();
            for (const file of uploadedFiles) {
                try {
                    await saveFileToCache(file);
                } catch (err) {
                    addLog(`Не удалось сохранить в кэш: ${file.name}`, 'error');
                }
            }
            filesToProcess = Array.from(uploadedFiles);
            addLog(`Сохранено ${filesToProcess.length} файл(ов) в кэш`, 'success');
        } else if (showCached && selectedCachedNames.size > 0) {
            // Кэш
            addLog('Режим: поиск по файлам из кэша', 'info');
            for (const name of selectedCachedNames) {
                const file = await loadFileFromCache(name);
                if (!file?.name) {
                    addLog(`❌ Ошибка: файл "${name}" повреждён`, 'error');
                    setProcessing(false);
                    return;
                }
                filesToProcess.push(file);
            }
            addLog(`Загружено ${filesToProcess.length} файл(ов) из кэша`, 'success');
        } else {
            alert('Выберите файлы отгрузок или активируйте кэш.');
            setProcessing(false);
            return;
        }

        if (filesToProcess.length === 0) {
            addLog('Нет файлов для обработки', 'error');
            setProcessing(false);
            return;
        }

        // Вызов сервиса
        try {
            const result = await processShipments({
                sourceWorkbook,
                config: autoDetectedConfig,
                files: filesToProcess,
                onLog: addLog
            });

            const { outputBlob, csvBlob, stats, notFoundRecords, allRecordsWithIssues, validRecords } = result;

            setOutputBlob(outputBlob);
            setCsvBlob(csvBlob);
            setReportBlob(result.reportBlob); // если генерируется внутри processShipments

            setTotalInputRows(stats.totalInputRows);
            setRemovedDuplicates(stats.removedDuplicates);
            setRemovedInvalid(stats.removedInvalid);
            setValidRecords(validRecords);
            setAllRecordsWithIssues(allRecordsWithIssues);
            setNotFoundRecords(notFoundRecords);

            setProgress({ ...progress, step3: 100 });
            setProcessing(false);
            setStep(4);
        } catch (err) {
            addLog(`Ошибка обработки: ${err.message}`, 'error');
            setProcessing(false);
            setProgress({ ...progress, step3: 0 });
        }
    };

    // Обновление списка кэшированных файлов при входе на шаг 3
    useEffect(() => {
        if (step === 3) {
            refreshCache();
        }
    }, [step, refreshCache]);

    // === Общие утилиты ===
    const downloadResult = (blob, baseName) => {
        if (blob) {
            const dateTimeStr = getCurrentDateTimeString();
            downloadBlob(blob, `${baseName} ${dateTimeStr}.xlsx`);
        }
    };

    // === Рендеринг шагов ===
    return (
        <div className="registries-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
            <div className="page-header">
                <h2>Реестры (авто)</h2>
                <p>Загрузите файл — система всё определит сама</p>
            </div>
            <div className="page-body" style={{ flex: 1 }}>
                <div id="registriesWorkflow" style={{ width: '100%', maxWidth: '800px', margin: '0 auto', textAlign: 'left', paddingBottom: '20px' }}>
                    {step === 1 && (
                        <Step1UploadSource
                            onFileSelect={handleSourceFile}
                            progress={progress.step1}
                            logs={logs}
                            processing={processing}
                        />
                    )}
                    {step === 2 && (
                        <Step2Confirm
                            onContinue={handleStart}
                            logs={logs}
                            processing={processing}
                        />
                    )}
                    {step === 3 && (
                        <Step3UploadShipments
                            cachedFiles={cachedFiles}
                            onProcess={handleStartProcessing}
                            onFileUpload={(files) => setUploadedFilesForProcessing(files)}
                            uploadedFiles={uploadedFilesForProcessing}
                            processing={processing}
                            progress={progress.step3}
                            logs={logs}
                        />
                    )}
                    {step === 4 && (
                        <Step4Results
                            outputBlob={outputBlob}
                            csvBlob={csvBlob}
                            reportBlob={reportBlob}
                            totalInputRows={totalInputRows}
                            removedDuplicates={removedDuplicates}
                            removedInvalid={removedInvalid}
                            validRecords={validRecords}
                            notFoundRecords={notFoundRecords}
                            onDownload={downloadResult}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

export default RegistriesAutomatic;