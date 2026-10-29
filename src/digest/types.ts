export type RunStatus = 'ok' | 'retry' | 'fail';

/** One job's valid events, ordered by time (file order breaks equal-time ties). */
export type DigestRow = {
  job: string;
  /** Owner on the latest event; null is retained and displayed as an em dash. */
  owner: string | null;
  /** Total valid events for this job, including retry and fail events. */
  runs: number;
  retries: number;
  /** Counts every fail event, even if a later event succeeds. */
  failures: number;
  lastStatus: RunStatus;
  /** Most recent supplied error, retained after recovery; null if none was supplied. */
  lastError: string | null;
  /** Original timestamp strings, including their offsets; never reformatted as UTC. */
  firstAt: string;
  lastAt: string;
};

export type NightDigest = {
  night: string;
  /** One row per job, sorted by job with deterministic code-point ordering. */
  rows: DigestRow[];
  /** Nonempty lines with invalid JSON or invalid event fields; a trailing newline is not a line. */
  badLines: number;
  /** Event counts, not counts of jobs' final states; excludes malformed lines. */
  counts: Record<RunStatus, number>;
};

/**
 * Contract for src/digest/read-night.ts's readNight(runsDir, night).
 * Reads one YYYY-MM-DD filename within runsDir synchronously. A missing file or an
 * invalid night identifier returns null (routes use 404). An existing empty file
 * returns a NightDigest with empty rows and zero counts. Malformed lines never
 * prevent other valid events from being returned. Other filesystem errors propagate.
 */
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
