// src/App.jsx
import React, { useEffect } from 'react';
import { Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom';
import Registries from './components/Registries';
import Templates from './components/Templates';
import RegistriesAutomatic from './components/RegistriesAutomatic/RegistriesAutomatic';

export default function App() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    if (path === '/' || path === '/templates') {
      document.title = 'Registry Converter — Шаблоны';
    } else if (path === '/registries') {
      document.title = 'Registry Converter — Реестры';
    } else {
      document.title = 'Registry Converter';
    }
  }, [location.pathname]);

  return (
    <div className="container">
      {/* Боковое меню */}
      <div className="sidebar">
        <h1>Menu</h1>
        <nav>
          <ul>
            <li>
              <NavLink
                to="/templates"
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                Шаблоны
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/registries/manual"
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                Реестры(Ручной ввод)
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/registries/auto"
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                Реестры(автоматически)
              </NavLink>
            </li>
          </ul>
        </nav>
      </div>

      {/* Основной контент */}
      <div className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/templates" replace />} />
          <Route path="/registries/manual" element={<Registries />} />
          <Route path="/registries/auto" element={<RegistriesAutomatic />} />
          <Route path="/templates" element={<Templates />} />
        </Routes>
      </div>
    </div>
  );
}