import React, { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { ensureMiniAppOrThrow, getContext, ready, signIn } from "./lib/farcaster";
import type { Snapshot, UserCard } from "./lib/types";
import { ToastProvider, useToasts } from "./components/Toasts";
import { SkeletonScoreCard } from "./components/Skeleton";

type Route =
  | { name: "home" }
  | { name: "user"; fid: number };

function parseRoute(): Route {
  const url = new URL(window.location.href);
  const hash = (url.hash || "").replace(/^#/, "");
  const parts = hash.split("/").filter(Boolean);
  if (parts[0] === "user" && parts[1] && /^\d+$/.test(parts[1])) {
    return { name: "user", fid: Number(parts[1]) };
  }
  return { name: "home" };
}

function navigate(route: Route) {
  const url = new URL(window.location.href);
  url.pathname = "/";
  if (route.name === "home") url.hash = "#/";
  if (route.name === "user") url.hash = `#/user/${route.fid}`;
  window.history.pushState({}, "", url.toString());
  window.dispatchEvent(new Event("hashchange"));
}

function fmtErr(e: any): string {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (typeof e?.message === "string") return e.message;
  try { return JSON.stringify(e); } catch { return String(e); }
}


function useTweenNumber(value: number | null, ms = 650) {
  const [v, setV] = useState<number>(value ?? 0);
  useEffect(() => {
    if (value === null || Number.isNaN(value)) return;
    const start = v;
    const end = value;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(start + (end - start) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return v;
}

function Avatar({ url, alt, size = 36 }: { url?: string | null; alt: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const safe = url && /^https?:\/\//.test(url) ? url : null;
  if (!safe || broken) {
    return (
      <div
        aria-label={alt}
        style={{
          width: size,
          height: size,
          borderRadius: 14,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          display: "grid",
          placeItems: "center",
          color: "var(--muted)",
          fontWeight: 800,
          fontSize: 12,
        }}
      >
        🙂
      </div>
    );
  }
  return (
    <img
      src={safe}
      alt={alt}
      referrerPolicy="no-referrer"
      crossOrigin="anonymous"
      onError={() => setBroken(true)}
      style={{ width: size, height: size, borderRadius: 14, border: "1px solid var(--border)", objectFit: "cover" }}
    />
  );
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
    token?: string;
  } | null>(null);
  const scoreAnim = useTweenNumber(me?.score ?? null, 800);

  const meFid = ctx?.user?.fid ?? null;


  useEffect(() => {
    if (!meFid) return;
    (async () => {
      try {
        const u = await apiJson<UserCard>(`/api/score?fid=${meFid}`);
        setMe(u);
      } catch {}
    })();
  }, [meFid]);

  async function handleSignIn() {
    setLoading(true);
    try {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      const nonce = Array.from(bytes).map(b => b.toString(16).padStart(2,"0")).join("");
      const credential: any = await signIn(nonce);
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nonce,
          message: credential?.message,
          signature: credential?.signature
        })
      });
      let data: any = null;
      try { data = await res.json(); } catch { data = null; }
      if (!res.ok || !data?.ok) {
        const msg = data?.error ? String(data.error) : `Auth verification failed (HTTP ${res.status})`;
        throw new Error(msg);
      }
      const identity = data.identity;
      setAuth({
        fid: identity.fid,
        username: identity.username,
        display_name: identity.display_name,
        pfp_url: identity.pfp_url,
      });
      push({ type:"success", title:"Signed in", msg:`@${identity.username ?? "user"} (FID ${identity.fid})` });
      const u = await apiJson<UserCard>(`/api/score?fid=${identity.fid}`);
      setMe(u);
    } catch (e:any) {
      push({ type:"error", title:"Sign-in failed", msg: fmtErr(e) });
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch() {
    const q = query.trim();
    if (!q) {
      push({ type:"warning", title:"Enter @handle or FID", msg:"Examples: @dwr or 3" });
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
      navigate({ name:"user", fid });
    } catch (e:any) {
      push({ type:"error", title:"Lookup failed", msg:fmtErr(e) });
    } finally {
      setLoading(false);
    }
  }
    } catch {
      push({ type:"error", title:"Wallet unavailable", msg:"This host may not support Ethereum wallet access." });
    } finally {
      setLoading(false);
    }
  }

  const display = auth ?? {
    fid: meFid ?? undefined,
    username: ctx?.user?.username,
    display_name: ctx?.user?.displayName,
    pfp_url: ctx?.user?.pfpUrl
  };

  return (
    <div className="container">
      <div className="card">
        <div className="header">
          <div className="brand">
            <img src="/assets/icon-1024.png" alt="Neynar History icon" />
            <div>
              <div className="h1">Neynar History</div>
              <div className="sub">Mini App</div>
            </div>
          </div>
          <div className="row">
                        {auth ? (
              <button className="btn" disabled>
                Connected
              </button>
            ) : (
              <button className="btn primary" onClick={handleSignIn} disabled={loading}>
                {loading ? "Loading…" : "Sign in with Farcaster"}
              </button>
            )}
          </div>
        </div>
        <hr className="hr" />
        <div className="section">
          <div className="row" style={{ alignItems:"center", justifyContent:"space-between" }}>
            <div>
              <div className="sub">Signed-in identity</div>
              <div style={{ fontWeight: 800, marginTop: 4 }}>
                {display?.fid ? `FID ${display.fid}` : "—"}
                {display?.username ? ` • @${display.username}` : ""}
              </div>
            </div>
            <div className="row" style={{ alignItems:"center" }}>
              {display?.pfp_url ? (
                <Avatar url={display.pfp_url} alt="Profile" size={36} />
              ) : null}
              <button
                className="btn"
                onClick={() => {
                  if (!me?.fid && !display?.fid) return;
                  navigate({ name:"user", fid: me?.fid ?? (display.fid as number) });
                }}
                disabled={!me?.fid && !display?.fid}
              >
                View 90-day history
              </button>
            </div>
          </div>

          <div className="spacer" />

          <div className="row" style={{ alignItems:"flex-end", justifyContent:"space-between" }}>
            <div className="scoreHero">
              <div className="scoreLabel">Your Neynar score</div>
              <div className="scoreValue">
                {me?.score != null ? <span className="scoreDigits">{scoreAnim.toFixed(3)}</span> : <span className="scoreDigits muted">—</span>}
              </div>
              <div className="scoreMeta">
                Last fetched: {me?.last_fetched_at ? new Date(me.last_fetched_at).toLocaleString() : "—"}
              </div>
            </div>

            <div style={{ minWidth: 320 }}>
              <div className="sub">Look up another user</div>
              <div className="row" style={{ marginTop: 6 }}>
                <input
                  className="input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="@handle or FID"
                  aria-label="Search by handle or FID"
                />
                <button className="btn primary" onClick={handleSearch} disabled={loading}>
                  Search
                </button>
              </div>
              <div className="sub" style={{ marginTop: 6 }}>
                Examples: <code>@dwr</code>, <code>3</code>
              </div>
            </div>
          </div>

          <div className="spacer" />
              </div>
  );
}

function UserView({ fid }: { fid: number }) {
  const { push } = useToasts();
  const [range, setRange] = useState<7|30|90>(7);
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
        fetch(`/api/track`, {
          method: "POST",
          headers: { "content-type":"application/json" },
          body: JSON.stringify({ fid })
        }).catch(() => void 0);
      } catch (e:any) {
        if (cancelled) return;
        push({ type:"error", title:"Failed to load user", msg:fmtErr(e) });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
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
      captured_at: s.captured_at
    }));
  }, [history]);

  const changes = useMemo(() => {
    const out: Array<{ at: string; from: number; to: number; delta: number }> = [];
    for (let i = 1; i < history.length; i++) {
      const prev = history[i-1];
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
        method:"POST",
        headers: { "content-type":"application/json" },
        body: JSON.stringify({ fid, pinned: true })
      });
      if (!res.ok) throw new Error(await res.text());
      push({ type:"success", title:"Tracking enabled", msg:"We'll try to keep snapshots fresh via scheduled checks." });
    } catch (e:any) {
      push({ type:"error", title:"Couldn't enable tracking", msg:fmtErr(e) });
    } finally {
      setTracking(false);
    }
  }

  function exportCsv() {
    if (!history.length) {
      push({ type:"warning", title:"No data to export", msg:"Try again after snapshots exist." });
      return;
    }
    const rows: string[][] = [["captured_at","score","delta_vs_prev"]];
    for (let i=0;i<history.length;i++) {
      const cur = history[i];
      const prev = history[i-1];
      const delta = prev ? (cur.score - prev.score) : "";
      rows.push([cur.captured_at, cur.score.toString(), delta.toString()]);
    }
    const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type:"text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `neynar-history-fid-${fid}-${range}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
    push({ type:"success", title:"CSV exported", msg:"Downloaded to your device." });
  }

  return (
    <div className="container">
      <div className="card">
        <div className="header">
          <div className="brand" style={{ gap: 12 }}>
            <button className="btn" onClick={() => navigate({ name:"home" })}>← Home</button>
            <div>
              <div className="h1">User score</div>
              <div className="sub">FID {fid}{user?.username ? ` • @${user.username}` : ""}</div>
            </div>
          </div>
          <div className="row">
            <button className="btn" onClick={exportCsv} disabled={loading}></button>
            <button className="btn primary" onClick={toggleTrack} disabled={tracking}>
              {tracking ? "Saving…" : "Track"}
            </button>
          </div>
        </div>
        <hr className="hr" />
        <div className="section">
          {loading ? <SkeletonScoreCard /> : (
            <div className="row" style={{ alignItems:"flex-end", justifyContent:"space-between" }}>
              <div className="kv">
                <div className="k">Current score (0–1)</div>
                <div className="v">{formatScore(user?.score ?? null)}</div>
                <div className="sub">Last fetched at: {user?.last_fetched_at ? new Date(user.last_fetched_at).toLocaleString() : "—"}</div>
              </div>
              <div className="row" style={{ alignItems:"center" }}>
                <Badge delta={delta} />
              </div>
            </div>
          )}

          <div className="spacer" />

          <div className="row" style={{ alignItems:"center", justifyContent:"space-between" }}>
            <div className="sub">
              Range:
              <span style={{ marginLeft: 8 }} />
              {[7,30,90].map((d) => (
                <button
                  key={d}
                  className="btn"
                  onClick={() => setRange(d as any)}
                  disabled={loading || range === d}
                  style={{ padding: "8px 10px" }}
                >
                  {d}d
                </button>
              ))}
            </div>
            <div className="sub">
              {historyBeginsOn ? `History begins on ${historyBeginsOn}.` : "No snapshots yet."}
            </div>
          </div>

          <div className="spacer" />

          <div className="grid">
            <div className="card" style={{ boxShadow:"none" }}>
              <div className="section">
                <div style={{ fontWeight: 800 }}>Score history</div>
                <div className="sub" style={{ marginTop: 6 }}></div>
                <div style={{ height: 260, marginTop: 10 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                      <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
                      <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                      <Tooltip
                        formatter={(v: any) => [Number(v).toFixed(3), "score"]}
                        labelFormatter={(l) => `Date: ${l}`}
                      />
                      <Line type="monotone" dataKey="score" dot={{ r: 2 }} activeDot={{ r: 4 }} stroke="var(--primary)" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="card" style={{ boxShadow:"none" }}>
              <div className="section">
                <div style={{ fontWeight: 800 }}>Score change timeline</div>
                <div className="sub" style={{ marginTop: 6 }}></div>
                <div className="spacer" />
                {changes.length ? (
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    {changes.slice().reverse().map((c, idx) => (
                      <div key={idx} className="card" style={{ boxShadow:"none", borderRadius:16, background:"var(--surface)", border:"1px solid var(--border)" }}>
                        <div className="section" style={{ padding:"10px 12px" }}>
                          <div style={{ fontWeight: 800, fontSize: 13 }}>
                            {new Date(c.at).toLocaleString()}
                          </div>
                          <div className="sub" style={{ marginTop: 4 }}>
                            {c.from.toFixed(3)} → {c.to.toFixed(3)} ({c.delta>0?"+":""}{c.delta.toFixed(3)})
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="sub">No changes recorded in the selected range.</div>
                )}
              </div>
            </div>
          </div>

          <div className="spacer" />

          <div className="card" style={{ boxShadow:"none" }}>
            <div className="section">
              <div style={{ fontWeight: 800 }}>Table view (accessible alternative)</div>
              <div className="sub" style={{ marginTop: 6 }}>
                
              </div>
              <div className="spacer" />
              <div style={{ overflowX:"auto" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Captured at</th>
                      <th>Score</th>
                      <th>Δ vs prev</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((s, i) => {
                      const prev = history[i-1];
                      const d = prev ? (s.score - prev.score) : null;
                      return (
                        <tr key={s.captured_at}>
                          <td>{new Date(s.captured_at).toLocaleString()}</td>
                          <td>{s.score.toFixed(3)}</td>
                          <td>{d === null ? "—" : `${d>0?"+":""}${d.toFixed(3)}`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="spacer" />
          
        </div>
      </div>

      <div className="spacer" />
      <div className="sub">
        Onchain reference: an onchain score lookup may exist for verification, but it still won’t automatically provide 90-day history unless you store or index snapshots.
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
    window.addEventListener("hashchange", onPop);
    return () => window.removeEventListener("hashchange", onPop);
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
