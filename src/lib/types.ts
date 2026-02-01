export type Snapshot = {
  fid: number;
  score: number;
  captured_at: string; // ISO
};

export type UserCard = {
  fid: number;
  username?: string | null;
  display_name?: string | null;
  pfp_url?: string | null;
  score: number | null;
  last_fetched_at: string | null;
};
