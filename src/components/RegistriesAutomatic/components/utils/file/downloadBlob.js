// src/utils/file/downloadBlob.js

let selectedDirectoryHandle = null;

/**
 * Позволяет пользователю выбрать папку для сохранения
 */
export async function selectDownloadDirectory() {
  if ('showDirectoryPicker' in window) {
    try {
      const dirHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'downloads'
      });
      selectedDirectoryHandle = dirHandle;
      return true;
    } catch (err) {
      console.warn('Пользователь отменил выбор папки или API недоступен:', err);
      selectedDirectoryHandle = null;
      return false;
    }
  } else {
    console.warn('File System Access API не поддерживается в этом браузере');
    selectedDirectoryHandle = null;
    return false;
  }
}

/**
 * Возвращает человекочитаемый путь к выбранной папке (ограниченно)
 */
export async function getSelectedDirectoryPath() {
  if (!selectedDirectoryHandle) return '';
  try {
    // В Chrome можно получить имя папки через запрос прав
    // Но полный путь недоступен из соображений безопасности
    // Поэтому возвращаем только имя папки
    return selectedDirectoryHandle.name || 'Выбранная папка';
  } catch {
    return 'Выбранная папка';
  }
}

/**
 * Сохраняет blob в выбранную папку или скачивает стандартно
 */
export async function downloadBlob(blob, filename) {
  if (selectedDirectoryHandle && 'getFileHandle' in selectedDirectoryHandle) {
    try {
      const fileHandle = await selectedDirectoryHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      console.log(`Файл сохранён в выбранную папку: ${filename}`);
      return;
    } catch (err) {
      console.error('Не удалось сохранить в выбранную папку, используем стандартную загрузку:', err);
    }
  }

  // Резерв: стандартная загрузка
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}