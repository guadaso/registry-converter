// src/components/RegistriesAutomaticComponents/manualDispatch.js
export const handleShipmentFilesUpload = (e, setUploadedFilesForProcessing, addLog) => {
  const files = e.target.files;
  if (!files || files.length === 0) return;
  setUploadedFilesForProcessing(files);
  addLog(`Выбрано ${files.length} файл(ов) отгрузок. Нажмите "Начать", чтобы обработать и сохранить.`, 'info');
};