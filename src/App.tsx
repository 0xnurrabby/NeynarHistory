import React, { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { ensureMiniAppOrThrow, getContext, ready, signIn } from "./lib/farcaster";
import { ensureBaseMainnet } from "./lib/baseWallet";
import type { Snapshot, UserCard } from "./lib/types";
import { ToastProvider, useToasts } from "./components/Toasts";
import { Avatar } from "./components/Avatar";
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
  const msg =
    typeof e === "string"
      ? e
      : e instanceof Error
        ? e.message
        : typeof e?.message === "string"
          ? e.message
          : (() => { try { return JSON.stringify(e); } catch { return String(e); } })();

  if (!msg) return "Unknown error";
  if (msg === "RATE_LIMITED" || msg === "RATE_LIMITED_COOLDOWN" || /ratelimit/i.test(msg)) {
    return "Neynar rate limit reached. Please wait about 60 seconds and try again.";
  }
  return msg;
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
  // Basic request dedupe (prevents multiple components from hammering the same endpoint)
  // and a cooldown for Neynar 429s.
  const key = `inflight:${path}`;
  const w: any = window as any;

  const cooldownUntil = Number(localStorage.getItem("neynar_rl_until") || "0");
  if (Date.now() < cooldownUntil) {
    throw new Error("RATE_LIMITED_COOLDOWN");
  }

  w.__inflight = w.__inflight || new Map<string, Promise<any>>();
  const inflight: Map<string, Promise<any>> = w.__inflight;

  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const p = (async () => {
    const res = await fetch(path, { headers: { "accept": "application/json" } });
    const text = await res.text();

    if (!res.ok) {
      if (res.status === 429 || /ratelimit/i.test(text)) {
        const retry = (() => {
          const m = text.match(/per\s+(\d+)s\s+window/i);
          return m ? Number(m[1]) || 60 : 60;
        })();
        localStorage.setItem("neynar_rl_until", String(Date.now() + retry * 1000));
        throw new Error("RATE_LIMITED");
      }
      throw new Error(text || `HTTP ${res.status}`);
    }

    return JSON.parse(text) as T;
  })();

  inflight.set(key, p);
  try {
    return await p;
  } finally {
    inflight.delete(key);
  }
}

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

  async function handleEnsureBase() {
    setLoading(true);
    try {
      const r = await ensureBaseMainnet();
      if (r.ok) {
        push({ type:"success", title:"Base ready", msg:"Wallet is on Base Mainnet (0x2105)." });
      } else if (r.reason === "USER_REJECTED") {
        push({ type:"warning", title:"Request canceled", msg:"You rejected the wallet confirmation. You can try again anytime." });
      } else {
        push({ type:"error", title:"Couldn't switch chain", msg:"Please switch to Base Mainnet (0x2105) in your wallet and retry." });
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
            <button className="btn" onClick={handleEnsureBase} disabled={loading}>
              Enable Base wallet
            </button>
            {auth?.fid ? (
              <button className="btn primary" disabled title="Already connected">
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
              {/* avatar */}<Avatar url={display?.pfp_url} handle={display?.username || display?.display_name || null} size={36} />
              </div>
            </div>
          </div>

          <div className="spacer" />

          <div className="card" style={{ boxShadow:"none", background:"var(--tint2)" }}>
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
          <div className="card" style={{ boxShadow:"none", borderRadius:16, background:"var(--tint2)", border:"1px solid var(--border)" }}>
            <div className="section">
              <div style={{ fontWeight: 800 }}>Possible factors (not guaranteed)</div>
              <div className="sub" style={{ marginTop: 6, lineHeight: 1.45 }}>
                Neynar does not provide a per-change explanation feed here. These are general possibilities, not a definitive audit.
                Reduced activity over time can be associated with lower scores. Model recalibrations can shift scores across many accounts at once.
              </div>
            </div>
          </div>
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
