import React, { useEffect, useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { ensureMiniAppOrThrow, getContext, ready, signIn } from "./lib/farcaster";
import { ensureBaseMainnet } from "./lib/baseWallet";
import type { Snapshot, UserCard } from "./lib/types";
import { ToastProvider, useToasts } from "./components/Toasts";
import { SkeletonScoreCard } from "./components/Skeleton";

type Route =
  | { name: "home" }
  | { name: "user"; fid: number };

function parseRoute(): Route {
  const url = new URL(window.location.href);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "user" && parts[1] && /^\d+$/.test(parts[1])) {
    return { name: "user", fid: Number(parts[1]) };
  }
  return { name: "home" };
}

function navigate(route: Route) {
  const url = new URL(window.location.href);
  if (route.name === "home") url.pathname = "/";
  if (route.name === "user") url.pathname = `/user/${route.fid}`;
  window.history.pushState({}, "", url.toString());
  window.dispatchEvent(new Event("popstate"));
}

function fmtErr(e: any): string {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (typeof e?.message === "string") return e.message;
  try { return JSON.stringify(e); } catch { return String(e); }
}

function formatScore(score: number | null) {
  if (score === null || Number.isNaN(score)) return "—";
  return score.toFixed(3);
}

function Badge({ delta }: { delta: number | null }) {
  const label =
    delta === null ? "No previous snapshot" : delta > 0 ? "Up" : delta < 0 ? "Down" : "Flat";
  const cls = delta === null ? "flat" : delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const sign = delta === null ? "" : delta > 0 ? "+" : "";
  return (
    <span className={`badge ${cls}`} aria-label={`Change badge: ${label}`}>
      <span>{label}</span>
      {delta === null ? null : <span style={{ fontWeight: 800 }}>{sign}{delta.toFixed(3)}</span>}
    </span>
  );
}

function useMiniAppBootstrap() {
  const [state, setState] = useState<"booting"|"ready"|"not_miniapp"|"error">("booting");
  const [ctx, setCtx] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureMiniAppOrThrow();
        // Call ready() early so the host can drop the splash screen.
        await ready();
        if (cancelled) return;

        // Fetch context after ready() to ensure user fields are populated in all clients.
        const c = await getContext();
        if (cancelled) return;
        setCtx(c);

        setState("ready");
      } catch (e:any) {
        if (cancelled) return;
        if (String(e?.message) === "NOT_IN_MINIAPP") setState("not_miniapp");
        else setState("error");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { state, ctx };
}

async function apiJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { "accept": "application/json" } });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `HTTP ${res.status}`);
  }
  return await res.json();
}

function HomeView({ ctx }: { ctx: any }) {
  const { push } = useToasts();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [me, setMe] = useState<UserCard | null>(null);
  const [auth, setAuth] = useState<{
    fid: number;
    username?: string | null;
    display_name?: string | null;
    pfp_url?: string | null;
  } | null>(() => {
    try {
      const raw = localStorage.getItem("nh_auth");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const ctxUser = ctx?.user ?? null;
  const meFid = ctxUser?.fid ?? auth?.fid ?? null;
  const connected = Boolean(ctxUser?.fid || auth?.fid);

  const username = (ctxUser?.username ?? auth?.username ?? null) as string | null;
  const displayName = (ctxUser?.display_name ?? auth?.display_name ?? null) as string | null;
  const pfp = (ctxUser?.pfp_url ?? auth?.pfp_url ?? "/assets/icon-1024.png") as string;

  useEffect(() => {
    if (!meFid) return;
    (async () => {
      try {
        const u = await apiJson<UserCard>(`/api/score?fid=${meFid}`);
        setMe(u);
      } catch (e:any) {
        // Non-fatal
      }
    })();
  }, [meFid]);

  async function handleSignIn() {
    setLoading(true);
    try {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      const nonce = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
      const credential: any = await signIn(nonce);

      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nonce,
          message: credential?.message,
          signature: credential?.signature,
        }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok || !data?.ok) {
        const msg = data?.error ? String(data.error) : `Auth verification failed (HTTP ${res.status})`;
        throw new Error(msg);
      }

      const identity = data.identity;
      const next = {
        fid: identity.fid,
        username: identity.username,
        display_name: identity.display_name,
        pfp_url: identity.pfp_url,
      };
      setAuth(next);
      localStorage.setItem("nh_auth", JSON.stringify(next));
      push({
        type: "success",
        title: "Signed in",
        msg: `@${identity.username ?? "user"} (FID ${identity.fid})`,
      });

      const u = await apiJson<UserCard>(`/api/score?fid=${identity.fid}`);
      setMe(u);
    } catch (e: any) {
      push({ type: "error", title: "Sign-in failed", msg: fmtErr(e) });
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch() {
    const q = query.trim();
    if (!q) {
      push({ type: "warning", title: "Enter @handle or FID", msg: "Examples: @dwr or 3" });
      return;
    }
    setLoading(true);
    try {
      let fid: number | null = null;
      if (/^@/.test(q)) {
        const handle = q.slice(1);
        const r = await apiJson<{ fid: number }>(`/api/resolve?handle=${encodeURIComponent(handle)}`);
        fid = r.fid;
      } else if (/^\d+$/.test(q)) {
        fid = Number(q);
      } else {
        throw new Error("Invalid input. Use @handle or numeric FID.");
      }
      navigate({ name: "user", fid });
    } catch (e: any) {
      push({ type: "error", title: "Lookup failed", msg: fmtErr(e) });
    } finally {
      setLoading(false);
    }
  }

  async function handleEnsureBase() {
    setLoading(true);
    try {
      const r = await ensureBaseMainnet();
      if (r.ok) {
        push({ type: "success", title: "Base wallet enabled", msg: "Connected to Base Mainnet." });
      } else if (r.reason === "USER_REJECTED") {
        push({ type: "warning", title: "Cancelled", msg: "You rejected the network switch." });
      } else {
        push({ type: "error", title: "Couldn't switch network", msg: "Please switch to Base Mainnet in your wallet." });
      }
    } catch (e: any) {
      push({ type: "error", title: "Wallet error", msg: fmtErr(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <div className="card">
        <div className="topbar">
          <div className="brand">
            <img src="/assets/icon-1024.png" alt="Neynar History icon" />
            <div className="brand-title">
              <strong>Neynar History</strong>
              <span>Mini App</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="pill" onClick={handleEnsureBase} disabled={loading}>
              Enable Base wallet
            </button>

            {connected ? (
              <button className="pill" disabled aria-label="Connected">
                ✅ Connected
              </button>
            ) : (
              <button className="pill primary" onClick={handleSignIn} disabled={loading}>
                Sign in with Farcaster
              </button>
            )}
          </div>
        </div>

        <div className="hero">
          <div className="hero-row">
            <div style={{ minWidth: 0 }}>
              <div className="meta-small">Signed-in identity</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                <img
                  src={pfp || "/assets/icon-1024.png"}
                  alt="Profile"
                  style={{ width: 36, height: 36, borderRadius: 12, border: "1px solid var(--border)", objectFit: "cover" }}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {username ? `@${username}` : `FID ${meFid ?? "—"}`}
                  </div>
                  <div className="meta-small">
                    {displayName ? displayName : meFid ? `FID ${meFid}` : "Not available"}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div className="meta-small">Your Neynar score</div>
              <div className="score-big">{formatScore(me?.score ?? null)}</div>
              <div className="meta-small">
                {me?.last_fetched_at ? `Updated ${new Date(me.last_fetched_at).toLocaleString()}` : "—"}
              </div>
            </div>
          </div>

          <div className="actions-row">
            <button
              className="btn primary"
              onClick={() => (meFid ? navigate({ name: "user", fid: meFid }) : push({ type: "warning", title: "No FID", msg: "Open inside a Farcaster client." }))}
              disabled={!meFid || loading}
            >
              View 90-day history
            </button>
</div>
        </div>

        <div className="section">
          <h3>Look up another user</h3>
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="@handle or FID"
            aria-label="Search by handle or FID"
          />
          <div className="actions-row">
            <button className="btn primary" onClick={handleSearch} disabled={loading}>
              Search
            </button>
          </div>
          <div className="help-muted">Examples: <code>@dwr</code>, <code>3</code></div>
        </div>

        <div className="section">
          <details>
            <summary style={{ fontWeight: 900, cursor: "pointer" }}>Possible factors (not guaranteed)</summary>
            <div className="help-muted" style={{ marginTop: 10, lineHeight: 1.6 }}>
              Neynar does not provide a per-change explanation feed here. These are general possibilities, not a definitive audit.
              <ul style={{ margin: "8px 0 0 18px" }}>
                <li>Reduced activity over time can be associated with lower scores.</li>
                <li>Model recalibrations can shift scores across many accounts at once.</li>
              </ul>
            </div>
          </details>
        </div>

      </div>
    </div>
  );
}

function UserView({ fid }: { fid: number }) {
  const { push } = useToasts();
  const [range, setRange] = useState<7 | 30 | 90>(90);
  const [user, setUser] = useState<UserCard | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [tracking, setTracking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const u = await apiJson<UserCard>(`/api/score?fid=${fid}`);
        const h = await apiJson<{ snapshots: Snapshot[] }>(`/api/history?fid=${fid}&days=${range}`);
        if (cancelled) return;
        setUser(u);
        setHistory(h.snapshots);

        // Keep a lightweight "recently viewed" signal for scheduled snapshot jobs.
        fetch(`/api/track`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fid }),
        }).catch(() => void 0);
      } catch (e: any) {
        if (cancelled) return;
        push({ type: "error", title: "Failed to load user", msg: fmtErr(e) });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fid, range, push]);

  const delta = useMemo(() => {
    if (!history.length || history.length < 2) return null;
    const a = history[history.length - 1].score;
    const b = history[history.length - 2].score;
    return a - b;
  }, [history]);

  const historyBeginsOn = history.length ? new Date(history[0].captured_at).toLocaleDateString() : null;

  const chartData = useMemo(() => {
    return history.map((s) => ({
      date: new Date(s.captured_at).toLocaleDateString(),
      score: s.score,
      captured_at: s.captured_at,
    }));
  }, [history]);

  const changes = useMemo(() => {
    const out: Array<{ at: string; from: number; to: number; delta: number }> = [];
    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1];
      const cur = history[i];
      if (cur.score !== prev.score) {
        out.push({ at: cur.captured_at, from: prev.score, to: cur.score, delta: cur.score - prev.score });
      }
    }
    return out;
  }, [history]);

  async function toggleTrack() {
    setTracking(true);
    try {
      const res = await fetch("/api/track", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fid, pinned: true }),
      });
      if (!res.ok) throw new Error(await res.text());
      push({ type: "success", title: "Tracking enabled", msg: "We'll try to keep new history points fresh over time." });
    } catch (e: any) {
      push({ type: "error", title: "Couldn't enable tracking", msg: fmtErr(e) });
    } finally {
      setTracking(false);
    }
  }

  function TooltipBox({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const p = payload[0]?.payload;
    return (
      <div className="tooltip">
        <div style={{ fontWeight: 900 }}>{label}</div>
        <div style={{ marginTop: 4 }}>
          Score: <span style={{ fontWeight: 900 }}>{Number(p.score).toFixed(3)}</span>
        </div>
        <div className="help-muted" style={{ marginTop: 4 }}>
          {new Date(p.captured_at).toLocaleString()}
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <div className="topbar">
          <button className="btn" onClick={() => navigate({ name: "home" })}>
            ← Home
          </button>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button className="btn primary" onClick={toggleTrack} disabled={tracking}>
              {tracking ? "Tracking…" : "Track"}
            </button>
          </div>
        </div>

        <div className="hero">
          <div className="hero-row">
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <img
                  src={user?.pfp_url ?? "/assets/icon-1024.png"}
                  alt="Profile"
                  style={{ width: 40, height: 40, borderRadius: 14, border: "1px solid var(--border)", objectFit: "cover" }}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {user?.username ? `@${user.username}` : `FID ${fid}`}
                  </div>
                  <div className="meta-small">
                    {user?.display_name ? user.display_name : `FID ${fid}`}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div className="meta-small">Current score (0–1)</div>
              <div className="score-big">{formatScore(user?.score ?? null)}</div>
              <div className="meta-small">{user?.last_fetched_at ? `Updated ${new Date(user.last_fetched_at).toLocaleString()}` : "—"}</div>
            </div>
          </div>

          <div className="actions-row">
            <span className="pill" style={{ borderStyle: "dashed" }}>
              <Badge delta={delta} />
            </span>

            <span className="pill" style={{ borderStyle: "dashed" }}>
              {historyBeginsOn ? `History begins on ${historyBeginsOn}` : "No history points yet"}
            </span>

            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button className="pill" onClick={() => setRange(7)} disabled={range === 7}>
                7d
              </button>
              <button className="pill" onClick={() => setRange(30)} disabled={range === 30}>
                30d
              </button>
              <button className="pill" onClick={() => setRange(90)} disabled={range === 90}>
                90d
              </button>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 8 }}>Score history</div>

            <div className="chartCard" aria-label="Score history chart">
              {loading ? (
                <SkeletonScoreCard />
              ) : chartData.length < 2 ? (
                <div className="help-muted" style={{ padding: 10 }}>
                  Not enough history to draw a line yet. The app can only show history points it has captured over time.
                </div>
              ) : (
                <div style={{ width: "100%", height: 240 }}>
                  <ResponsiveContainer>
                    <AreaChart data={chartData} margin={{ top: 10, right: 14, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.28} />
                          <stop offset="70%" stopColor="var(--primary)" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 6" opacity={0.35} />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 1]} tick={{ fontSize: 12 }} />
                      <Tooltip content={<TooltipBox />} />
                      <Area
                        type="monotone"
                        dataKey="score"
                        stroke="var(--primary)"
                        strokeWidth={3}
                        fill="url(#scoreFill)"
                        dot={{ r: 5 }}
                        activeDot={{ r: 8 }}
                        isAnimationActive={true}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </div>

        {changes.length > 0 ? (
          <div className="section">
            <h3>Score change timeline</h3>
            <div className="help-muted">Only entries where the score changed vs the previous history point.</div>
            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              {changes.slice().reverse().map((c) => (
                <div key={c.at} className="card" style={{ boxShadow: "none", padding: 12, borderRadius: 16, background: "var(--surface)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 900 }}>{new Date(c.at).toLocaleString()}</div>
                    <div style={{ fontWeight: 900 }}>
                      {c.delta > 0 ? "+" : ""}
                      {c.delta.toFixed(3)}
                    </div>
                  </div>
                  <div className="help-muted" style={{ marginTop: 6 }}>
                    {c.from.toFixed(3)} → {c.to.toFixed(3)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="section">
          <h3>Table view</h3>
          <div className="help-muted">Timestamp, score, and change vs previous history point.</div>

          {!history.length ? (
            <div className="help-muted" style={{ marginTop: 10 }}>
              No history points yet.
            </div>
          ) : (
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table className="table" aria-label="Score table">
                <thead>
                  <tr>
                    <th>Captured at</th>
                    <th>Score</th>
                    <th>Δ vs prev</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((s, i) => {
                    const prev = i === 0 ? null : history[i - 1];
                    const d = prev ? s.score - prev.score : null;
                    return (
                      <tr key={s.captured_at}>
                        <td>{new Date(s.captured_at).toLocaleString()}</td>
                        <td style={{ fontWeight: 900 }}>{s.score.toFixed(3)}</td>
                        <td>{d === null ? "—" : `${d > 0 ? "+" : ""}${d.toFixed(3)}`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="section">
          <details>
            <summary style={{ fontWeight: 900, cursor: "pointer" }}>Possible factors (not guaranteed)</summary>
            <div className="help-muted" style={{ marginTop: 10, lineHeight: 1.6 }}>
              Neynar does not provide a per-change explanation feed here. These are general possibilities, not a definitive audit.
              <ul style={{ margin: "8px 0 0 18px" }}>
                <li>Reduced activity over time can be associated with lower scores.</li>
                <li>Model recalibrations can shift scores across many accounts at once.</li>
              </ul>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

function NotMiniApp() {
  return (
    <div className="container">
      <div className="card">
        <div className="header">
          <div className="brand">
            <img src="/assets/icon-1024.png" alt="Neynar History icon" />
            <div>
              <div className="h1">Open in a Farcaster Mini App</div>
              <div className="sub">This experience requires Mini App chrome (no browser address bar).</div>
            </div>
          </div>
        </div>
        <hr className="hr" />
        <div className="section">
          <div style={{ fontWeight: 800 }}>What to do</div>
          <div className="sub" style={{ marginTop: 8, lineHeight: 1.5 }}>
            Share <code>https://neynar-history.vercel.app/</code> in a Farcaster client that supports Mini Apps (e.g., Warpcast or Base app). Then tap “Open”.
            If you open this URL in a normal browser, it will intentionally refuse to run in “browser mode”.
          </div>
        </div>
      </div>
    </div>
  );
}

function InnerApp() {
  const boot = useMiniAppBootstrap();
  const [route, setRoute] = useState<Route>(() => parseRoute());

  useEffect(() => {
    const onPop = () => setRoute(parseRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (boot.state === "booting") {
    return (
      <div className="container">
        <div className="card">
          <div className="section">
            <div className="skel" style={{ width: 220, height: 20 }} />
            <div className="spacer" />
            <div className="skel" style={{ width: "100%", height: 56 }} />
            <div className="spacer" />
            <div className="skel" style={{ width: "100%", height: 180 }} />
          </div>
        </div>
      </div>
    );
  }

  if (boot.state === "not_miniapp") return <NotMiniApp />;
  if (boot.state === "error") {
    return (
      <div className="container">
        <div className="card">
          <div className="section">
            <div style={{ fontWeight: 900 }}>Unexpected error</div>
            <div className="sub" style={{ marginTop: 6 }}>Please relaunch the Mini App from the Farcaster client.</div>
          </div>
        </div>
      </div>
    );
  }

  if (route.name === "home") return <HomeView ctx={boot.ctx} />;
  return <UserView fid={route.fid} />;
}

export default function App() {
  return (
    <ToastProvider>
      <InnerApp />
    </ToastProvider>
  );
}
