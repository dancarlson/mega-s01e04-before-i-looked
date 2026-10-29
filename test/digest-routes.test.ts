import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const night = '2026-10-28';
const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
};
let runsDir: string;

beforeEach(() => { runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-')); });
afterEach(() => { rmSync(runsDir, { recursive: true, force: true }); });

function app() {
  return createApp({ ...config, runsDir });
}

function writeNight(lines: string) {
  writeFileSync(join(runsDir, `${night}.jsonl`), lines);
}

function event(at: string, job: string, status: 'ok' | 'retry' | 'fail', owner: string | null, error?: string) {
  return JSON.stringify({ at, job, status, owner, ...(error === undefined ? {} : { error }) });
}

describe('digest routes', () => {
  it('returns the same sorted jobs for HTML and JSON, with retries, failures, owners, and offsets', async () => {
    writeNight([
      event('2026-10-28T10:00:00-07:00', 'zeta', 'ok', 'ops'),
      event('2026-10-28T10:00:00-07:00', 'alpha', 'retry', 'build'),
      event('2026-10-28T10:01:00-07:00', 'alpha', 'retry', 'build'),
      event('2026-10-28T10:02:00-07:00', 'alpha', 'retry', 'build'),
      event('2026-10-28T10:03:00-07:00', 'alpha', 'fail', null, 'quota exceeded'),
      event('2026-10-28T10:04:00-07:00', 'alpha', 'ok', null),
      event('2026-10-28T11:00:00+02:00', 'beta', 'ok', 'reader'),
    ].join('\n') + '\n');

    const route = app();
    const [htmlResponse, jsonResponse] = await Promise.all([
      route.request(`/digest/${night}`),
      route.request(`/api/digest/${night}`),
    ]);
    expect(htmlResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);

    const digest = await jsonResponse.json();
    expect(digest.rows.map((row: { job: string }) => row.job)).toEqual(['alpha', 'beta', 'zeta']);
    expect(digest.rows[0]).toMatchObject({
      owner: null, runs: 5, retries: 3, failures: 1, lastStatus: 'ok', lastError: 'quota exceeded',
      firstAt: '2026-10-28T10:00:00-07:00', lastAt: '2026-10-28T10:04:00-07:00',
    });

    const html = await htmlResponse.text();
    const jobsInHtml = [...html.matchAll(/<tbody>[\s\S]*?<\/tbody>/g)][0]?.[0]
      .match(/<tr>[\s\S]*?<td>(.*?)<\/td>/g)
      ?.map((row) => row.match(/<td>(.*?)<\/td>/)?.[1]);
    expect(jobsInHtml).toEqual(digest.rows.map((row: { job: string }) => row.job));
    expect(html).toContain('<td>—</td>');
    expect(html).toContain('3 ⚠');
    expect(html).toContain('ok · 1 failures');
    expect(html).toContain('quota exceeded');
    expect(html).toContain('2026-10-28T10:00:00-07:00');
    expect(html).toContain('2026-10-28T11:00:00+02:00');
  });

  it('returns 404 from both routes when the night file is missing', async () => {
    const route = app();
    const [html, json] = await Promise.all([
      route.request(`/digest/${night}`),
      route.request(`/api/digest/${night}`),
    ]);
    expect(html.status).toBe(404);
    expect(json.status).toBe(404);
  });

  it('returns an empty successful digest from both routes for an empty night', async () => {
    writeNight('');
    const route = app();
    const [html, json] = await Promise.all([
      route.request(`/digest/${night}`),
      route.request(`/api/digest/${night}`),
    ]);
    expect(html.status).toBe(200);
    expect(await html.text()).toContain('nothing ran');
    expect(json.status).toBe(200);
    expect(await json.json()).toMatchObject({ night, rows: [], badLines: 0 });
  });

  it('keeps valid rows around a malformed line in both representations', async () => {
    writeNight([
      event('2026-10-28T08:00:00Z', 'second', 'ok', null),
      '{not json',
      event('2026-10-28T09:00:00Z', 'first', 'fail', 'ops', 'bad input'),
    ].join('\n') + '\n');
    const route = app();
    const [html, json] = await Promise.all([
      route.request(`/digest/${night}`),
      route.request(`/api/digest/${night}`),
    ]);
    expect(html.status).toBe(200);
    expect(json.status).toBe(200);
    expect(await html.text()).toContain('malformed lines: 1');
    const digest = await json.json();
    expect(digest.badLines).toBe(1);
    expect(digest.rows.map((row: { job: string }) => row.job)).toEqual(['first', 'second']);
    expect(digest.rows[0]).toMatchObject({ lastStatus: 'fail', owner: 'ops', lastError: 'bad input' });
  });

  it('escapes log values in HTML while retaining their original JSON value', async () => {
    const job = '<script>alert("x")</script>';
    writeNight(event('2026-10-28T08:00:00Z', job, 'ok', null) + '\n');
    const route = app();
    const [html, json] = await Promise.all([
      route.request(`/digest/${night}`),
      route.request(`/api/digest/${night}`),
    ]);
    const htmlBody = await html.text();
    expect(htmlBody).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(htmlBody).not.toContain('<script>alert');
    expect((await json.json()).rows[0].job).toBe(job);
  });
});
