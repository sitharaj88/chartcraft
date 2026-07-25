/**
 * Candlestick (v0.2): body o→c in theme.up/theme.down, wick h→l at 1px,
 * time x-axis, per-mark tooltip with an OHLC block, never animated.
 *
 * v0.3.1: the body is HOLLOW when rising and solid when falling, so direction
 * survives deuteranopia (where up/down separate at only ΔE 4.1), greyscale and
 * forced-colors mode. See `CANDLE_FILL_CONVENTION` in ./financial.ts.
 *
 * All shared logic lives in ./financial.ts.
 */
import { makeFinancialDefinition } from './financial';

export const candlestickDefinition = makeFinancialDefinition('candlestick');
