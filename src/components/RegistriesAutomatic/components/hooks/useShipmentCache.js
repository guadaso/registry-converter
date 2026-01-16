// src/hooks/useShipmentCache.js

import { useState, useEffect } from 'react';

const DB_NAME = 'ShipmentCacheDB';
const STORE_NAME = 'files';
const VERSION = 1;

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'name' });
      }
    };
  });
};

export const saveFileToCache = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.put({ name: file.name, data: arrayBuffer, lastModified: file.lastModified });
  await tx.done;
};

export const loadFileFromCache = async (filename) => {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const record = await store.get(filename);
  if (!record) return null;
  const safeName = record.name || 'shipment_cached.xlsx';
  const blob = new Blob([record.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  return new File([blob], safeName, { lastModified: record.lastModified || Date.now() });
};

export const listCachedFiles = async () => {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  return new Promise((resolve) => {
    const files = [];
    store.openCursor().onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        files.push({ name: cursor.value.name, lastModified: cursor.value.lastModified });
        cursor.continue();
      } else {
        resolve(files);
      }
    };
  });
};

export const clearCache = async () => {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  await store.clear();
  localStorage.removeItem('shipmentCacheMeta'); // на всякий случай
  await tx.done;
};

// Хук для удобного использования в компонентах
export function useShipmentCache() {
  const [cachedFiles, setCachedFiles] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const files = await listCachedFiles();
      setCachedFiles(files);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return {
    cachedFiles,
    loading,
    refresh,
    saveFileToCache,
    loadFileFromCache,
    clearCache
  };
}