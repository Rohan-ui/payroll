import React from 'react';
import ReactDOM from 'react-dom/client';
import PlatformApp from './PlatformApp';
import '../index.css';

const rootElement = document.getElementById('platform-root');

if (!rootElement) {
  throw new Error('Platform portal root element was not found.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <PlatformApp />
  </React.StrictMode>,
);
