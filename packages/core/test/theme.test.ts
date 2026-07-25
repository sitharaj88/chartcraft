import { beforeEach, describe, expect, it } from 'vitest';
import { categoricalPalette, darkTheme, lightTheme, resolveTheme, sequentialPalette } from '../src/theme';
import { resetMediaQueries, setMediaQuery } from './setup';

describe('palette values (validated — exact hexes, exact order)', () => {
  it('light categorical slots match the contract table', () => {
    expect(categoricalPalette.light).toEqual([
      '#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948',
    ]);
  });

  it('dark categorical slots match the contract table', () => {
    expect(categoricalPalette.dark).toEqual([
      '#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767',
    ]);
  });

  it('has exactly 8 slots per scheme and themes carry them in order', () => {
    expect(categoricalPalette.light).toHaveLength(8);
    expect(categoricalPalette.dark).toHaveLength(8);
    expect(lightTheme.series).toEqual(categoricalPalette.light);
    expect(darkTheme.series).toEqual(categoricalPalette.dark);
  });

  it('sequential ramp is the exact 13-step blue ramp, light to dark', () => {
    expect(sequentialPalette).toEqual([
      '#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5',
      '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b',
    ]);
  });

  it('chrome colors match the contract', () => {
    expect(lightTheme.surface).toBe('#fcfcfb');
    expect(lightTheme.textPrimary).toBe('#0b0b0b');
    expect(lightTheme.gridline).toBe('#e1e0d9');
    expect(darkTheme.surface).toBe('#1a1a19');
    expect(darkTheme.textPrimary).toBe('#ffffff');
    expect(darkTheme.axisLine).toBe('#383835');
    expect(lightTheme.textMuted).toBe('#898781');
    expect(darkTheme.textMuted).toBe('#898781');
  });
});

describe('resolveTheme', () => {
  beforeEach(() => resetMediaQueries());

  it('resolves explicit names', () => {
    expect(resolveTheme('light')).toBe(lightTheme);
    expect(resolveTheme('dark')).toBe(darkTheme);
  });

  it("'auto' follows prefers-color-scheme", () => {
    setMediaQuery('(prefers-color-scheme: dark)', false);
    expect(resolveTheme('auto').colorScheme).toBe('light');
    setMediaQuery('(prefers-color-scheme: dark)', true);
    expect(resolveTheme('auto').colorScheme).toBe('dark');
    expect(resolveTheme(undefined).colorScheme).toBe('dark');
  });

  it('completes partial custom themes against the base scheme', () => {
    const custom = resolveTheme({ colorScheme: 'dark', surface: '#000000' } as never);
    expect(custom.surface).toBe('#000000');
    expect(custom.textPrimary).toBe(darkTheme.textPrimary);
    expect(custom.series).toEqual(darkTheme.series);
  });
});
