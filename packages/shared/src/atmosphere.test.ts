import { describe, expect, it } from 'vitest';
import { atmosphereFor, autoWeather, DEFAULT_SHOW, festiveFor, parseShow, seasonFor, type WeatherContext } from './show.ts';

const ctx = (o: Partial<WeatherContext> = {}): WeatherContext => ({ season: 'summer', festive: 'off', seed: 'g1', round: 4, status: 'running', pressure: 0, finale: false, ...o });

describe('Wetter, Jahreszeit, Festzeit', () => {
  it('Jahreszeit und Festzeit nach Datum', () => {
    expect(seasonFor(new Date(2026, 0, 10))).toBe('winter');
    expect(seasonFor(new Date(2026, 3, 10))).toBe('spring');
    expect(seasonFor(new Date(2026, 6, 10))).toBe('summer');
    expect(seasonFor(new Date(2026, 9, 10))).toBe('autumn');
    expect(festiveFor(new Date(2026, 9, 31))).toBe('halloween');
    expect(festiveFor(new Date(2026, 10, 2))).toBe('halloween');
    expect(festiveFor(new Date(2026, 10, 3))).toBe('off');
    expect(festiveFor(new Date(2026, 11, 24))).toBe('christmas');
    expect(festiveFor(new Date(2026, 11, 27))).toBe('off');
  });

  it('Automatik: gleich für alle Beamer, wechselt mit den Runden, passt sich dem Spiel an', () => {
    expect(autoWeather(ctx())).toBe(autoWeather(ctx()));
    // über viele Runden kommt im Sommer mehr als ein Wetter vor, im Winter vor allem Schnee
    const summer = new Set(Array.from({ length: 60 }, (_, r) => autoWeather(ctx({ round: r + 1, seed: 'abc' }))));
    expect(summer.size).toBeGreaterThan(1);
    const winter = Array.from({ length: 60 }, (_, r) => autoWeather(ctx({ season: 'winter', round: r + 1, seed: 'abc' })));
    expect(winter.filter((w) => w === 'snow').length).toBeGreaterThan(15);
    expect(winter).not.toContain('rain');
    // Finale dramatisch, Sieg mit klarem Himmel, Weihnachten verschneit
    expect(autoWeather(ctx({ finale: true }))).toBe('storm');
    expect(autoWeather(ctx({ season: 'winter', finale: true }))).toBe('snow');
    expect(autoWeather(ctx({ status: 'finished' }))).toBe('clear');
    expect(autoWeather(ctx({ festive: 'christmas', round: 1 }))).toBe('snow');
    expect(autoWeather(ctx({ pressure: 0.9 }))).toBe('cloudy');
  });

  it('feste Einstellung gewinnt, alte Einstellungen bekommen „automatisch“', () => {
    expect(atmosphereFor({ weather: 'rain', season: 'spring', festive: 'halloween' }, null)).toEqual({ weather: 'rain', season: 'spring', festive: 'halloween' });
    const old = parseShow({ quality: 'high' });
    expect(old.weather).toBe('auto');
    expect(old.festive).toBe('auto');
    expect(DEFAULT_SHOW.season).toBe('auto');
    expect(parseShow({ weather: 'tornado' }).weather).toBe('auto');
  });
});
