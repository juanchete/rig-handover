import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const at = (hour: string): string => `2026-01-01T${hour}:00:00+01:00`;

const runLines = [
  `{"at":"${at('01')}","job":"b/job","status":"fail","owner":"rook","error":"quota exceeded"}`,
  `{"at":"${at('02')}","job":"a/job","status":"retry","owner":"rook","error":"upstream 503"}`,
  `{"at":"${at('03')}","job":"a/job","status":"retry","owner":"rook","error":"upstream 503"}`,
  `{"at":"${at('04')}","job":"a/job","status":"retry","owner":"rook","error":"upstream 503"}`,
  `{"at":"${at('05')}","job":"a/job","status":"ok","owner":"rook"}`,
].join('\n');

const badNightLines = [
  '{"at":"2026-01-03T01:00:00+01:00","job":"c/job","status":"ok","owner":"rook"}',
  '{"at":"2026-01-03T02:00:00+01:00","job":"c/jo',
].join('\n');

const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: '',
};

interface IDigestJsonRow {
  job: string;
  retries: number;
  lastStatus: string;
}

interface IDigestJson {
  night: string;
  rows: IDigestJsonRow[];
  badLines: number;
}

describe('digest routes', () => {
  let runsDir: string;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    runsDir = mkdtempSync(join(tmpdir(), 'rig-'));
    writeFileSync(join(runsDir, '2026-01-01.jsonl'), `${runLines}\n`);
    writeFileSync(join(runsDir, '2026-01-02.jsonl'), '');
    writeFileSync(join(runsDir, '2026-01-03.jsonl'), `${badNightLines}\n`);
    app = createApp({ ...config, runsDir });
  });

  afterAll(() => {
    rmSync(runsDir, { recursive: true, force: true });
  });

  it('renders 2026-01-01 with both jobs, a/job before b/job', async () => {
    const res = await app.request('/digest/2026-01-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html.indexOf('<td>a/job</td>')).toBeGreaterThan(-1);
    expect(html.indexOf('<td>a/job</td>')).toBeLessThan(html.indexOf('<td>b/job</td>'));
  });

  it('JSON for 2026-01-01 lists the same jobs in the same order as the page', async () => {
    const pageHtml = await (await app.request('/digest/2026-01-01')).text();
    const pageJobs = [...pageHtml.matchAll(/<td>([ab]\/job)<\/td>/g)].map((m) => m[1]);

    const res = await app.request('/api/digest/2026-01-01');
    expect(res.status).toBe(200);
    const body = (await res.json()) as IDigestJson;
    expect(body.rows.map((r) => r.job)).toEqual(pageJobs);
    expect(body.rows.map((r) => r.job)).toEqual(['a/job', 'b/job']);
  });

  it('marks the job with 3 retries and the failed job with class warn', async () => {
    const html = await (await app.request('/digest/2026-01-01')).text();
    expect(html).toMatch(/<tr class="warn"><td>a\/job<\/td>/);
    expect(html).toMatch(/<tr class="warn"><td>b\/job<\/td>/);

    const body = (await (await app.request('/api/digest/2026-01-01')).json()) as IDigestJson;
    expect(body.rows.find((r) => r.job === 'a/job')).toMatchObject({ retries: 3, lastStatus: 'ok' });
    expect(body.rows.find((r) => r.job === 'b/job')).toMatchObject({ lastStatus: 'fail' });
  });

  it('answers 404 for a night with no file, on the page and in JSON', async () => {
    const page = await app.request('/digest/2026-01-09');
    expect(page.status).toBe(404);
    expect(await page.text()).toContain('no digest for 2026-01-09');

    const json = await app.request('/api/digest/2026-01-09');
    expect(json.status).toBe(404);
    expect(await json.json()).toEqual({ error: 'no such night', night: '2026-01-09' });
  });

  it('shows "nothing ran" for the empty night 2026-01-02', async () => {
    const page = await app.request('/digest/2026-01-02');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('nothing ran');

    const json = await app.request('/api/digest/2026-01-02');
    expect(json.status).toBe(200);
    expect(await json.json()).toEqual({ night: '2026-01-02', rows: [], badLines: 0 });
  });

  it('counts the bad line in 2026-01-03 and keeps the valid row', async () => {
    const page = await app.request('/digest/2026-01-03');
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('did not parse');
    expect(html).toContain('<td>c/job</td>');

    const json = await app.request('/api/digest/2026-01-03');
    expect(json.status).toBe(200);
    const body = (await json.json()) as IDigestJson;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['c/job']);
  });
});
