import type { Status } from '../status.js';
import type { RunStatus } from '../digest/types.js';

type NightCounts = Record<RunStatus, number>;

export function StatusBoard({
  status,
  nightCounts,
}: {
  status: Status;
  nightCounts: Record<string, NightCounts | null>;
}) {
  return (
    <>
      <h1>status</h1>
      <table>
        <tbody>
          <tr><th>adapter</th><td>{status.adapter}</td></tr>
          <tr><th>installed</th><td>{status.installed}</td></tr>
          <tr>
            <th>last beat</th>
            <td>{status.lastBeat ? `${status.lastBeat.at} · pid ${status.lastBeat.pid}` : <span class="warn">none</span>}</td>
          </tr>
        </tbody>
      </table>
      <h2>nights on disk</h2>
      {status.nights.length === 0 ? (
        <p class="mute">nothing in runs/</p>
      ) : (
        <ul>
          {status.nights.map((n) => (
            <li>
              <a href={`/digest/${n}`}>{n}</a>
              {' · ok '}{nightCounts[n]?.ok ?? '—'}
              {' · retry '}{nightCounts[n]?.retry ?? '—'}
              {' · fail '}{nightCounts[n]?.fail ?? '—'}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
