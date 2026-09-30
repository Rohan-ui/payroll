import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { PublicOfferView } from './views/public/PublicOfferView';
import { PublicDocumentsView } from './views/public/PublicDocumentsView';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Failed to find root element');
}

// A candidate's offer and document links open on their own, outside sign-in: their token is the only key.
const linkToken = (path: string) => (window.location.pathname === path ? new URLSearchParams(window.location.search).get('token') : null);
const offerToken = linkToken('/offer');
const documentsToken = linkToken('/documents');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    {offerToken !== null ? <PublicOfferView token={offerToken} /> : documentsToken !== null ? <PublicDocumentsView token={documentsToken} /> : <App />}
  </React.StrictMode>,
);
