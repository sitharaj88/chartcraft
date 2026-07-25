import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';

import ChartDemo from './components/ChartDemo.vue';
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
// v0.3 chart types
import DemoRangearea from './components/DemoRangearea.vue';
import DemoBullet from './components/DemoBullet.vue';
import DemoDumbbell from './components/DemoDumbbell.vue';
import DemoLollipop from './components/DemoLollipop.vue';
import DemoSlope from './components/DemoSlope.vue';
import DemoStreamgraph from './components/DemoStreamgraph.vue';
import DemoMarimekko from './components/DemoMarimekko.vue';
import DemoPyramid from './components/DemoPyramid.vue';
import DemoCalendar from './components/DemoCalendar.vue';
import DemoRadialbar from './components/DemoRadialbar.vue';
import DemoRose from './components/DemoRose.vue';
import DemoViolin from './components/DemoViolin.vue';
import DemoParallel from './components/DemoParallel.vue';
import DemoIcicle from './components/DemoIcicle.vue';
import DemoCirclepack from './components/DemoCirclepack.vue';
import DemoWordcloud from './components/DemoWordcloud.vue';
import DemoSankey from './components/DemoSankey.vue';
import DemoGantt from './components/DemoGantt.vue';
import DemoChoropleth from './components/DemoChoropleth.vue';
import DemoNetwork from './components/DemoNetwork.vue';
// v0.3 cross-cutting features
import DemoErrorBars from './components/DemoErrorBars.vue';
import DemoTrendlines from './components/DemoTrendlines.vue';
import DemoDataLabels from './components/DemoDataLabels.vue';
import DemoAnnotations from './components/DemoAnnotations.vue';
import DemoZoom from './components/DemoZoom.vue';
import DemoExport from './components/DemoExport.vue';

// Landing page
import HomePage from './components/home/HomePage.vue';
import HomeHero from './components/home/HomeHero.vue';
import HeroShowcase from './components/home/HeroShowcase.vue';
import HomeStats from './components/home/HomeStats.vue';
import HomeSection from './components/home/HomeSection.vue';
import HomeTypes from './components/home/HomeTypes.vue';
import HomeA11y from './components/home/HomeA11y.vue';
import HomePerf from './components/home/HomePerf.vue';
import HomePalette from './components/home/HomePalette.vue';
import HomeFrameworks from './components/home/HomeFrameworks.vue';
import HomeCode from './components/home/HomeCode.vue';
import HomeCta from './components/home/HomeCta.vue';
// Gallery
import GalleryGrid from './components/gallery/GalleryGrid.vue';
import GalleryCard from './components/gallery/GalleryCard.vue';

import './custom.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    // Scroll-reveal opts IN via this class, so a no-JS render never ends up
    // with permanently invisible sections (see custom.css).
    if (typeof document !== 'undefined') document.documentElement.classList.add('cc-js');

    app.component('ChartDemo', ChartDemo);
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
    // v0.3 chart types
    app.component('DemoRangearea', DemoRangearea);
    app.component('DemoBullet', DemoBullet);
    app.component('DemoDumbbell', DemoDumbbell);
    app.component('DemoLollipop', DemoLollipop);
    app.component('DemoSlope', DemoSlope);
    app.component('DemoStreamgraph', DemoStreamgraph);
    app.component('DemoMarimekko', DemoMarimekko);
    app.component('DemoPyramid', DemoPyramid);
    app.component('DemoCalendar', DemoCalendar);
    app.component('DemoRadialbar', DemoRadialbar);
    app.component('DemoRose', DemoRose);
    app.component('DemoViolin', DemoViolin);
    app.component('DemoParallel', DemoParallel);
    app.component('DemoIcicle', DemoIcicle);
    app.component('DemoCirclepack', DemoCirclepack);
    app.component('DemoWordcloud', DemoWordcloud);
    app.component('DemoSankey', DemoSankey);
    app.component('DemoGantt', DemoGantt);
    app.component('DemoChoropleth', DemoChoropleth);
    app.component('DemoNetwork', DemoNetwork);
    // v0.3 cross-cutting features
    app.component('DemoErrorBars', DemoErrorBars);
    app.component('DemoTrendlines', DemoTrendlines);
    app.component('DemoDataLabels', DemoDataLabels);
    app.component('DemoAnnotations', DemoAnnotations);
    app.component('DemoZoom', DemoZoom);
    app.component('DemoExport', DemoExport);
    // Landing page
    app.component('HomePage', HomePage);
    app.component('HomeHero', HomeHero);
    app.component('HeroShowcase', HeroShowcase);
    app.component('HomeStats', HomeStats);
    app.component('HomeSection', HomeSection);
    app.component('HomeTypes', HomeTypes);
    app.component('HomeA11y', HomeA11y);
    app.component('HomePerf', HomePerf);
    app.component('HomePalette', HomePalette);
    app.component('HomeFrameworks', HomeFrameworks);
    app.component('HomeCode', HomeCode);
    app.component('HomeCta', HomeCta);
    // Gallery
    app.component('GalleryGrid', GalleryGrid);
    app.component('GalleryCard', GalleryCard);
  },
} satisfies Theme;
