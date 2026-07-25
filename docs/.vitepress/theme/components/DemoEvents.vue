<script setup lang="ts">
/**
 * Events demo: click a point (or focus the chart and press Enter) and the
 * `pointclick` payload is appended to the log below. Keyboard-originated
 * events carry clientX === clientY === -1.
 */
import { ref } from 'vue';
import type { PointEvent } from '@chartcraft/vue';
import type { ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
  type: 'line',
  title: 'p95 latency by region',
  subtitle: 'Click a point — or Tab to the chart and press Enter',
  data: {
    categories: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
    series: [
      { id: 'us-east', name: 'US East', data: [212, 198, 231, 305, 288, 240] },
      { id: 'eu-west', name: 'EU West', data: [188, 176, 214, 262, 251, 209] },
    ],
  },
  yAxis: { label: 'Latency (ms)', min: 0 },
};

interface LogEntry {
  id: number;
  text: string;
  origin: 'pointer' | 'keyboard';
}

let nextId = 0;
const log = ref<LogEntry[]>([]);

function onPointClick(ev: PointEvent) {
  const origin = ev.clientX === -1 && ev.clientY === -1 ? 'keyboard' : 'pointer';
  log.value.unshift({
    id: nextId++,
    text: `pointclick  ${ev.seriesName} — x: ${String(ev.x)}, y: ${ev.y} (index ${ev.dataIndex})`,
    origin,
  });
  if (log.value.length > 8) log.value.pop();
}
</script>

<template>
  <div>
    <ChartDemo :options="options" @point-click="onPointClick" />
    <div class="demo-events__log" role="log" aria-label="pointclick event log">
      <p v-if="log.length === 0" class="demo-events__empty">
        No events yet — click a data point above.
      </p>
      <ul v-else>
        <li v-for="entry in log" :key="entry.id">
          <code>{{ entry.text }}</code>
          <span class="demo-events__origin">{{ entry.origin }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.demo-events__log {
  margin: 0 0 16px;
  padding: 10px 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background-color: var(--vp-c-bg-soft);
  min-height: 56px;
  font-size: 13px;
}

.demo-events__log ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.demo-events__log li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin: 4px 0;
}

.demo-events__log code {
  background: none;
  padding: 0;
}

.demo-events__empty {
  margin: 4px 0;
  color: var(--vp-c-text-2);
}

.demo-events__origin {
  flex: none;
  color: var(--vp-c-text-3);
  font-size: 12px;
}
</style>
