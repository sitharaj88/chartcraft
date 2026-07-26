/**
 * Northwind Cloud — Svelte entry point.
 *
 * Everything framework-specific lives in the .svelte components; this file only
 * mounts the app and pulls in the shared stylesheet (copied verbatim from the
 * vanilla sample, as is `data.ts`).
 */

import { mount } from 'svelte';

import App from './App.svelte';
import './styles.css';

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app');

export default mount(App, { target });
