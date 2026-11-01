import { readdirSync } from 'node:fs';
import { readNight } from './digest/read.js';
import type { RigConfig } from './config.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type NightSummary = { night: string; ok: number; retry: number; fail: number };

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightSummary[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

// One count per job, by the job's last status. A night that cannot be read counts as zero.
export function summarizeNight(runsDir: string, night: string): NightSummary {
  const summary: NightSummary = { night, ok: 0, retry: 0, fail: 0 };
  const parsed = readNight(runsDir, night);
  if (parsed === null) return summary;
  for (const row of parsed.rows) {
    summary[row.lastStatus] += 1;
  }
  return summary;
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((n) => summarizeNight(config.runsDir, n)),
  };
}
