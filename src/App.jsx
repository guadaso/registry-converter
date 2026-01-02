// src/App.jsx
import React, { useEffect } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import Registries from './components/Registries';
import Templates from './components/Templates';

export default function App() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    if (path === '/' || path === '/registries') {
      document.title = 'Registry Converter — Реестры';
    } else if (path === '/templates') {
      document.title = 'Registry Converter — Шаблоны';
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
                to="/registries"
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                Реестры
              </NavLink>
            </li>
          </ul>
        </nav>
      </div>

      {/* Основной контент */}
      <div className="main-content">
        <Routes>
          <Route path="/" element={<Registries />} />
          <Route path="/registries" element={<Registries />} />
          <Route path="/templates" element={<Templates />} />
        </Routes>
      </div>
    </div>
  );
}