// Plan morning-digest § 1. The contract every part of § 2 builds against.
// The reader (src/digest/read.ts) implements ReadNight; views and routes only import from here.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One row per job in runs/<night>.jsonl.
// Times are the raw `at` strings from the log, offset kept; never converted to UTC.
export type DigestRow = {
  job: string;
  owner: string | null; // null is kept; views render it as `—`
  runs: number; // lines for this job
  retries: number; // lines with status 'retry'
  lastStatus: RunStatus; // status of the job's last line
  lastError: string | null; // `error` of the job's last line that had one
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string; // YYYY-MM-DD, as in the file name
  rows: DigestRow[]; // sorted by job; empty when the file is empty ("nothing ran")
  badLines: number; // lines that did not parse; counted, never thrown
};

// Returns null when runs/<night>.jsonl does not exist (routes answer 404).
export type ReadNight = (runsDir: string, night: string) => Night | null;
