import type { Comment, GymSettings, Hold, Route, Wall } from '@/domain/types';

export interface Session {
  email: string;
  /** Signed in AND listed in the staff table. */
  isStaff: boolean;
}

export interface NewComment {
  routeId: string;
  nick: string;
  body: string;
  beta: boolean;
  photo: Blob | null;
}

/**
 * Everything the app needs from storage and login.
 * `SupabaseBackend` talks to a Supabase project; `DemoBackend` keeps everything in this browser.
 * Methods throw `BackendError` with a message that can be shown to people as-is.
 */
export interface Backend {
  readonly kind: 'supabase' | 'demo';

  getSession(): Promise<Session | null>;
  onAuthChange(cb: (session: Session | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;

  getSettings(): Promise<GymSettings>;
  listWalls(): Promise<Wall[]>;
  listHolds(): Promise<Hold[]>;
  listRoutes(): Promise<Route[]>;
  /** Visible comments for climbers; all comments for staff. Newest first. */
  listComments(): Promise<Comment[]>;
  sendCounts(): Promise<Record<string, number>>;

  /** Public URL of a comment photo. */
  photoUrl(path: string): string;
  /** Download a file from the scans store (wall scan, wall outline or hold file). */
  fetchScanFile(path: string): Promise<ArrayBuffer>;

  saveSettings(settings: GymSettings): Promise<void>;
  addWall(
    wall: { id: string; name: string; tris: number },
    scan: ArrayBuffer,
    ghost: Float32Array,
  ): Promise<Wall>;
  updateWallOrientation(
    wall: Wall,
    o: { upright: boolean; spin: number },
    ghost: Float32Array,
  ): Promise<Wall>;
  /** Remove a wall with its scan, holds and routes. Comments and sends on those routes go too. */
  deleteWall(wall: Wall, holds: Hold[], routes: Route[], photoPaths: string[]): Promise<void>;
  /** Delete routes for good. Pass a normal route's extras too: they are deleted with it. */
  deleteRoutes(routes: Route[], photoPaths: string[]): Promise<void>;
  addHold(hold: Omit<Hold, 'piecePath'>, piece: ArrayBuffer): Promise<Hold>;
  deleteHold(hold: Hold): Promise<void>;
  saveRoutes(routes: Route[]): Promise<void>;
  setCommentHidden(id: string, hidden: boolean): Promise<void>;
  clearReport(id: string): Promise<void>;
  deleteComment(comment: Comment): Promise<void>;

  addComment(input: NewComment): Promise<Comment>;
  reportComment(id: string): Promise<void>;
  /** Log a send. Sending the same route twice from one device is ignored. */
  addSend(routeId: string, deviceId: string): Promise<void>;
}

export class BackendError extends Error {}

/** Turn library and network errors into something a person can act on. */
export function friendly(e: unknown): string {
  if (e instanceof BackendError) return e.message;
  const m = String((e as { message?: string })?.message ?? e);
  if (/row-level security|permission denied|not authorized|JWT|violates row/i.test(m))
    return 'You need to be signed in as staff to do that.';
  if (/payload too large|exceeded the maximum|too large/i.test(m))
    return 'That file is too large to upload. The limit is 50 MB.';
  if (/failed to fetch|networkerror|load failed|network/i.test(m))
    return 'No connection. Check the internet and try again.';
  return `Something went wrong: ${m.slice(0, 140)}`;
}
