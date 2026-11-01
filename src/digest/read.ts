import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunStatus } from './types.js';

// One parsed line of runs/<night>.jsonl.
type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
};

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly string[] = ['ok', 'retry', 'fail'] satisfies RunStatus[];

function isStatus(value: unknown): value is RunStatus {
  return typeof value === 'string' && STATUSES.includes(value);
}

// Parse at the edge: a line is a RunLine or null (a bad line). Never throws.
function parseLine(text: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const at: unknown = Reflect.get(value, 'at');
  const job: unknown = Reflect.get(value, 'job');
  const status: unknown = Reflect.get(value, 'status');
  const owner: unknown = Reflect.get(value, 'owner');
  const error: unknown = Reflect.get(value, 'error');
  if (typeof at !== 'string' || typeof job !== 'string' || !isStatus(status)) return null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && error !== null && typeof error !== 'string') return null;
  return { at, job, status, owner, error: error ?? null };
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return null;
    throw err;
  }
}

// Lines are taken in file order: "last" means the job's last line in the log.
function toRow(lines: RunLine[]): DigestRow {
  const first = lines[0];
  const last = lines[lines.length - 1];
  if (first === undefined || last === undefined) throw new Error('toRow needs at least one line');
  const withError = lines.filter((l) => l.error !== null);
  return {
    job: last.job,
    owner: last.owner,
    runs: lines.length,
    retries: lines.filter((l) => l.status === 'retry').length,
    lastStatus: last.status,
    lastError: withError[withError.length - 1]?.error ?? null,
    firstAt: first.at,
    lastAt: last.at,
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  // An invalid night (e.g. "../x") must not escape runsDir: treat it as not found.
  if (!NIGHT.test(night)) return null;
  const text = readText(join(runsDir, `${night}.jsonl`));
  if (text === null) return null;

  const byJob = new Map<string, RunLine[]>();
  let badLines = 0;
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '') continue; // blank lines (a trailing newline) are not bad lines
    const line = parseLine(raw);
    if (line === null) {
      badLines += 1;
      continue;
    }
    const lines = byJob.get(line.job);
    if (lines) lines.push(line);
    else byJob.set(line.job, [line]);
  }

  const rows = [...byJob.values()].map(toRow).sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, badLines } satisfies Night;
};
