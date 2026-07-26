/**
 * Northwind Cloud — React entry point.
 *
 * The stylesheet is imported here, before the first render, so the cards have
 * their heights from `styles.css` by the time `@chartcraft/react` creates a
 * chart in its mount effect — a chart sized against a 0px container is the
 * classic "empty card" bug.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import './styles.css';

const host = document.getElementById('root');
if (!host) throw new Error('Missing #root');

createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
