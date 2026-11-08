import { defaultGrading } from '@/domain/grading';
import { PRACTICE_ROUTES } from '@/domain/practice';
import type { Comment, GymSettings, Hold, Route, Wall } from '@/domain/types';
import { uid } from '@/lib/format';
import { BackendError, type Backend, type NewComment, type Session } from './backend';

/**
 * Demo mode: everything stays in this browser. Tables live in localStorage, files in IndexedDB.
 * Any email with any password signs in as staff. Use it to try the app before setting up Supabase.
 */
interface Tables {
  version: 1;
  settings: GymSettings;
  walls: Wall[];
  holds: Hold[];
  routes: Route[];
  comments: Comment[];
  sends: { routeId: string; deviceId: string }[];
}

const KEY = 'blocplus-demo';
const SESSION_KEY = 'blocplus-demo-session';

function seed(): Tables {
  return {
    version: 1,
    settings: { gymName: 'Your gym', grading: defaultGrading(), qrLink: '' },
    walls: [],
    holds: [],
    routes: PRACTICE_ROUTES.map((r) => ({ ...r })),
    comments: [],
    sends: [],
  };
}

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('blocplus-demo-files', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function putFile(path: string, data: Blob) {
  const db = await idb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').put(data, path);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function getFile(path: string): Promise<Blob | undefined> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('files', 'readonly').objectStore('files').get(path);
    req.onsuccess = () => resolve(req.result as Blob | undefined);
    req.onerror = () => reject(req.error);
  });
}
async function deleteFiles(paths: (string | null)[]) {
  const list = paths.filter((p): p is string => !!p);
  if (!list.length) return;
  const db = await idb();
  const tx = db.transaction('files', 'readwrite');
  for (const p of list) tx.objectStore('files').delete(p);
}

export class DemoBackend implements Backend {
  readonly kind = 'demo' as const;
  private t: Tables;
  private listeners = new Set<(s: Session | null) => void>();
  private photoUrls = new Map<string, string>();

  constructor() {
    let t: Tables | null = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) t = JSON.parse(raw) as Tables;
    } catch {
      t = null;
    }
    this.t = t?.version === 1 ? t : seed();
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.t));
    } catch {
      throw new BackendError(
        'This browser is out of space for demo data. Clear the demo data and try again.',
      );
    }
  }

  private session(): Session | null {
    try {
      const email = localStorage.getItem(SESSION_KEY);
      return email ? { email, isStaff: true } : null;
    } catch {
      return null;
    }
  }

  private requireStaff() {
    if (!this.session()) throw new BackendError('You need to be signed in as staff to do that.');
  }

  async getSession() {
    return this.session();
  }
  onAuthChange(cb: (s: Session | null) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  async signIn(email: string, password: string) {
    if (!email.trim() || !password)
      throw new BackendError('Enter an email and a password. In demo mode any will do.');
    localStorage.setItem(SESSION_KEY, email.trim());
    this.listeners.forEach((f) => f(this.session()));
  }
  async signOut() {
    localStorage.removeItem(SESSION_KEY);
    this.listeners.forEach((f) => f(null));
  }

  async getSettings() {
    return structuredClone(this.t.settings);
  }
  async listWalls() {
    return structuredClone(this.t.walls);
  }
  async listHolds() {
    return structuredClone(this.t.holds);
  }
  async listRoutes() {
    return structuredClone(this.t.routes);
  }
  async listComments() {
    const staff = !!this.session();
    const list = this.t.comments
      .filter((c) => staff || !c.hidden)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    await Promise.all(
      list
        .filter((c) => c.photoPath && !this.photoUrls.has(c.photoPath))
        .map(async (c) => {
          const blob = await getFile(`photos/${c.photoPath}`);
          if (blob) this.photoUrls.set(c.photoPath!, URL.createObjectURL(blob));
        }),
    );
    return structuredClone(list);
  }
  async sendCounts() {
    const counts: Record<string, number> = {};
    for (const s of this.t.sends) counts[s.routeId] = (counts[s.routeId] ?? 0) + 1;
    return counts;
  }

  photoUrl(path: string) {
    return this.photoUrls.get(path) ?? '';
  }
  async fetchScanFile(path: string) {
    const blob = await getFile(`scans/${path}`);
    if (!blob) throw new BackendError('This file is missing from the demo data on this device.');
    return blob.arrayBuffer();
  }

  async saveSettings(s: GymSettings) {
    this.requireStaff();
    this.t.settings = structuredClone(s);
    this.save();
  }

  async addWall(w: { id: string; name: string; tris: number }, scan: ArrayBuffer, ghost: Float32Array) {
    this.requireStaff();
    const scanPath = `walls/${w.id}/scan-${uid()}.glb`;
    const ghostPath = `walls/${w.id}/outline-${uid()}.bin`;
    await putFile(`scans/${scanPath}`, new Blob([scan]));
    await putFile(`scans/${ghostPath}`, new Blob([ghost.slice().buffer as ArrayBuffer]));
    const wall: Wall = {
      id: w.id,
      name: w.name,
      scanPath,
      ghostPath,
      upright: false,
      spin: 0,
      tris: w.tris,
      createdAt: new Date().toISOString(),
      retiredAt: null,
      replacedBy: null,
    };
    this.t.walls.push(wall);
    this.save();
    return structuredClone(wall);
  }

  async updateWallOrientation(wall: Wall, o: { upright: boolean; spin: number }, ghost: Float32Array) {
    this.requireStaff();
    const ghostPath = `walls/${wall.id}/outline-${uid()}.bin`;
    await putFile(`scans/${ghostPath}`, new Blob([ghost.slice().buffer as ArrayBuffer]));
    const w = this.t.walls.find((x) => x.id === wall.id);
    if (!w) throw new BackendError('That wall no longer exists.');
    await deleteFiles([w.ghostPath ? `scans/${w.ghostPath}` : null]);
    Object.assign(w, o, { ghostPath });
    this.save();
    return structuredClone(w);
  }

  async renameWall(wall: Wall, name: string) {
    this.requireStaff();
    const w = this.t.walls.find((x) => x.id === wall.id);
    if (!w) throw new BackendError('That wall no longer exists.');
    w.name = name;
    this.save();
    return structuredClone(w);
  }

  async resetWall(
    old: Wall,
    next: { id: string; name: string; tris: number },
    scan: ArrayBuffer,
    ghost: Float32Array,
  ) {
    const wall = await this.addWall(next, scan, ghost);
    const w = this.t.walls.find((x) => x.id === old.id);
    if (w) Object.assign(w, { retiredAt: new Date().toISOString(), replacedBy: wall.id });
    for (const r of this.t.routes) if (r.wallId === old.id) r.archived = true;
    this.save();
    return wall;
  }

  async deleteWall(wall: Wall, holds: Hold[], routes: Route[], photoPaths: string[]) {
    this.requireStaff();
    this.t.walls = this.t.walls.filter((w) => w.id !== wall.id);
    this.t.holds = this.t.holds.filter((h) => h.wallId !== wall.id);
    this.dropRoutes([
      ...routes.map((r) => r.id),
      ...this.t.routes.filter((r) => r.wallId === wall.id).map((r) => r.id),
    ]);
    this.save();
    await deleteFiles(photoPaths.map((p) => `photos/${p}`));
    await deleteFiles(
      [wall.scanPath, wall.ghostPath, ...holds.map((h) => h.piecePath)].map((p) => (p ? `scans/${p}` : null)),
    );
  }

  async addHold(hold: Omit<Hold, 'piecePath'>, piece: ArrayBuffer) {
    this.requireStaff();
    const piecePath = `walls/${hold.wallId}/holds/${hold.id}.bin`;
    await putFile(`scans/${piecePath}`, new Blob([piece]));
    const h: Hold = { ...hold, piecePath };
    this.t.holds.push(h);
    this.save();
    return structuredClone(h);
  }

  async deleteRoutes(routes: Route[], photoPaths: string[]) {
    this.requireStaff();
    this.dropRoutes(routes.map((r) => r.id));
    this.save();
    await deleteFiles(photoPaths.map((p) => `photos/${p}`));
  }

  /** Remove routes, their extras, and the comments and sends on all of them. */
  private dropRoutes(ids: string[]) {
    const gone = new Set(ids);
    for (const r of this.t.routes) if (r.baseId && gone.has(r.baseId)) gone.add(r.id);
    this.t.routes = this.t.routes.filter((r) => !gone.has(r.id));
    this.t.comments = this.t.comments.filter((c) => !gone.has(c.routeId));
    this.t.sends = this.t.sends.filter((s) => !gone.has(s.routeId));
  }

  async deleteHold(hold: Hold) {
    this.requireStaff();
    this.t.holds = this.t.holds.filter((h) => h.id !== hold.id && h.onId !== hold.id);
    this.save();
    await deleteFiles([hold.piecePath ? `scans/${hold.piecePath}` : null]);
  }

  async saveRoutes(routes: Route[]) {
    this.requireStaff();
    for (const r of routes) {
      const i = this.t.routes.findIndex((x) => x.id === r.id);
      if (i >= 0) this.t.routes[i] = structuredClone(r);
      else this.t.routes.push({ ...structuredClone(r), createdAt: new Date().toISOString() });
    }
    this.save();
  }

  async setCommentHidden(id: string, hidden: boolean) {
    this.requireStaff();
    const c = this.t.comments.find((x) => x.id === id);
    if (c) Object.assign(c, hidden ? { hidden, reported: false } : { hidden });
    this.save();
  }
  async clearReport(id: string) {
    this.requireStaff();
    const c = this.t.comments.find((x) => x.id === id);
    if (c) c.reported = false;
    this.save();
  }
  async deleteComment(comment: Comment) {
    this.requireStaff();
    this.t.comments = this.t.comments.filter((c) => c.id !== comment.id);
    this.save();
    await deleteFiles([comment.photoPath ? `photos/${comment.photoPath}` : null]);
  }

  async addComment(input: NewComment) {
    let photoPath: string | null = null;
    if (input.photo) {
      photoPath = `${uid()}.jpg`;
      await putFile(`photos/${photoPath}`, input.photo);
      this.photoUrls.set(photoPath, URL.createObjectURL(input.photo));
    }
    const c: Comment = {
      id: uid('c'),
      routeId: input.routeId,
      nick: input.nick,
      body: input.body,
      beta: input.beta,
      photoPath,
      hidden: false,
      reported: false,
      createdAt: new Date().toISOString(),
    };
    this.t.comments.push(c);
    this.save();
    return structuredClone(c);
  }
  async reportComment(id: string) {
    const c = this.t.comments.find((x) => x.id === id);
    if (c && !c.hidden) c.reported = true;
    this.save();
  }
  async addSend(routeId: string, deviceId: string) {
    if (!this.t.sends.some((s) => s.routeId === routeId && s.deviceId === deviceId))
      this.t.sends.push({ routeId, deviceId });
    this.save();
  }
  async removeSend(routeId: string, deviceId: string) {
    this.t.sends = this.t.sends.filter((s) => !(s.routeId === routeId && s.deviceId === deviceId));
    this.save();
  }

  /** Start the demo over. */
  static reset() {
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(SESSION_KEY);
      indexedDB.deleteDatabase('blocplus-demo-files');
    } catch {
      /* nothing to clear */
    }
  }
}
