// src/components/RegistriesAutomaticComponents/autoDispatch.js
export const handleStartProcessing = async ({ uploadedFilesForProcessing, showCachedFiles, selectedCachedFiles, addLog, setLogs, setProcessing, setProgress, progress, setUploadedFilesForProcessing, clearCache, saveFileToCache, loadFileFromCache, processShipmentFiles }) => {
  setLogs([]);
  setProcessing(true);
  setProgress({ ...progress, step3: 10 });

  let filesToProcess = [];

  if (uploadedFilesForProcessing) {
    // Режим: новые файлы
    addLog('Режим: поиск по новым загруженным файлам', 'info');
    await clearCache(); // Удаляем старые
    for (const file of uploadedFilesForProcessing) {
      try {
        await saveFileToCache(file);
      } catch (err) {
        addLog(`Не удалось сохранить в кэш: ${file.name}`, 'error');
      }
    }
    filesToProcess = Array.from(uploadedFilesForProcessing);
    addLog(`Сохранено ${filesToProcess.length} файл(ов) в кэш`, 'success');
    setUploadedFilesForProcessing(null);
  } else if (showCachedFiles && selectedCachedFiles.size > 0) {
    // Режим: кэш
    addLog('Режим: поиск по файлам из кэша', 'info');
    for (const filename of selectedCachedFiles) {
      const file = await loadFileFromCache(filename);
      if (!file || !file.name) {
        addLog(`❌ Ошибка: файл "${filename}" повреждён или не содержит имени`, 'error');
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

  // ✅ Правильный вызов — НЕ handleProcess!
  await processShipmentFiles(filesToProcess);
};