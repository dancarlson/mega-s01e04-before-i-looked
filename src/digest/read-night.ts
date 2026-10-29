import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, ReadNight, RunStatus } from './types.js';

type RunEvent = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

function validNight(night: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return false;
  const time = Date.parse(`${night}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === night;
}

function validTime(at: unknown): at is string {
  if (typeof at !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(at)
    && validNight(at.slice(0, 10)) && Number.isFinite(Date.parse(at));
}

function parseEvent(line: string): RunEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  if (!validTime(event.at) || typeof event.job !== 'string' || event.job.trim() === ''
    || (event.status !== 'ok' && event.status !== 'retry' && event.status !== 'fail')
    || (event.owner !== null && typeof event.owner !== 'string')
    || (event.error !== undefined && typeof event.error !== 'string')) return null;
  return {
    at: event.at, job: event.job, status: event.status, owner: event.owner,
    ...(event.error === undefined ? {} : { error: event.error }),
  };
}

function compareJobs(a: DigestRow, b: DigestRow): number {
  const left = Array.from(a.job);
  const right = Array.from(b.job);
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    const difference = left[i].codePointAt(0)! - right[i].codePointAt(0)!;
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!validNight(night)) return null;
  let content: string;
  try {
    content = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const digest: NightDigest = { night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } };
  const events: RunEvent[] = [];
  for (const line of content.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const event = parseEvent(line);
    if (event === null) digest.badLines += 1;
    else events.push(event);
  }

  // Stable sorting preserves file order for simultaneous events. Retain the original
  // timestamp text in rows; only the comparison uses UTC milliseconds.
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const jobs = new Map<string, DigestRow>();
  for (const event of events) {
    digest.counts[event.status] += 1;
    const row = jobs.get(event.job) ?? {
      job: event.job, owner: event.owner, runs: 0, retries: 0, failures: 0,
      lastStatus: event.status, lastError: null, firstAt: event.at, lastAt: event.at,
    };
    row.runs += 1;
    if (event.status === 'retry') row.retries += 1;
    if (event.status === 'fail') row.failures += 1;
    row.owner = event.owner;
    row.lastStatus = event.status;
    row.lastAt = event.at;
    if (event.error !== undefined) row.lastError = event.error;
    jobs.set(event.job, row);
  }
  digest.rows = [...jobs.values()].sort(compareJobs);
  return digest;
};
