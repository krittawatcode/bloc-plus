import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Comment, GymSettings, Hold, Route, Wall } from '@/domain/types';
import type { Database } from '@/lib/database.types';
import { uid } from '@/lib/format';
import { BackendError, type Backend, type NewComment, type Session } from './backend';
import {
  commentFromRow,
  holdFromRow,
  holdToRow,
  routeFromRow,
  routeToRow,
  settingsFromRow,
  settingsToRow,
  wallFromRow,
} from './mappers';

/** Files never change once uploaded (new versions get new paths), so phones may cache them for a year. */
const IMMUTABLE = '31536000';

/** Throw on errors; return the data, which must be there. */
function must<R extends { data: unknown; error: { message: string } | null }>(
  res: R,
): NonNullable<R['data']> {
  if (res.error) throw new Error(res.error.message);
  if (res.data === null || res.data === undefined) throw new Error('No data came back from the server.');
  return res.data as NonNullable<R['data']>;
}
/** Throw on errors; the data may legitimately be missing (for example `maybeSingle`). */
function maybe<T>(res: { data: T | null; error: { message: string } | null }): T | null {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}
/** Throw on errors for writes that return nothing. */
function ok(res: { error: { message: string } | null }): void {
  if (res.error) throw new Error(res.error.message);
}

export class SupabaseBackend implements Backend {
  readonly kind = 'supabase' as const;
  private sb: SupabaseClient<Database>;

  constructor(url: string, anonKey: string) {
    this.sb = createClient<Database>(url, anonKey);
  }

  private async toSession(user: { id: string; email?: string } | null | undefined): Promise<Session | null> {
    if (!user) return null;
    const { data } = await this.sb.rpc('is_staff');
    return { email: user.email ?? '', isStaff: data === true };
  }

  async getSession() {
    const { data } = await this.sb.auth.getSession();
    return this.toSession(data.session?.user);
  }

  onAuthChange(cb: (s: Session | null) => void) {
    const { data } = this.sb.auth.onAuthStateChange((_event, session) => {
      // Run outside the auth callback: Supabase recommends not awaiting other calls inside it.
      setTimeout(() => void this.toSession(session?.user).then(cb), 0);
    });
    return () => data.subscription.unsubscribe();
  }

  async signIn(email: string, password: string) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error)
      throw new BackendError(/invalid/i.test(error.message) ? 'Wrong email or password.' : error.message);
    const s = await this.getSession();
    if (!s?.isStaff) {
      await this.sb.auth.signOut();
      throw new BackendError('This account is not on the staff list yet. Ask the gym owner to add you.');
    }
  }

  async signOut() {
    await this.sb.auth.signOut();
  }

  async getSettings(): Promise<GymSettings> {
    return settingsFromRow(maybe(await this.sb.from('settings').select('*').eq('id', 1).maybeSingle()));
  }

  async listWalls(): Promise<Wall[]> {
    return must(await this.sb.from('walls').select('*').order('created_at')).map(wallFromRow);
  }

  async listHolds(): Promise<Hold[]> {
    return must(await this.sb.from('holds').select('*').order('created_at')).map(holdFromRow);
  }

  async listRoutes(): Promise<Route[]> {
    return must(await this.sb.from('routes').select('*').order('created_at')).map(routeFromRow);
  }

  async listComments(): Promise<Comment[]> {
    return must(
      await this.sb.from('comments').select('*').order('created_at', { ascending: false }).limit(1000),
    ).map(commentFromRow);
  }

  async sendCounts() {
    const rows = must(await this.sb.from('send_counts').select('*'));
    return Object.fromEntries(rows.filter((r) => r.route_id).map((r) => [r.route_id!, r.n ?? 0]));
  }

  photoUrl(path: string) {
    return this.sb.storage.from('photos').getPublicUrl(path).data.publicUrl;
  }

  async fetchScanFile(path: string) {
    const res = await fetch(this.sb.storage.from('scans').getPublicUrl(path).data.publicUrl);
    if (!res.ok)
      throw new BackendError('Could not download a file for this wall. Check the connection and try again.');
    return res.arrayBuffer();
  }

  private async upload(bucket: 'scans' | 'photos', path: string, data: Blob, contentType: string) {
    const { error } = await this.sb.storage
      .from(bucket)
      .upload(path, data, { contentType, cacheControl: IMMUTABLE, upsert: false });
    if (error) throw new Error(error.message);
  }

  private async remove(bucket: 'scans' | 'photos', paths: (string | null)[]) {
    const list = paths.filter((p): p is string => !!p);
    if (list.length) await this.sb.storage.from(bucket).remove(list);
  }

  async saveSettings(s: GymSettings) {
    ok(await this.sb.from('settings').update(settingsToRow(s)).eq('id', 1));
  }

  async addWall(w: { id: string; name: string; tris: number }, scan: ArrayBuffer, ghost: Float32Array) {
    const scanPath = `walls/${w.id}/scan-${uid()}.glb`;
    const ghostPath = `walls/${w.id}/outline-${uid()}.bin`;
    await this.upload(
      'scans',
      scanPath,
      new Blob([scan], { type: 'model/gltf-binary' }),
      'model/gltf-binary',
    );
    await this.upload(
      'scans',
      ghostPath,
      new Blob([ghost.slice().buffer as ArrayBuffer]),
      'application/octet-stream',
    );
    const row = must(
      await this.sb
        .from('walls')
        .insert({ id: w.id, name: w.name, scan_path: scanPath, ghost_path: ghostPath, tris: w.tris })
        .select()
        .single(),
    );
    return wallFromRow(row);
  }

  async updateWallOrientation(wall: Wall, o: { upright: boolean; spin: number }, ghost: Float32Array) {
    const ghostPath = `walls/${wall.id}/outline-${uid()}.bin`;
    await this.upload(
      'scans',
      ghostPath,
      new Blob([ghost.slice().buffer as ArrayBuffer]),
      'application/octet-stream',
    );
    const row = must(
      await this.sb
        .from('walls')
        .update({ ...o, ghost_path: ghostPath })
        .eq('id', wall.id)
        .select()
        .single(),
    );
    await this.remove('scans', [wall.ghostPath]);
    return wallFromRow(row);
  }

  async deleteWall(wall: Wall, holds: Hold[], _routes: Route[], photoPaths: string[]) {
    // Routes point at walls by id only (the practice wall has no row), so delete them first.
    // Comments and sends go with their routes, and holds with the wall (foreign keys cascade).
    ok(await this.sb.from('routes').delete().eq('wall_id', wall.id));
    ok(await this.sb.from('walls').delete().eq('id', wall.id));
    await this.remove('scans', [wall.scanPath, wall.ghostPath, ...holds.map((h) => h.piecePath)]);
    await this.remove('photos', photoPaths);
  }

  async deleteRoutes(routes: Route[], photoPaths: string[]) {
    if (!routes.length) return;
    ok(
      await this.sb
        .from('routes')
        .delete()
        .in(
          'id',
          routes.map((r) => r.id),
        ),
    );
    await this.remove('photos', photoPaths);
  }

  async addHold(hold: Omit<Hold, 'piecePath'>, piece: ArrayBuffer) {
    const piecePath = `walls/${hold.wallId}/holds/${hold.id}.bin`;
    await this.upload('scans', piecePath, new Blob([piece]), 'application/octet-stream');
    const row = must(
      await this.sb
        .from('holds')
        .insert(holdToRow({ ...hold, piecePath }))
        .select()
        .single(),
    );
    return holdFromRow(row);
  }

  async deleteHold(hold: Hold) {
    ok(await this.sb.from('holds').delete().eq('id', hold.id));
    await this.remove('scans', [hold.piecePath]);
  }

  async saveRoutes(routes: Route[]) {
    if (routes.length) ok(await this.sb.from('routes').upsert(routes.map(routeToRow)));
  }

  async setCommentHidden(id: string, hidden: boolean) {
    ok(
      await this.sb
        .from('comments')
        .update(hidden ? { hidden, reported: false } : { hidden })
        .eq('id', id),
    );
  }

  async clearReport(id: string) {
    ok(await this.sb.from('comments').update({ reported: false }).eq('id', id));
  }

  async deleteComment(c: Comment) {
    ok(await this.sb.from('comments').delete().eq('id', c.id));
    await this.remove('photos', [c.photoPath]);
  }

  async addComment(input: NewComment) {
    let photoPath: string | null = null;
    if (input.photo) {
      photoPath = `${uid()}${uid()}.jpg`;
      await this.upload('photos', photoPath, input.photo, 'image/jpeg');
    }
    const row = must(
      await this.sb
        .from('comments')
        .insert({
          route_id: input.routeId,
          nick: input.nick,
          body: input.body,
          beta: input.beta,
          photo_path: photoPath,
        })
        .select()
        .single(),
    );
    return commentFromRow(row);
  }

  async reportComment(id: string) {
    ok(await this.sb.rpc('report_comment', { cid: id }));
  }

  async addSend(routeId: string, deviceId: string) {
    const { error } = await this.sb.from('sends').insert({ route_id: routeId, device_id: deviceId });
    if (error && error.code !== '23505') throw new Error(error.message);
  }
}
