/**
 * OHLC (v0.2): 1px h–l bar with open/close ticks left/right, colored
 * theme.up/theme.down by close vs open — same engine as candlestick.
 * All shared logic lives in ./financial.ts.
 */
import { makeFinancialDefinition } from './financial';

export const ohlcDefinition = makeFinancialDefinition('ohlc');
