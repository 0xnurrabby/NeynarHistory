import React, { useEffect, useMemo, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { format } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import clsx from 'clsx';

type MiniAppContext = any;

type User = {
  fid: number;
  username?: string;
  display_name?: string;
  pfp_url?: string;
};

type Snapshot = {
  fid: number;
  score: number;
  captured_at: string; // ISO
};

type ScoreResponse = {
  user: User;
  current: { score: number; fetched_at: string };
  history: Snapshot[];
  historyBeginsAt?: string;
  fromCache?: boolean;
};

const DOMAIN = 'https://neynar-history.vercel.app/';

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function fmtScore(score: number) {
  return clamp01(score).toFixed(3);
}

function isValidHandle(s: string) {
  const h = s.startsWith('@') ? s.slice(1) : s;
  return /^[a-z0-9][a-z0-9_]{1,31}$/i.test(h);
}

function parseQuery(input: string): { kind: 'fid'; fid: number } | { kind: 'handle'; handle: string } | { kind: 'invalid' } {
  const trimmed = input.trim();
  if (!trimmed) return { kind: 'invalid' };
  if (/^\d+$/.test(trimmed)) {
    const fid = Number(trimmed);
    if (!Number.isFinite(fid) || fid <= 0) return { kind: 'invalid' };
    return { kind: 'fid', fid };
  }
  const handle = trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
  if (!isValidHandle(handle)) return { kind: 'invalid' };
  return { kind: 'handle', handle };
}

function useToasts() {
  const [toasts, setToasts] = useState<{ id: string; kind: 'success' | 'error'; msg: string }[]>([]);
  const push = (kind: 'success' | 'error', msg: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((t) => [...t, { id, kind, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  };
  return { toasts, push };
}

function SkeletonCard() {
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="skeleton" style={{ width: 120, height: 14 }} />
        <div className="skeleton" style={{ width: 88, height: 14 }} />
      </div>
      <div className="spacer" />
      <div className="skeleton" style={{ width: '60%', height: 38, borderRadius: 12 }} />
      <div className="spacer" />
      <div className="skeleton" style={{ width: '100%', height: 180, borderRadius: 12 }} />
      <div className="spacer" />
      <div className="row" style={{ gap: 10 }}>
        <div className="skeleton" style={{ width: 78, height: 28, borderRadius: 999 }} />
        <div className="skeleton" style={{ width: 78, height: 28, borderRadius: 999 }} />
        <div className="skeleton" style={{ width: 78, height: 28, borderRadius: 999 }} />
      </div>
    </div>
  );
}

function ScoreDeltaBadge({ delta }: { delta: number }) {
  if (!Number.isFinite(delta) || Math.abs(delta) < 1e-9) {
    return <span className="badge badgeNeutral">Flat</span>;
  }
  if (delta > 0) return <span className="badge badgeUp">Up</span>;
  return <span className="badge badgeDown">Down</span>;
}

function ScoreChart({ points }: { points: { date: string; score: number }[] }) {
  return (
    <div className="chartWrap" role="img" aria-label="Score history line chart">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={points} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tickMargin={8} minTickGap={24} />
          <YAxis domain={[0, 1]} tickMargin={8} />
          <Tooltip
            formatter={(v: any) => [fmtScore(Number(v)), 'Score']}
            labelFormatter={(l: any) => `Date: ${l}`}
          />
          <Line type="monotone" dataKey="score" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function exportCsv(user: User, rows: { captured_at: string; score: number; delta: number }[]) {
  const header = ['fid', 'handle', 'captured_at', 'score', 'delta_vs_previous'];
  const lines = [
    header.join(','),
    ...rows.map((r) => [
      user.fid,
      user.username ? `@${user.username}` : '',
      r.captured_at,
      r.score,
      r.delta,
    ].map((x) => String(x)).join(','))
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `neynar-history-fid-${user.fid}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [ctx, setCtx] = useState<MiniAppContext | null>(null);
  const [miniAppOk, setMiniAppOk] = useState<boolean | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const [query, setQuery] = useState('');
  const [activeFid, setActiveFid] = useState<number | null>(null);

  const [range, setRange] = useState<7 | 30 | 90>(7);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ScoreResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { toasts, push } = useToasts();

  // Mini App SDK boot
  useEffect(() => {
    (async () => {
      try {
        const c = await sdk.context;
        setCtx(c);
        setMiniAppOk(true);
        // Best-effort identity (already signed in in hosts)
        const fid = Number(c?.user?.fid ?? c?.fid ?? c?.client?.fid ?? 0);
        const username = c?.user?.username;
        const pfp_url = c?.user?.pfpUrl;
        if (fid > 0) {
          setMe({ fid, username, pfp_url });
          setActiveFid(fid);
        }
        await sdk.actions.ready();
      } catch (e) {
        setMiniAppOk(false);
      }
    })();
  }, []);

  async function signInQuickAuth() {
    setSigningIn(true);
    try {
      // Farcaster Mini Apps SDK Quick Auth (preferred)
      const { token: t } = await (sdk as any).quickAuth.getToken();
      setToken(t);
      push('success', 'Signed in');
    } catch (e: any) {
      push('error', e?.message ? `Sign-in failed: ${e.message}` : 'Sign-in failed');
    } finally {
      setSigningIn(false);
    }
  }

    } catch {
      push('error', 'Sign in canceled');
    }
  }

  async function resolveAndOpen(q: string) {
    const parsed = parseQuery(q);
    if (parsed.kind === 'invalid') {
      setError('Invalid input. Examples: @vitalik or 3');
      return;
    }
    setError(null);
    try {
      setLoading(true);
      if (parsed.kind === 'fid') {
        setActiveFid(parsed.fid);
        push('success', `Opened FID ${parsed.fid}`);
        return;
      }
      const handle = parsed.handle.startsWith('@') ? parsed.handle.slice(1) : parsed.handle;
      const res = await fetch(`${DOMAIN}api/user/resolve?username=${encodeURIComponent(handle)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? 'Failed to resolve handle');
      }
      const j = (await res.json()) as { fid: number };
      setActiveFid(j.fid);
      push('success', `Resolved @${handle} → FID ${j.fid}`);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to resolve user');
      push('error', 'Resolve failed');
    } finally {
      setLoading(false);
    }
  }

  async function fetchScore(fid: number, days: 7 | 30 | 90) {
    try {
      setLoading(true);
      setError(null);
      setData(null);
      const res = await fetch(`${DOMAIN}api/user/score?fid=${fid}&days=${days}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? 'Fetch failed');
      setData(j as ScoreResponse);
      push('success', 'Updated');
    } catch (e: any) {
      setError(e?.message ?? 'Fetch failed');
      push('error', 'Update failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (activeFid) fetchScore(activeFid, range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFid, range]);

  const computed = useMemo(() => {
    if (!data) return null;
    const sorted = [...data.history].sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime());
    const rows = sorted.map((s, i) => {
      const prev = i > 0 ? sorted[i - 1].score : s.score;
      const delta = s.score - prev;
      return { ...s, delta };
    });
    const points = rows.map((r) => ({
      date: format(new Date(r.captured_at), 'MM-dd'),
      score: clamp01(r.score)
    }));
    const changes = rows.filter((r, i) => i === 0 ? true : Math.abs(r.delta) > 1e-12);
    const lastDelta = rows.length >= 2 ? rows[rows.length - 1].delta : 0;
    return { rows, points, changes, lastDelta };
  }, [data]);

  if (miniAppOk === false) {
    return (
      <div className="wrap">
        <header className="header">
          <div className="brand">Neynar History</div>
        </header>
        <div className="card">
          <h2 className="h2">Open inside a Farcaster client</h2>
          <p className="muted">
            This experience is built as a Farcaster Mini App and must be launched from a Farcaster client to render with Mini App chrome.
          </p>
          <p className="muted">
            Try opening this URL from a cast embed: <span className="code">{DOMAIN}</span>
          </p>
        </div>
      </div>
    );
  }

  const user = data?.user ?? me;

  return (
    <div className="wrap">
      <header className="header">
        <div className="brand">Neynar History</div>
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <button
            className={clsx('btn', 'btnGhost')}
            onClick={() => (sdk.actions as any).addMiniApp?.()}
            disabled={loading}
            aria-label="Add mini app"
          >
            Add
          </button>
          <button
            className={clsx('btn', 'btnGhost')}
            onClick={signInQuickAuth}
            disabled={loading || signingIn}
            aria-label="Sign in"
          >
            {signingIn ? (<span className="btnInline"><span className="spinner" aria-hidden="true" /> Signing…</span>) : (token ? 'Signed' : 'Sign in')}
          </button>
        </div>
      </header>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="h2">Home</div>
            <div className="muted">View Neynar score snapshots and changes over time.</div>
          </div>
          {user?.fid ? (
            <div className="identity">
              <div className="muted">Signed in</div>
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                {user.pfp_url ? <img className="avatar" src={user.pfp_url} alt="avatar" /> : null}
                <div>
                  <div className="strong">FID {user.fid}{user.username ? ` · @${user.username}` : ''}</div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="spacer" />

        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            resolveAndOpen(query);
          }}
        >
          <input
            className="input"
            placeholder="Search by @handle or FID (e.g., @vitalik or 3)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search handle or fid"
          />
          <button className="btn" disabled={loading}>
            {loading ? <span className="spinner" aria-label="Loading" /> : 'Lookup'}
          </button>
        </form>
        {error ? <div className="error">{error}</div> : null}
      </div>

      {loading && !data ? <SkeletonCard /> : null}

      {data && computed ? (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div>
              <div className="h2">User Score</div>
              <div className="muted">
                Current score (0–1) · Last fetched {format(new Date(data.current.fetched_at), 'PPpp')}
                {data.fromCache ? ' · using last stored snapshot' : ''}
              </div>
            </div>
            <div className="scoreBox">
              <div className="scoreNum">{fmtScore(data.current.score)}</div>
              <ScoreDeltaBadge delta={computed.lastDelta} />
            </div>
          </div>

          <div className="spacer" />

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <div className="seg" role="tablist" aria-label="Range">
              <button className={clsx('segBtn', range === 7 && 'segBtnActive')} onClick={() => setRange(7)} type="button">7d</button>
              <button className={clsx('segBtn', range === 30 && 'segBtnActive')} onClick={() => setRange(30)} type="button">30d</button>
              <button className={clsx('segBtn', range === 90 && 'segBtnActive')} onClick={() => setRange(90)} type="button">90d</button>
            </div>
            <button className={clsx('btn', 'btnGhost')} type="button" onClick={() => exportCsv(data.user, computed.rows)}>
              Export CSV
            </button>
            <button
              className={clsx('btn', 'btnGhost')}
              type="button"
              onClick={() => fetch(`${DOMAIN}api/track/toggle`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ fid: data.user.fid })
              }).then(async (r) => {
                const j = await r.json().catch(() => null);
                if (!r.ok) throw new Error(j?.error ?? 'Track failed');
                push('success', j?.tracked ? 'Tracking enabled' : 'Tracking disabled');
              }).catch((e) => push('error', e?.message ?? 'Track failed'))}
            >
              Track
            </button>
          </div>

          {data.historyBeginsAt ? (
            <div className="note">History begins on {format(new Date(data.historyBeginsAt), 'PPP')}.</div>
          ) : null}

          <div className="spacer" />

          <ScoreChart points={computed.points} />

          <div className="spacer" />

          <div className="grid2">
            <div>
              <div className="h3">Table</div>
              <div className="muted">Accessibility-first view with exact values.</div>
              <div className="spacerSm" />
              <div className="tableWrap" role="region" aria-label="Score history table" tabIndex={0}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Score</th>
                      <th>Δ vs prev</th>
                    </tr>
                  </thead>
                  <tbody>
                    {computed.rows.map((r) => (
                      <tr key={r.captured_at}>
                        <td>{format(new Date(r.captured_at), 'PPpp')}</td>
                        <td>{fmtScore(r.score)}</td>
                        <td className={r.delta > 0 ? 'deltaUp' : r.delta < 0 ? 'deltaDown' : 'deltaFlat'}>
                          {r.delta === 0 ? '0' : r.delta > 0 ? `+${r.delta.toFixed(4)}` : r.delta.toFixed(4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div className="h3">Score change timeline</div>
              <div className="muted">Only entries where the score changed vs previous snapshot.</div>
              <div className="spacerSm" />
              <div className="timeline">
                {computed.changes.map((c) => (
                  <div key={c.captured_at} className="timelineRow">
                    <div className="timelineDot" />
                    <div>
                      <div className="strong">{fmtScore(c.score)} <span className="muted">({format(new Date(c.captured_at), 'PPpp')})</span></div>
                      <div className="muted">Δ {c.delta === 0 ? '0' : c.delta > 0 ? `+${c.delta.toFixed(4)}` : c.delta.toFixed(4)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="spacer" />

          <div className="panel">
            <div className="h3">Possible factors (not guaranteed)</div>
            <ul className="list">
              <li>Reduced activity over time can be associated with lower scores.</li>
              <li>Model recalibrations can shift scores across many accounts at once.</li>
            </ul>
            <div className="disclaimer">
              Neynar does not provide a per-change explanation feed here. These are general possibilities, not a definitive audit.
            </div>
          </div>
        </div>
      ) : null}

      <div className="toastStack" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div key={t.id} className={clsx('toast', t.kind === 'success' ? 'toastSuccess' : 'toastError')}>
            {t.msg}
          </div>
        ))}
      </div>

      <footer className="footer">
        <div className="muted">
          Neutral language only — this app shows a score and stored snapshots (not an explanation feed).
        </div>
      </footer>
    </div>
  );
}