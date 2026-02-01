export type NeynarUser = {
  fid: number;
  username?: string;
  display_name?: string;
  pfp_url?: string;
  [k: string]: unknown;
};

export async function neynarFetch<T>(url: string): Promise<T> {
  const apiKey = process.env.NEYNAR_API_KEY;
  if (!apiKey) {
    throw new Error('Missing NEYNAR_API_KEY env var');
  }
  const res = await fetch(url, {
    headers: { api_key: apiKey }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Neynar error ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export async function resolveByUsername(username: string): Promise<NeynarUser> {
  const u = username.replace(/^@/, '').trim();
  const data = await neynarFetch<{ user: NeynarUser }>(
    `https://api.neynar.com/v2/farcaster/user/by_username?username=${encodeURIComponent(u)}`
  );
  return data.user;
}

export async function fetchUserBulk(fids: number[]): Promise<NeynarUser[]> {
  const param = fids.join(',');
  const data = await neynarFetch<{ users: NeynarUser[] }>(
    `https://api.neynar.com/v2/farcaster/user/bulk?fids=${encodeURIComponent(param)}`
  );
  return data.users;
}

export function extractScore(user: any): number | null {
  // Neynar exposes score in experimental.neynar_user_score for many endpoints
  const maybe = user?.experimental?.neynar_user_score;
  if (typeof maybe === 'number' && maybe >= 0 && maybe <= 1) return maybe;
  return null;
}
