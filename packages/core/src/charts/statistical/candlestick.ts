/**
 * Candlestick (v0.2): body o→c filled theme.up/theme.down, wick h→l at 1px,
 * time x-axis, per-mark tooltip with an OHLC block, never animated.
 * All shared logic lives in ./financial.ts.
 */
import { makeFinancialDefinition } from './financial';

export const candlestickDefinition = makeFinancialDefinition('candlestick');
