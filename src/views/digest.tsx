import type { NightDigest } from '../digest/types.js';

export function DigestPage({ digest }: { digest: NightDigest }) {
  return (
    <>
      <h1>digest · {digest.night}</h1>
      <p>{digest.rows.length === 0 ? 'nothing ran' : `${digest.rows.length} jobs`}</p>
      {digest.badLines > 0 && <p class="warn">malformed lines: {digest.badLines}</p>}
      {digest.rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>job</th><th>owner</th><th>runs</th><th>retries</th>
              <th>last status</th><th>last error</th><th>first at</th><th>last at</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => (
              <tr>
                <td>{row.job}</td>
                <td>{row.owner ?? '—'}</td>
                <td>{row.runs}</td>
                <td class={row.retries >= 3 ? 'warn' : undefined}>
                  {row.retries}{row.retries >= 3 ? ' ⚠' : ''}
                </td>
                <td class={row.failures > 0 ? 'warn' : undefined}>
                  {row.lastStatus}{row.failures > 0 ? ` · ${row.failures} failures` : ''}
                </td>
                <td>{row.lastError ?? '—'}</td>
                <td>{row.firstAt}</td>
                <td>{row.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
