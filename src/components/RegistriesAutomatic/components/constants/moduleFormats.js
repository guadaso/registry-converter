// src/constants/moduleFormats.js

export const MODULE_FORMATS = [
  { key: '04B6481958134315', regex: /^04B\d{13}$/ },
  { key: '6ZRI8911468998', regex: /^\dZRI\d{10}$/ },
  { key: '8ZRI9960014284', regex: /^\dZRI\d{10}$/ },
  { key: '25003162', regex: /^\d{8}$/ },
  { key: '860751078007207', regex: /^\d{15}$/ },
  { key: '2025 4356945', regex: /^(202[0-9]|2030) \d{7}$/ }
];

// Для generic_last7 используем отдельный флаг — он не требует regex валидации