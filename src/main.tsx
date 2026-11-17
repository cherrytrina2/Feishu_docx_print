import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { checkVersionAndRefresh } from './utils/version';

// 检测版本变化，如有新版本自动刷新
checkVersionAndRefresh();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
