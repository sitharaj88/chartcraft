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
import DemoBubble from './components/DemoBubble.vue';
import DemoHistogram from './components/DemoHistogram.vue';
import DemoBoxplot from './components/DemoBoxplot.vue';
import DemoCandlestick from './components/DemoCandlestick.vue';
import DemoWaterfall from './components/DemoWaterfall.vue';
import DemoHeatmap from './components/DemoHeatmap.vue';
import DemoTreemap from './components/DemoTreemap.vue';
import DemoSunburst from './components/DemoSunburst.vue';
import DemoFunnel from './components/DemoFunnel.vue';
import DemoRadar from './components/DemoRadar.vue';
import DemoGauge from './components/DemoGauge.vue';
import DemoSparklineRow from './components/DemoSparklineRow.vue';
import DemoCombo from './components/DemoCombo.vue';

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
    app.component('DemoBubble', DemoBubble);
    app.component('DemoHistogram', DemoHistogram);
    app.component('DemoBoxplot', DemoBoxplot);
    app.component('DemoCandlestick', DemoCandlestick);
    app.component('DemoWaterfall', DemoWaterfall);
    app.component('DemoHeatmap', DemoHeatmap);
    app.component('DemoTreemap', DemoTreemap);
    app.component('DemoSunburst', DemoSunburst);
    app.component('DemoFunnel', DemoFunnel);
    app.component('DemoRadar', DemoRadar);
    app.component('DemoGauge', DemoGauge);
    app.component('DemoSparklineRow', DemoSparklineRow);
    app.component('DemoCombo', DemoCombo);
  },
} satisfies Theme;
