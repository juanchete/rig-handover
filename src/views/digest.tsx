import type { DigestRow, Night } from '../digest/types.js';

const dash = '—';

function DigestRowView({ row }: { row: DigestRow }) {
  const manyRetries = row.retries >= 3;
  const failed = row.lastStatus === 'fail';
  return (
    <tr class={manyRetries || failed ? 'warn' : undefined}>
      <td>{row.job}</td>
      <td>{row.owner ?? dash}</td>
      <td>{row.runs}</td>
      <td>{manyRetries ? `${row.retries} · many retries` : row.retries}</td>
      <td>{failed ? 'fail · failed' : row.lastStatus}</td>
      <td>{row.lastError ?? dash}</td>
      <td>{row.firstAt}</td>
      <td>{row.lastAt}</td>
    </tr>
  );
}

export function DigestView({ night }: { night: Night }) {
  return (
    <>
      <h1>digest · {night.night}</h1>
      {night.badLines > 0 && (
        <p class="warn">{night.badLines === 1 ? '1 line did not parse' : `${night.badLines} lines did not parse`}</p>
      )}
      {night.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th><th>owner</th><th>runs</th><th>retries</th>
              <th>last status</th><th>last error</th><th>first</th><th>last</th>
            </tr>
          </thead>
          <tbody>
            {night.rows.map((row) => (
              <DigestRowView row={row} />
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
