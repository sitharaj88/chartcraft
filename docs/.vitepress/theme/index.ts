import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';

import ChartDemo from './components/ChartDemo.vue';
import DemoHero from './components/DemoHero.vue';
import DemoLine from './components/DemoLine.vue';
import DemoAreaStacked from './components/DemoAreaStacked.vue';
import DemoBarGrouped from './components/DemoBarGrouped.vue';
import DemoBarHorizontal from './components/DemoBarHorizontal.vue';
import DemoScatter from './components/DemoScatter.vue';
import DemoPieDonut from './components/DemoPieDonut.vue';
import DemoLargeData from './components/DemoLargeData.vue';
import DemoThemes from './components/DemoThemes.vue';
import DemoEvents from './components/DemoEvents.vue';

import './custom.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('ChartDemo', ChartDemo);
    app.component('DemoHero', DemoHero);
    app.component('DemoLine', DemoLine);
    app.component('DemoAreaStacked', DemoAreaStacked);
    app.component('DemoBarGrouped', DemoBarGrouped);
    app.component('DemoBarHorizontal', DemoBarHorizontal);
    app.component('DemoScatter', DemoScatter);
    app.component('DemoPieDonut', DemoPieDonut);
    app.component('DemoLargeData', DemoLargeData);
    app.component('DemoThemes', DemoThemes);
    app.component('DemoEvents', DemoEvents);
  },
} satisfies Theme;
