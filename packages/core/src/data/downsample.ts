/**
 * Largest-Triangle-Three-Buckets downsampling (Steinarsson, 2013).
 * Preserves visual shape (peaks/troughs) far better than nth-point sampling.
 */
export interface XYPoint {
  x: number;
  y: number;
}

/**
 * Downsample `data` to at most `threshold` points. The first and last points
 * are always kept. Returns the input array (same reference) when no
 * downsampling is needed.
 */
export function downsampleLTTB<P extends XYPoint>(data: readonly P[], threshold: number): P[] {
  const n = data.length;
  if (threshold >= n || threshold <= 0 || n === 0) return data as P[];
  if (threshold === 1) return [data[0] as P];
  if (threshold === 2) return [data[0] as P, data[n - 1] as P];

  const sampled: P[] = new Array(threshold);
  const bucketSize = (n - 2) / (threshold - 2);

  let a = 0; // index of the previously selected point
  sampled[0] = data[0] as P;

  for (let i = 0; i < threshold - 2; i++) {
    // Average of the *next* bucket (anchor for the triangle).
    let avgX = 0;
    let avgY = 0;
    let rangeStart = Math.floor((i + 1) * bucketSize) + 1;
    const rangeEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, n);
    const avgCount = Math.max(1, rangeEnd - rangeStart);
    for (let j = rangeStart; j < rangeEnd; j++) {
      const p = data[j] as P;
      avgX += p.x;
      avgY += p.y;
    }
    avgX /= avgCount;
    avgY /= avgCount;

    // Current bucket range.
    rangeStart = Math.floor(i * bucketSize) + 1;
    const rangeTo = Math.min(Math.floor((i + 1) * bucketSize) + 1, n - 1);

    const pa = data[a] as P;
    let maxArea = -1;
    let maxIndex = rangeStart;
    for (let j = rangeStart; j < rangeTo; j++) {
      const p = data[j] as P;
      const area = Math.abs((pa.x - avgX) * (p.y - pa.y) - (pa.x - p.x) * (avgY - pa.y));
      if (area > maxArea) {
        maxArea = area;
        maxIndex = j;
      }
    }
    sampled[i + 1] = data[maxIndex] as P;
    a = maxIndex;
  }

  sampled[threshold - 1] = data[n - 1] as P;
  return sampled;
}
