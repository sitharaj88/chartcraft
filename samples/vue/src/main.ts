/**
 * Northwind Cloud (Vue 3 port) — entry point.
 *
 * Everything else lives in components: `App.vue` owns the state, the
 * `components/` folder owns the chrome. `data.ts` and `styles.css` are copied
 * VERBATIM from `samples/vanilla` and are byte-identical across all five ports.
 */
import { createApp } from 'vue';

import App from './App.vue';
import './styles.css';

createApp(App).mount('#app');
