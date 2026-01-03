import React, { useState, useEffect, useCallback, useRef } from 'react';

const BUCKET_ID = '233b1e5d04b9492590b10415';
const RESTRICTED_ROOT = 'public/templates/';

let authData = null;

const authorizeAccount = async () => {
  if (authData) return authData;
  const response = await fetch('/api/b2/authorize');
  if (!response.ok) throw new Error('Auth failed');
  authData = await response.json();
  return authData;
};

const listFiles = async () => {
  const { apiUrl, authorizationToken } = await authorizeAccount();
  const response = await fetch('/api/b2/b2_list_file_names', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiUrl,
      authorizationToken,
    })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || 'List failed');
  }
  return response.json();
};

const uploadFiles = async (files, basePath) => {
  for (const file of files) {
    const key = `${basePath}${file.name}`;
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`/api/b2/upload-file?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error('Upload failed: ' + (err.error || response.statusText));
    }
  }
};

const createFolder = async (folderPath) => {
  const response = await fetch('/api/b2/create-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderKey: folderPath })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Create folder failed');
  }
};

const deleteItem = async (fileName, isDir) => {
  const response = await fetch('/api/b2/delete-item', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, isDir })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Delete failed');
  }
};

const downloadFile = async (fileName) => {
  if (fileName.endsWith('/')) {
    throw new Error('Cannot download a directory');
  }
  const response = await fetch(`/api/b2/download-file?fileName=${encodeURIComponent(fileName)}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Download failed' }));
    throw new Error(err.error || 'Failed to download file');
  }
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.split('/').pop();
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};
import fileExcel from '../assets/icons/file-excel.png';
import fileCsv from '../assets/icons/file-csv.png';
import fileWord from '../assets/icons/file-word.png';
import fileTxt from '../assets/icons/file-txt.png';
import filePdf from '../assets/icons/file-pdf.png';
import fileImage from '../assets/icons/file-image.png';
import fileFolder from '../assets/icons/file-folder.png';
import fileUnknown from '../assets/icons/file-unknown.png';
const getFileIcon = (ext) => {
  const iconMap = {
    'xlsx': fileExcel,
    'xls': fileExcel,
    'csv': fileCsv,
    'docx': fileWord,
    'doc': fileWord,
    'txt': fileTxt,
    'pdf': filePdf,
    // Изображения
    'png': fileImage,
    'jpg': fileImage,
    'jpeg': fileImage,
    'gif': fileImage,
    'bmp': fileImage,
    'webp': fileImage,
    'svg': fileImage,
    'ico': fileImage,
    'tiff': fileImage,
    'tif': fileImage,
    // Папка
    '': fileFolder,
  };
  return iconMap[ext?.toLowerCase()] || fileUnknown;
};


const getExtension = (filename) => {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
};

const Loader = ({ size = 16 }) => (
  <div style={{
    width: size,
    height: size,
    border: '2px solid #ccc',
    borderTop: '2px solid #000',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    display: 'inline-block'
  }} />
);

export default function Templates() {
  const [currentPath, setCurrentPath] = useState(RESTRICTED_ROOT);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const fileInputRef = useRef(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
  const [searchQuery, setSearchQuery] = useState('');

  // Состояния операций
  const [uploading, setUploading] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [folderNameInput, setFolderNameInput] = useState('');

  const sortItems = useCallback((itemsToSort) => {
    const { key, direction } = sortConfig;
    return [...itemsToSort].sort((a, b) => {
      let aVal = a[key];
      let bVal = b[key];

      if (key === 'name') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      } else if (key === 'size') {
        aVal = a.size || 0;
        bVal = b.size || 0;
      } else if (key === 'uploadTimestamp') {
        aVal = a.uploadTimestamp || 0;
        bVal = b.uploadTimestamp || 0;
      }

      if (aVal < bVal) return direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [sortConfig]);

  const loadFolder = useCallback(async (path) => {
    if (!path.startsWith(RESTRICTED_ROOT)) {
      setError('Доступ запрещён');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await listFiles();
      const allItems = [];
      const files = data.files || [];
      const dirs = new Set();

      files.forEach(file => {
        if (!file.fileName.startsWith(path)) return;
        const relative = file.fileName.slice(path.length);
        if (relative.includes('/')) {
          const firstPart = relative.split('/')[0];
          const dirName = `${path}${firstPart}/`;
          if (dirs.has(dirName)) return;
          if (file.fileName === `${dirName}.keep`) {
            dirs.add(dirName);
            allItems.push({
              name: firstPart,
              fullPath: dirName,
              isDir: true,
              ext: '',
              size: 0,
              uploadTimestamp: file.uploadTimestamp || 0
            });
          }
        }
      });

      files.forEach(file => {
        if (!file.fileName.startsWith(path)) return;
        const relative = file.fileName.slice(path.length);
        if (!relative || relative === '.keep') return;
        if (relative.includes('/')) return;
        const name = relative;
        const ext = getExtension(name);
        allItems.push({
          name,
          fullPath: file.fileName,
          isDir: false,
          ext,
          size: file.size || 0,
          uploadTimestamp: file.uploadTimestamp || 0
        });
      });

      const sorted = sortItems(allItems);
      setItems(sorted);
    } catch (err) {
      setError('Ошибка: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [sortConfig, sortItems]);

  useEffect(() => {
    loadFolder(currentPath);
  }, [currentPath, loadFolder]);

  const handleFolderOpen = (fullPath) => {
    setCurrentPath(fullPath);
    setSelectedItem(null);
    setSearchQuery('');
  };

  const handleGoBack = () => {
    if (currentPath === RESTRICTED_ROOT) return;
    const parts = currentPath.slice(0, -1).split('/');
    if (parts.length <= 3) {
      setCurrentPath(RESTRICTED_ROOT);
    } else {
      setCurrentPath(parts.slice(0, -1).join('/') + '/');
    }
    setSearchQuery('');
  };

  const handleCreateFolder = async () => {
    if (!folderNameInput.trim() || creatingFolder) return;
    setCreatingFolder(true);
    const newKey = `${currentPath}${folderNameInput.trim()}/`;
    try {
      await createFolder(newKey);
      setFolderNameInput('');
      setShowCreateFolderModal(false);
      loadFolder(currentPath);
    } catch (err) {
      setError('Не удалось создать папку: ' + err.message);
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleFilesSelect = (files) => {
    if (files.length === 0) return;
    setSelectedFiles(Array.from(files));
  };

  const confirmUpload = async () => {
    if (selectedFiles.length === 0 || uploading) return;
    setUploading(true);
    try {
      await uploadFiles(selectedFiles, currentPath);
      setShowUploadModal(false);
      setSelectedFiles([]);
      loadFolder(currentPath);
    } catch (err) {
      setError('Ошибка загрузки: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    handleFilesSelect(e.dataTransfer.files);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDelete = async (fullPath, isDir) => {
    const itemName = fullPath.split('/').pop() || (isDir ? 'папка' : 'файл');
    if (!confirm(`Удалить "${itemName}"?`)) return;
    setDeleting(true);
    try {
      await deleteItem(fullPath, isDir);
      const newItems = items.filter(item => item.fullPath !== fullPath);
      const sorted = sortItems(newItems);
      setItems(sorted);
      if (selectedItem === fullPath) setSelectedItem(null);
    } catch (err) {
      setError('Ошибка удаления: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleDoubleClick = async (fullPath, isDir) => {
    if (isDir) {
      handleFolderOpen(fullPath);
    } else {
      setDownloading(true);
      try {
        await downloadFile(fullPath);
      } catch (err) {
        setError('Не удалось скачать файл: ' + err.message);
      } finally {
        setDownloading(false);
      }
    }
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredItems = items.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const displayPath = currentPath.startsWith(RESTRICTED_ROOT)
    ? 'templates' + currentPath.slice(RESTRICTED_ROOT.length - 1)
    : 'templates';

  const selectedItemData = items.find(item => item.fullPath === selectedItem);

  return (
    <div>
      <div className="page-header">
        <h2>Шаблоны</h2>
        <p>Готовые шаблоны для быстрого создания документов</p>
      </div>

      <div className="page-body">
        {error && (
          <div style={{ color: 'red', marginBottom: '10px', padding: '8px', background: '#ffe6e6' }}>
            {error}
          </div>
        )}

        <div className="toolbar" style={{ marginBottom: '12px', padding: '8px', background: '#f5f5f5', borderRadius: '4px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={handleGoBack}
            disabled={currentPath === RESTRICTED_ROOT || loading}
            title="Назад"
          >
            {loading ? <Loader size={14} /> : <i className="fas fa-arrow-left"></i>}
          </button>

          <button
            onClick={() => loadFolder(currentPath)}
            disabled={loading}
            title="Обновить"
          >
            {loading ? <Loader size={14} /> : <i className="fas fa-sync-alt"></i>}
          </button>

          <button
            onClick={() => setShowCreateFolderModal(true)}
            disabled={creatingFolder}
            title="Создать папку"
          >
            <i className="fas fa-folder-plus"></i>
          </button>

          <button
            onClick={() => setShowUploadModal(true)}
            disabled={uploading}
            title="Загрузить файлы"
          >
            <i className="fas fa-upload"></i>
          </button>

          {/* Поиск */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px', alignItems: 'center' }}>
            <i className="fas fa-search" style={{ color: '#666' }}></i>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск..."
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid #ccc',
                fontSize: '13px',
                width: '120px'
              }}
            />
          </div>

          {/* Сортировка */}
          <div style={{ display: 'flex', gap: '6px', marginLeft: '12px' }}>
            <button
              onClick={() => handleSort('name')}
              title="Сортировка по имени"
              style={{ fontSize: '14px' }}
            >
              {sortConfig.key === 'name' ? (
                sortConfig.direction === 'asc' ? <i className="fas fa-sort-alpha-down"></i> : <i className="fas fa-sort-alpha-up"></i>
              ) : <i className="fas fa-sort-alpha-down"></i>}
            </button>
            <button
              onClick={() => handleSort('uploadTimestamp')}
              title="Сортировка по дате"
              style={{ fontSize: '14px' }}
            >
              {sortConfig.key === 'uploadTimestamp' ? (
                sortConfig.direction === 'asc' ? <i className="fas fa-sort-amount-down"></i> : <i className="fas fa-sort-amount-up"></i>
              ) : <i className="fas fa-sort-amount-down"></i>}
            </button>
            <button
              onClick={() => handleSort('size')}
              title="Сортировка по размеру"
              style={{ fontSize: '14px' }}
            >
              {sortConfig.key === 'size' ? (
                sortConfig.direction === 'asc' ? <i className="fas fa-sort-numeric-down"></i> : <i className="fas fa-sort-numeric-up"></i>
              ) : <i className="fas fa-sort-numeric-down"></i>}
            </button>
          </div>
        </div>

        <div style={{ fontSize: '14px', color: '#555', marginBottom: '12px' }}>
          Папка: <strong>{displayPath || 'templates'}</strong>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <Loader size={24} />
            <p style={{ marginTop: '8px', color: '#666' }}>Загрузка файлов...</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '16px' }}>
            {filteredItems.map((item) => (
              <div
                key={item.fullPath}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  background: selectedItem === item.fullPath ? '#e6f7ff' : '#fafafa',
                  cursor: 'pointer',
                  position: 'relative',
                  opacity: deleting ? 0.7 : 1,
                }}
                onClick={() => setSelectedItem(item.fullPath)}
                onDoubleClick={() => handleDoubleClick(item.fullPath, item.isDir)}
              >
                <img
                  src={getFileIcon(item.ext)}
                  alt=""
                  style={{ width: '28px', height: '28px', marginBottom: '6px', objectFit: 'contain' }}
                />
                <div style={{ fontSize: '12px', textAlign: 'center', wordBreak: 'break-word', width: '100%' }}>
                  {item.name}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(item.fullPath, item.isDir);
                  }}
                  disabled={deleting}
                  style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    background: 'none',
                    border: 'none',
                    fontSize: '14px',
                    color: 'red',
                    cursor: deleting ? 'not-allowed' : 'pointer',
                    opacity: deleting ? 0.5 : 1,
                  }}
                  title="Удалить"
                >
                  {deleting && selectedItem === item.fullPath ? <Loader size={12} /> : <i className="fas fa-trash"></i>}
                </button>
              </div>
            ))}
          </div>
        )}

        {selectedItem && selectedItemData && (
          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            {selectedItemData.isDir ? (
              <button
                onClick={() => handleFolderOpen(selectedItem)}
                className="btn-primary"
                style={{ marginRight: '10px' }}
                title="Открыть папку"
              >
                <i className="fas fa-folder-open"></i>
              </button>
            ) : (
              <button
                onClick={async () => {
                  setDownloading(true);
                  try {
                    await downloadFile(selectedItem);
                    setSelectedItem(null);
                  } catch (err) {
                    setError('Не удалось скачать файл: ' + err.message);
                  } finally {
                    setDownloading(false);
                  }
                }}
                className="btn-primary"
                style={{ marginRight: '10px' }}
                disabled={downloading}
                title="Скачать файл"
              >
                {downloading ? <Loader size={14} /> : <i className="fas fa-download"></i>}
              </button>
            )}
            <button
              onClick={() => setSelectedItem(null)}
              className="btn-secondary"
              title="Отмена"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        )}

        {/* Модальное окно загрузки */}
        {showUploadModal && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 1000,
            }}
            onClick={() => setShowUploadModal(false)}
          >
            <div
              style={{
                background: 'white',
                padding: '24px',
                borderRadius: '8px',
                width: '500px',
                position: 'relative',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3>Загрузить файлы</h3>

              <div
                ref={fileInputRef}
                onDrop={handleFileDrop}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                style={{
                  border: '2px dashed #ccc',
                  borderRadius: '6px',
                  padding: '20px',
                  textAlign: 'center',
                  background: dragActive ? '#f0f8ff' : '#fafafa',
                  transition: 'background 0.2s',
                  marginBottom: '16px',
                }}
              >
                {dragActive ? 'Отпустите файлы!' : 'Перетащите файлы сюда'}
              </div>

              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <label style={{ cursor: 'pointer', background: '#007bff', color: 'white', padding: '8px 16px', borderRadius: '4px' }}>
                  Выбрать файлы
                  <input
                    type="file"
                    multiple
                    onChange={(e) => handleFilesSelect(e.target.files)}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>

              {selectedFiles.length > 0 && (
                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #eee', padding: '8px', borderRadius: '4px', marginBottom: '16px' }}>
                  <p><strong>Выбранные файлы:</strong></p>
                  <ul>
                    {selectedFiles.map((file, i) => (
                      <li key={i}>{file.name} ({(file.size / 1024).toFixed(1)} KB)</li>
                    ))}
                  </ul>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="btn-secondary"
                  disabled={uploading}
                >
                  Отмена
                </button>
                <button
                  onClick={confirmUpload}
                  disabled={selectedFiles.length === 0 || uploading}
                  style={{
                    background: selectedFiles.length && !uploading ? '#28a745' : '#ccc',
                    color: 'white',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '4px',
                    cursor: selectedFiles.length && !uploading ? 'pointer' : 'not-allowed'
                  }}
                >
                  {uploading ? <Loader size={14} /> : 'Отправить'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Модальное окно создания папки */}
        {showCreateFolderModal && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 1000,
            }}
            onClick={() => setShowCreateFolderModal(false)}
          >
            <div
              style={{
                background: 'white',
                padding: '24px',
                borderRadius: '8px',
                width: '400px',
                position: 'relative',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3>Создать папку</h3>
              <input
                type="text"
                value={folderNameInput}
                onChange={(e) => setFolderNameInput(e.target.value)}
                placeholder="Название папки"
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #ccc',
                  fontSize: '15px',
                  marginBottom: '16px',
                }}
                autoFocus
                onKeyPress={(e) => e.key === 'Enter' && handleCreateFolder()}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  onClick={() => setShowCreateFolderModal(false)}
                  className="btn-secondary"
                >
                  Отмена
                </button>
                <button
                  onClick={handleCreateFolder}
                  disabled={!folderNameInput.trim() || creatingFolder}
                  className="btn-primary"
                >
                  {creatingFolder ? <Loader size={14} /> : 'Создать'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .btn-primary,
        .btn-secondary {
          background: #000;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 15px;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
          transform: translateY(0);
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .btn-primary:hover,
        .btn-secondary:hover {
          background: #1a1a1a;
          color: #fff;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
          transform: translateY(-2px) scale(1.02);
        }

        .btn-primary:active,
        .btn-secondary:active {
          transform: translateY(0) scale(1);
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}