/**
 * A frame-budgeted mount queue.
 *
 * The gallery puts 40 live canvases on one page. Scrolling can bring a whole
 * row into view at once, and mounting a row synchronously means several chart
 * layouts inside a single task — visible jank. This drains the queue inside a
 * budget per animation frame: at least one chart always lands (so the grid
 * never stalls), and the drain stops as soon as the frame's budget is spent,
 * so the main thread stays interactive while the rest fills in.
 *
 * Requests are dropped when their card scrolls away before it is drained
 * (`cancel`), so a fast scroll never pays for charts nobody saw.
 */
import { nextTick } from 'vue';

const FRAME_BUDGET_MS = 6;

const queue: (() => void)[] = [];
let scheduled = false;

async function drain(): Promise<void> {
  scheduled = false;
  const start = performance.now();
  // `do` not `while`: one job always runs, otherwise a machine slow enough to
  // blow the budget on a single chart would never drain the queue at all.
  do {
    const job = queue.shift();
    if (!job) break;
    job();
    // A job only flips a `v-if`; the chart is created in Vue's flush. Awaiting
    // it is what makes the elapsed time above mean anything — without this the
    // whole queue would drain in one frame and all 40 charts would mount in a
    // single flush, which is exactly the stall this queue exists to prevent.
    await nextTick();
  } while (performance.now() - start < FRAME_BUDGET_MS);
  if (queue.length) schedule();
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => void drain());
}

export function enqueueMount(job: () => void): () => void {
  queue.push(job);
  schedule();
  return () => {
    const i = queue.indexOf(job);
    if (i >= 0) queue.splice(i, 1);
  };
}
