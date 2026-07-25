<script setup lang="ts">
/**
 * The hero demo: ONE chart instance that morphs between six genuinely
 * different types.
 *
 * This is not a carousel of screenshots and not six charts fading over each
 * other — it is a single `createChart` container driven by real
 * `chart.update()` calls (the Vue wrapper deep-watches `options` and routes
 * every change through it). The thing you are looking at is the product.
 *
 * Motion policy: auto-cycling only when the user has not asked for reduced
 * motion, and it stops the moment they touch a chip, hover the card, or move
 * focus into it — an animation nobody can pause is a defect, not a feature.
 * Under `prefers-reduced-motion: reduce` nothing cycles: the chart renders one
 * composed chart and the chips are the only way it changes.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useData } from 'vitepress';
import { Chart } from '@chartcraft/vue';
import type { ChartOptions } from '@chartcraft/vue';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CYCLE_MS = 4200;

interface Step {
  label: string;
  options: Omit<ChartOptions, 'theme'>;
}

/*
 * Series ids are `s1`, `s2`, … across EVERY step on purpose. Palette slots are
 * assigned by first-seen series identity, so unique ids per step would walk the
 * palette forward on every transition and the hero would arrive at slot 7 for
 * no reason a visitor could see. Shared ids keep slot 1 blue in all six.
 */

const steps: Step[] = [
  {
    label: 'Line',
    options: {
      type: 'line',
      title: 'Monthly recurring revenue',
      subtitle: 'FY2026, USD thousands',
      data: {
        categories: MONTHS,
        series: [
          {
            id: 's1',
            name: 'Enterprise',
            curve: 'monotone',
            data: [182, 194, 201, 216, 228, 245, 259, 271, 290, 308, 331, 356],
          },
          {
            id: 's2',
            name: 'Team',
            curve: 'monotone',
            data: [104, 109, 117, 121, 130, 136, 145, 149, 158, 167, 172, 181],
          },
          {
            id: 's3',
            name: 'Starter',
            curve: 'monotone',
            data: [58, 61, 63, 68, 70, 74, 76, 81, 83, 88, 91, 95],
          },
        ],
      },
      xAxis: {},
      yAxis: { min: 0 },
      a11y: {
        description:
          'All three plans grew through FY2026; Enterprise MRR nearly doubled from 182 to 356 thousand US dollars.',
      },
    },
  },
  {
    label: 'Bar',
    options: {
      type: 'bar',
      title: 'Revenue by quarter',
      subtitle: 'Product and services, USD millions',
      data: {
        categories: ['Q1', 'Q2', 'Q3', 'Q4'],
        series: [
          { id: 's1', name: 'Product', data: [12.4, 13.1, 14.8, 16.2] },
          { id: 's2', name: 'Services', data: [6.1, 6.4, 7.0, 7.9] },
          { id: 's3', name: 'Marketplace', data: [2.2, 2.9, 3.4, 4.1] },
        ],
      },
      xAxis: {},
      yAxis: { min: 0 },
      a11y: {
        description:
          'Every revenue line grew each quarter; product revenue rose from 12.4 to 16.2 million US dollars.',
      },
    },
  },
  {
    label: 'Sankey',
    options: {
      type: 'sankey',
      title: 'Signup to paid conversion',
      subtitle: 'Last quarter · ribbon width ∝ users',
      sankey: { nodeWidth: 14, nodePadding: 9, align: 'justify' },
      data: {
        series: [
          {
            id: 's1',
            name: 'Users',
            data: {
              nodes: [
                { id: 'organic', label: 'Organic' },
                { id: 'paid', label: 'Paid social' },
                { id: 'partner', label: 'Partners' },
                { id: 'signup', label: 'Signed up' },
                { id: 'trial', label: 'Trial' },
                { id: 'bounced', label: 'Never returned' },
                { id: 'activated', label: 'Activated' },
                { id: 'stalled', label: 'Stalled' },
                { id: 'paidplan', label: 'Paid plan' },
                { id: 'lapsed', label: 'Lapsed' },
              ],
              links: [
                { source: 'organic', target: 'signup', value: 4200 },
                { source: 'paid', target: 'signup', value: 2600 },
                { source: 'partner', target: 'signup', value: 1800 },
                { source: 'signup', target: 'trial', value: 5100 },
                { source: 'signup', target: 'bounced', value: 3500 },
                { source: 'trial', target: 'activated', value: 3100 },
                { source: 'trial', target: 'stalled', value: 2000 },
                { source: 'activated', target: 'paidplan', value: 1850 },
                { source: 'activated', target: 'lapsed', value: 1250 },
              ],
            },
          },
        ],
      },
      a11y: {
        description:
          'Of 8,600 signups, 5,100 started a trial and 1,850 converted to a paid plan — 21 percent.',
      },
    },
  },
  {
    label: 'Heatmap',
    options: {
      type: 'heatmap',
      title: 'Support tickets by weekday and hour',
      subtitle: 'Average per 4-hour block, last quarter',
      data: {
        categories: ['00–04', '04–08', '08–12', '12–16', '16–20', '20–24'],
        series: [
          { id: 's1', name: 'Mon', data: [4, 9, 38, 46, 27, 11] },
          { id: 's2', name: 'Tue', data: [3, 8, 41, 44, 25, 10] },
          { id: 's3', name: 'Wed', data: [4, 10, 43, 47, 28, 12] },
          { id: 's4', name: 'Thu', data: [3, 9, 39, 42, 26, 11] },
          { id: 's5', name: 'Fri', data: [5, 8, 34, 31, 18, 9] },
          { id: 's6', name: 'Sat', data: [6, 5, 12, 15, 13, 8] },
          { id: 's7', name: 'Sun', data: [5, 4, 9, 12, 11, 7] },
        ],
      },
      a11y: {
        description:
          'Ticket volume peaks during weekday business hours and falls to single digits overnight and at weekends.',
      },
    },
  },
  {
    label: 'Radar',
    options: {
      type: 'radar',
      title: 'Vendor evaluation',
      subtitle: 'Weighted scores, 0–10',
      data: {
        categories: ['Performance', 'Security', 'Support', 'Documentation', 'Pricing', 'Ecosystem'],
        series: [
          { id: 's1', name: 'Vendor A', data: [8.4, 7.2, 6.1, 8.8, 5.6, 7.9] },
          { id: 's2', name: 'Vendor B', data: [6.9, 8.6, 8.2, 6.4, 7.8, 5.7] },
        ],
      },
      a11y: {
        description:
          'Vendor A leads on performance and documentation; Vendor B leads on security, support and pricing.',
      },
    },
  },
  {
    label: 'Treemap',
    options: {
      type: 'treemap',
      title: 'Revenue by product line',
      subtitle: 'FY2026 ($M) — cell area = revenue',
      data: {
        series: [
          {
            id: 's1',
            name: 'Revenue',
            data: [
              {
                label: 'Platform',
                children: [
                  { label: 'Subscriptions', value: 46.2 },
                  { label: 'Usage overages', value: 11.8 },
                  { label: 'Premium support', value: 7.4 },
                ],
              },
              {
                label: 'Services',
                children: [
                  { label: 'Consulting', value: 14.6 },
                  { label: 'Training', value: 5.2 },
                ],
              },
              {
                label: 'Marketplace',
                children: [
                  { label: 'App revenue share', value: 8.9 },
                  { label: 'Listings', value: 2.3 },
                ],
              },
              { label: 'Other', value: 3.6 },
            ],
          },
        ],
      },
      a11y: {
        description:
          'Platform is the largest line at 65.4 million US dollars, followed by services at 19.8 and marketplace at 11.2.',
      },
    },
  },
];

const { isDark } = useData();

const index = ref(0);
/** Transient: the pointer or focus is inside the card. */
const hovering = ref(false);
/** Sticky: the visitor picked a type, so the carousel does not take it back. */
const pinned = ref(false);
const reduced = ref(false);

const options = computed<ChartOptions>(() => ({
  ...(steps[index.value].options as ChartOptions),
  theme: isDark.value ? 'dark' : 'light',
}));

let timer: ReturnType<typeof setInterval> | undefined;

function stop(): void {
  if (timer !== undefined) clearInterval(timer);
  timer = undefined;
}

function start(): void {
  stop();
  if (reduced.value || pinned.value || hovering.value) return;
  timer = setInterval(() => {
    index.value = (index.value + 1) % steps.length;
  }, CYCLE_MS);
}

function select(i: number): void {
  // A deliberate choice always wins over the carousel, permanently.
  index.value = i;
  pinned.value = true;
  stop();
}

function hold(): void {
  hovering.value = true;
  stop();
}

function release(): void {
  hovering.value = false;
  start();
}

let mql: MediaQueryList | null = null;
const onPrefChange = () => {
  reduced.value = mql?.matches ?? false;
  if (reduced.value) stop();
  else start();
};

onMounted(() => {
  mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  reduced.value = mql.matches;
  mql.addEventListener('change', onPrefChange);
  start();
});

onBeforeUnmount(() => {
  stop();
  mql?.removeEventListener('change', onPrefChange);
});
</script>

<template>
  <div
    class="cc-showcase"
    @mouseenter="hold"
    @mouseleave="release"
    @focusin="hold"
    @focusout="release"
  >
    <div class="cc-showcase__frame">
      <Chart class="cc-showcase__chart" :options="options" />
    </div>

    <div class="cc-showcase__bar">
      <div class="cc-chips" role="group" aria-label="Choose a chart type to render">
        <button
          v-for="(step, i) in steps"
          :key="step.label"
          type="button"
          class="cc-chip"
          :aria-pressed="i === index"
          @click="select(i)"
        >
          {{ step.label }}
        </button>
      </div>
      <p class="cc-showcase__note">
        <template v-if="reduced">
          Reduced motion is on — pick a type above.
        </template>
        <template v-else>
          One chart instance, six types, real <code>chart.update()</code> calls.
        </template>
      </p>
    </div>
  </div>
</template>

<style scoped>
.cc-showcase {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cc-showcase__frame {
  box-sizing: border-box;
  padding: 10px;
  height: 340px;
  border: 1px solid var(--cc-border);
  border-radius: var(--cc-radius-lg);
  background-color: var(--vp-c-bg);
  box-shadow: var(--cc-shadow-lg);
  overflow: hidden;
}

@media (min-width: 960px) {
  .cc-showcase__frame {
    height: 420px;
  }
}

.cc-showcase__chart,
.cc-showcase__chart > div {
  height: 100%;
}

.cc-showcase__bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cc-showcase__note {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--vp-c-text-3);
}

.cc-showcase__note code {
  font-size: 0.95em;
  color: var(--vp-c-text-2);
}
</style>
