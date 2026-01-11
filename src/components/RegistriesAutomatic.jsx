// src/components/RegistriesAutomatic.jsx
import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';

// Импорты из новых файлов
import { handleSourceFile, handleSourceFileChange, handleStart, handleDragOver, handleDrop } from './RegistriesAutomaticComponents/uploadParsing';
import { addLog, LogEntry, ProgressBar } from './RegistriesAutomaticComponents/Logging';
import { handleShipmentFilesUpload } from './RegistriesAutomaticComponents/manualDispatch';
import { handleStartProcessing } from './RegistriesAutomaticComponents/autoDispatch';
import { processShipmentFiles } from './RegistriesAutomaticComponents/matchingDispatch';
import { renderStep4 } from './RegistriesAutomaticComponents/answer';
import { renderStep1, renderStep2, renderStep3 } from './RegistriesAutomaticComponents/visual';

// Утилиты IndexedDB для хранения файлов
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

const saveFileToCache = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.put({ name: file.name, data: arrayBuffer, lastModified: file.lastModified });
  await tx.done;
};

const loadFileFromCache = async (filename) => {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const record = await store.get(filename);
  if (!record) return null;

  // Защита от пустого имени
  const safeName = record.name || 'shipment_cached.xlsx';
  const blob = new Blob([record.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  return new File([blob], safeName, { lastModified: record.lastModified || Date.now() });
};

const listCachedFiles = async () => {
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

const clearCache = async () => {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  await store.clear();
  localStorage.removeItem('shipmentCacheMeta'); // на всякий случай
  await tx.done;
};

const getCurrentDateTimeString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
};

const normalizeLocation = (loc) => loc ? loc.trim().toLowerCase() : '';

const extractLast7Digits = (str) => {
  const digits = str.replace(/\D/g, '');
  return digits.slice(-7);
};

const readFileAsArrayBuffer = async (file) => await file.arrayBuffer();

const validateModuleFormat = (val, format) => {
  const searchKey = extractLast7Digits(val);
  if (searchKey.length === 7) {
    return { valid: true, searchKey, full: val };
  } else {
    return { valid: false, error: 'Invalid module format: not 7 digits' };
  }
};

function RegistriesAutomatic() {
  const [step, setStep] = useState(1); // 1: upload source, 2: click 'Start', 3: upload shipments, 4: done
  const [sourceFile, setSourceFile] = useState(null);
  const [outputBlob, setOutputBlob] = useState(null);
  const [csvBlob, setCsvBlob] = useState(null);
  const [reportBlob, setReportBlob] = useState(null);
  const [cachedFiles, setCachedFiles] = useState([]);

  const [selectedCachedFiles, setSelectedCachedFiles] = useState(new Set()); // Set для множественного выбора
  const [showCachedFiles, setShowCachedFiles] = useState(false); // галочка "показать кэш"
  const [uploadedFilesForProcessing, setUploadedFilesForProcessing] = useState(null); // временно храним загруженные файлы
  const [progress, setProgress] = useState({ step1: 0, step3: 0 });
  const [logs, setLogs] = useState([]);
  const [processing, setProcessing] = useState(false);

  const [totalInputRows, setTotalInputRows] = useState(0);
  const [removedDuplicates, setRemovedDuplicates] = useState(0);
  const [removedInvalid, setRemovedInvalid] = useState(0);
  const [notFoundRecords, setNotFoundRecords] = useState([]);
  const [allRecordsWithIssues, setAllRecordsWithIssues] = useState([]);
  const [validRecords, setValidRecords] = useState([]);
  const [shipmentFilesData, setShipmentFilesData] = useState([]);

  const sourceWorkbookRef = useRef(null);
  const logsEndRef = useRef(null);
  const autoDetectedConfigRef = useRef(null);

  const foundMapRef = useRef(new Map());
  const sheetSearchKeyMapRef = useRef(new Map());
  const detectedFormatRef = useRef(null);

  useEffect(() => {
    if (autoDetectedConfigRef.current) {
      detectedFormatRef.current = autoDetectedConfigRef.current.selectedFormat;
    }
  }, []);

  useEffect(() => {
    const loadCached = async () => {
      const files = await listCachedFiles();
      setCachedFiles(files);
      // По умолчанию выбираем все, но только если showCachedFiles === true
      if (files.length > 0) {
        const allNames = new Set(files.map(f => f.name));
        setSelectedCachedFiles(allNames);
      }
    };
    if (step === 3) {
      loadCached();
    }
  }, [step]);

  useEffect(() => {
    foundMapRef.current = new Map();
    sheetSearchKeyMapRef.current = new Map();
    // Populate on step 4 render if needed
    if (step === 4) {
      // This is a workaround — in real app, these should be passed directly
      // But since we can't easily pass refs to renderStep4, we rely on closure
      // The current implementation already captures foundMap/sheetSearchKeyMap in closure
    }
  }, [step]);

  // Bound handlers to pass correct parameters
  const boundAddLog = (message, type = 'info') => addLog(message, type, setLogs);
  const boundHandleSourceFileChange = (e) => handleSourceFileChange(e, handleSourceFile, setLogs, setSourceFile, boundAddLog, setProgress, progress, sourceWorkbookRef, autoDetectedConfigRef, setStep);
  const boundHandleDrop = (e) => handleDrop(e, step, handleSourceFile, setLogs, setSourceFile, boundAddLog, setProgress, progress, sourceWorkbookRef, autoDetectedConfigRef, setUploadedFilesForProcessing, setStep);
  const boundHandleStart = () => handleStart(setStep);
  const boundHandleShipmentFilesUpload = (e) => handleShipmentFilesUpload(e, setUploadedFilesForProcessing, boundAddLog);
  const boundHandleStartProcessing = () => handleStartProcessing({
    uploadedFilesForProcessing,
    showCachedFiles,
    selectedCachedFiles,
    addLog: boundAddLog,
    setLogs,
    setProcessing,
    setProgress,
    progress,
    setUploadedFilesForProcessing,
    clearCache,
    saveFileToCache,
    loadFileFromCache,
    processShipmentFiles: (files) => processShipmentFiles({
      files,
      addLog: boundAddLog,
      setProcessing,
      setProgress,
      progress,
      autoDetectedConfigRef,
      sourceWorkbookRef,
      setValidRecords,
      setAllRecordsWithIssues,
      setRemovedInvalid,
      setRemovedDuplicates,
      setTotalInputRows,
      setShipmentFilesData,
      setNotFoundRecords,
      setOutputBlob,
      setCsvBlob,
      updateReportWithMatches: (validRecordsList, foundMap, notFound, singletonRecords, shipmentData, sheetSearchKeyMap, noLocation) => updateReportWithMatches({
        validRecordsList,
        foundMap,
        notFound,
        singletonRecords,
        shipmentData,
        sheetSearchKeyMap,
        noLocation,
        setReportBlob,
        XLSX
      }),
      setReportBlob,
      setStep,
      normalizeLocation,
      validateModuleFormat,
      extractLast7Digits,
      readFileAsArrayBuffer,
      XLSX,
      detectedFormatRef,
      setLogs
    })
  });

  return (
    <div className="registries-container" style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflowY: 'auto'
    }}>
      <div className="page-header">
        <h2>Реестры (авто)</h2>
        <p>Загрузите файл — система всё определит сама</p>
      </div>
      <div className="page-body" style={{ flex: 1 }}>
        <div
          id="registriesWorkflow"
          style={{
            width: '100%',
            maxWidth: '800px',
            margin: '0 auto',
            textAlign: 'left',
            paddingBottom: '20px'
          }}
        >
          {step === 1 && renderStep1({
            handleDragOver,
            handleDrop: boundHandleDrop,
            handleSourceFileChange: boundHandleSourceFileChange,
            processing,
            progress,
            logs,
            logsEndRef,
            LogEntry,
            ProgressBar
          })}
          {step === 2 && renderStep2({
            handleStart: boundHandleStart,
            processing,
            logs,
            logsEndRef,
            LogEntry
          })}
          {step === 3 && renderStep3({
            handleDragOver,
            handleDrop: boundHandleDrop,
            handleShipmentFilesUpload: boundHandleShipmentFilesUpload,
            setUploadedFilesForProcessing,
            addLog: boundAddLog,
            processing,
            showCachedFiles,
            setShowCachedFiles,
            cachedFiles,
            selectedCachedFiles,
            setSelectedCachedFiles,
            uploadedFilesForProcessing,
            handleStartProcessing: boundHandleStartProcessing,
            progress,
            logs,
            logsEndRef,
            LogEntry,
            ProgressBar
          })}
          {step === 4 && renderStep4({
            outputBlob,
            csvBlob,
            reportBlob,
            totalInputRows,
            removedDuplicates,
            removedInvalid,
            validRecords,
            notFoundRecords,
            getCurrentDateTimeString,
            downloadBlob,
            noLocation: autoDetectedConfigRef.current?.noLocation || false,
            foundMapRef,
            sheetSearchKeyMapRef
          })}
        </div>
      </div>
    </div>
  );
}

export default RegistriesAutomatic;