import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read-night.js';

const night = '2026-10-28';
const event = { at: '2026-10-28T23:00:00+01:00', job: 'job/a', status: 'ok', owner: 'rook' };
let runsDir: string;

beforeEach(() => { runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-')); });
afterEach(() => { rmSync(runsDir, { recursive: true, force: true }); });

function writeEvents(events: unknown[]) {
  writeFileSync(join(runsDir, `${night}.jsonl`), events.map((value) => JSON.stringify(value)).join('\n') + '\n');
}

describe('readNight', () => {
  it('summarizes the supplied night without losing retries, errors, or unowned jobs', () => {
    const result = readNight('runs', night);
    expect(result?.badLines).toBe(1);
    expect(result?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(result?.rows.map((row) => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(result?.rows[0]).toMatchObject({ owner: null, runs: 1, lastError: null });
    expect(result?.rows[1]).toMatchObject({ runs: 4, retries: 3, failures: 0, lastStatus: 'ok', lastError: 'upstream 503' });
    expect(result?.rows[2]).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok', lastError: 'lock held' });
    expect(result?.rows[3]).toMatchObject({ failures: 1, lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('uses chronological order across offsets, retaining timestamps and file-order ties', () => {
    writeEvents([
      { ...event, at: '2026-10-29T01:00:00+02:00', status: 'retry', error: 'latest error', owner: 'old' },
      { ...event, at: '2026-10-29T00:30:00+02:00', status: 'fail', error: 'earlier error' },
      { ...event, at: '2026-10-29T00:00:00+01:00', owner: null },
    ]);
    expect(readNight(runsDir, night)?.rows).toEqual([{
      job: 'job/a', owner: null, runs: 3, retries: 1, failures: 1,
      lastStatus: 'ok', lastError: 'latest error',
      firstAt: '2026-10-29T00:30:00+02:00', lastAt: '2026-10-29T00:00:00+01:00',
    }]);
  });

  it('counts invalid JSON and invalid event fields while continuing past them', () => {
    const invalid = [null, [], 4, {}, { ...event, owner: 3 }, { ...event, job: '' },
      { ...event, status: 'unknown' }, { ...event, error: null },
      { ...event, at: 'not a date' }, { ...event, at: '2026-02-30T23:00:00Z' },
      { ...event, at: '2026-10-28T25:00:00Z' }, { at: event.at, job: event.job, status: 'ok' }];
    const path = join(runsDir, `${night}.jsonl`);
    writeFileSync(path, '{broken\n' + invalid.map((value) => JSON.stringify(value)).join('\n')
      + '\n\n  \r\n' + JSON.stringify(event) + '\r\n');
    const result = readNight(runsDir, night);
    expect(result?.badLines).toBe(invalid.length + 1);
    expect(result?.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
    expect(result?.rows).toHaveLength(1);
  });

  it('returns an empty digest for an existing empty file', () => {
    writeFileSync(join(runsDir, `${night}.jsonl`), '');
    expect(readNight(runsDir, night)).toEqual({ night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('returns null for missing files and invalid or traversal night identifiers', () => {
    expect(readNight(runsDir, night)).toBeNull();
    writeEvents([event]);
    for (const invalid of ['../2026-10-28', '/2026-10-28', '2026-10-28.jsonl', '2026-02-30', '2026-13-01', '2026-1-1', '']) {
      expect(readNight(runsDir, invalid)).toBeNull();
    }
  });

  it('sorts job names deterministically and supports names that match object properties', () => {
    writeEvents(['z', '__proto__', 'A', 'a', 'constructor', '\u{10000}', '\uE000'].map((job) => ({ ...event, job })));
    expect(readNight(runsDir, night)?.rows.map((row) => row.job)).toEqual(['A', '__proto__', 'a', 'constructor', 'z', '\uE000', '\u{10000}']);
  });

  it('propagates filesystem errors other than missing files', () => {
    mkdirSync(join(runsDir, `${night}.jsonl`));
    expect(() => readNight(runsDir, night)).toThrow();
  });
});
