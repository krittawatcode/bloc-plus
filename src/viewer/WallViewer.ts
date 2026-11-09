import {
  BackSide,
  Box3,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  DirectionalLight,
  DoubleSide,
  Group,
  Matrix4,
  HemisphereLight,
  type Intersection,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  LineBasicMaterial,
  LineSegments,
  Raycaster,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Hold, HoldMap, Role } from '@/domain/types';
import { PRACTICE_WALL_ID } from '@/domain/types';
import { withMarkers } from '@/domain/routes';
import type { LoadedScan } from './scan';
import { gridFromPoints, type GridWall } from './gridWall';
import { PRACTICE_BOX, PRACTICE_HOLDS, buildPracticeHold, practiceWallObjects } from './practiceWall';

export type MarkerRole = Role | 'tag' | 'marker';
export type MarkerMap = Record<string, MarkerRole>;

/** Where the viewer gets hold data and files from. Implemented by the data layer. */
export interface HoldSource {
  holds(wallId: string): Hold[];
  piece(hold: Hold): Promise<BufferGeometry>;
  ghost(wallId: string): Promise<Float32Array | null>;
  /** The full scan, drawn dimmed behind holds. Null when the wall has no scan. */
  scan(wallId: string): Promise<LoadedScan | null>;
}

export type SceneSpec =
  /** A whole wall with its tagged holds. Taps pick holds. */
  | { kind: 'wall'; wallId: string; markers: MarkerMap; holdIds?: string[] }
  /** One route: its holds ringed on the real wall. */
  | { kind: 'route'; wallId: string; holds: HoldMap }
  /** The full scan, for tagging. Taps hit the scan surface. */
  | { kind: 'scan'; wallId: string; scan: LoadedScan; markers: MarkerMap };

export interface ViewerEvents {
  holdTap?: (id: string) => void;
  scanTap?: (point: Vector3, faceNormal: Vector3) => void;
  status?: (text: string) => void;
  legend?: (roles: MarkerRole[]) => void;
  hint?: (text: string) => void;
}

export interface ViewState {
  pos: Vector3;
  target: Vector3;
}

export interface Theme {
  css: (name: string) => string;
}

const ZAX = new Vector3(0, 0, 1);
/** A finger is ~40 px wide. Taps within this distance of a hold pick it. */
export const TAP_PX = 28;
/** Below this many pixels for 10 cm, holds are too small to tap: zoom in first. */
const MIN_PX_PER_10CM = 22;

const ROLE_TOKEN: Record<MarkerRole, string> = {
  start: '--start',
  hand: '--hand',
  top: '--top',
  foot: '--foot',
  off: '--off',
  tag: '--accent',
  marker: '--top',
};
const LEGEND_ORDER: MarkerRole[] = ['start', 'hand', 'top', 'foot', 'off', 'tag', 'marker'];

export class WallViewer {
  readonly renderer: WebGLRenderer;
  readonly camera = new PerspectiveCamera(45, 1, 0.05, 200);
  readonly controls: OrbitControls;
  private scene = new Scene();
  private markerGroup = new Group();
  private previewGroup: Group | null = null;
  private pickables: Object3D[] = [];
  private pickMode: 'none' | 'hold' | 'scan' = 'none';
  private wallId: string | null = null;
  private lastFit: { box: Box3; side: number } | null = null;
  private bottomPad = 0;
  private token = 0;
  private pieceMat = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.78,
    metalness: 0,
    side: DoubleSide,
  });
  private pieces = new Map<string, Mesh>();
  private practice = new Map<string, Mesh>();
  private ghosts = new Map<string, Promise<GridWall | null>>();
  private backdrops = new Map<string, Promise<Backdrop | null>>();
  private ray = new Raycaster();
  private resizeObs: ResizeObserver;
  private down: { x: number; y: number; t: number } | null = null;
  /** Staff screens: the first tap on a far-away wall zooms in instead of picking. */
  zoomFirst = false;
  events: ViewerEvents = {};

  constructor(
    private container: HTMLElement,
    private source: HoldSource,
    private theme: Theme,
  ) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.addEventListener('change', () => this.render());
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointerup', this.onUp);
    this.resize();
    if (import.meta.env.VITE_E2E) (window as unknown as { __viewer: WallViewer }).__viewer = this;
  }

  dispose() {
    this.token++;
    this.resizeObs.disconnect();
    this.renderer.domElement.removeEventListener('pointerdown', this.onDown);
    this.renderer.domElement.removeEventListener('pointerup', this.onUp);
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /* ---------------- Size, framing and view ---------------- */

  private size() {
    return { w: this.container.clientWidth || 1, h: this.container.clientHeight || 1 };
  }

  resize() {
    const { w, h } = this.size();
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.applyViewOffset();
    this.render();
  }

  /** Keep the picture clear of the control bar at the bottom of the stage. */
  setBottomPad(px: number) {
    if (Math.abs(px - this.bottomPad) < 1) return;
    this.bottomPad = px;
    this.applyViewOffset();
    this.render();
  }

  private applyViewOffset() {
    const { w, h } = this.size();
    if (this.bottomPad) this.camera.setViewOffset(w, h, 0, this.bottomPad / 2, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  private fit(box: Box3, side: number) {
    this.lastFit = { box: box.clone(), side };
    const c = box.getCenter(new Vector3()),
      s = box.getSize(new Vector3());
    const t = Math.tan((this.camera.fov * Math.PI) / 360);
    const { h } = this.size();
    const avail = Math.max(0.45, (h - this.bottomPad) / h);
    const dist = Math.max(s.y / 2 / (t * avail), s.x / 2 / (t * this.camera.aspect)) * 1.15 + s.z / 2 + 0.3;
    const dir = new Vector3(side, 0.1, 1).normalize();
    this.camera.position.copy(c).addScaledVector(dir, dist);
    this.camera.near = Math.max(0.01, dist / 300);
    this.camera.far = dist * 40;
    this.applyViewOffset();
    this.controls.target.copy(c);
    this.controls.update();
  }

  resetView() {
    if (this.lastFit) this.fit(this.lastFit.box, this.lastFit.side);
    this.render();
  }

  saveView(): ViewState {
    return { pos: this.camera.position.clone(), target: this.controls.target.clone() };
  }

  restoreView(v: ViewState | null | undefined) {
    if (!v) return;
    this.camera.position.copy(v.pos);
    this.controls.target.copy(v.target);
    this.controls.update();
    this.render();
  }

  /** Metres covered by `px` screen pixels at point p. */
  pxToWorld(p: Vector3, px: number) {
    const d = this.camera.position.distanceTo(p);
    return ((2 * d * Math.tan((this.camera.fov * Math.PI) / 360)) / this.size().h) * px;
  }

  tooSmall(p: Vector3) {
    return 0.1 / this.pxToWorld(p, 1) < MIN_PX_PER_10CM;
  }

  /** Centre on p and zoom so about `span` metres fit on screen. */
  zoomTo(p: Vector3, span: number) {
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const t = Math.tan((this.camera.fov * Math.PI) / 360);
    const { h } = this.size();
    const avail = Math.max(0.45, (h - this.bottomPad) / h);
    const dist = Math.max(span / 2 / (t * this.camera.aspect), span / 2 / (t * avail));
    this.controls.target.copy(p);
    this.camera.position.copy(p).addScaledVector(dir, dist);
    this.controls.update();
    this.render();
  }

  /** Zoom in on something small so it can be checked. Returns the view to go back to, or null. */
  focusOn(c: Vector3, r: number): ViewState | null {
    if ((2 * r) / this.pxToWorld(c, 1) >= 90) return null;
    const prev = this.saveView();
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const want = Math.max(0.6, (2 * r) / (0.3 * 2 * Math.tan((this.camera.fov * Math.PI) / 360)));
    const d = Math.min(want, this.camera.position.distanceTo(c));
    this.controls.target.copy(c);
    this.camera.position.copy(c).addScaledVector(dir, d);
    this.controls.update();
    this.render();
    return prev;
  }

  /** Unit vector from p towards the camera. */
  viewDirAt(p: Vector3) {
    return this.camera.position.clone().sub(p).normalize();
  }

  /** Screen position (CSS px, relative to the page) of a world point. Used by tests. */
  project(p: [number, number, number]): [number, number] {
    this.camera.updateMatrixWorld();
    const v = new Vector3(...p).project(this.camera);
    const rc = this.renderer.domElement.getBoundingClientRect();
    return [((v.x + 1) / 2) * rc.width + rc.left, ((1 - v.y) / 2) * rc.height + rc.top];
  }

  /** Move the view sideways so p is in the middle. Used by tests to stand in for a two-finger pan. */
  panTo(p: [number, number, number]) {
    const d = new Vector3(...p).sub(this.controls.target);
    this.controls.target.add(d);
    this.camera.position.add(d);
    this.controls.update();
    this.render();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /* ---------------- Scenes ---------------- */

  private newScene() {
    this.scene = new Scene();
    this.scene.add(new HemisphereLight(0xffffff, 0x8a8f8d, 2.9));
    const sun = new DirectionalLight(0xffffff, 1.8);
    sun.position.set(2.5, 6, 7);
    this.scene.add(sun);
    this.markerGroup = new Group();
    this.scene.add(this.markerGroup);
    this.previewGroup = null;
    this.pickables = [];
  }

  private colour(token: string) {
    return this.theme.css(token) || '#888888';
  }

  private holdsOf(wallId: string): Hold[] {
    return wallId === PRACTICE_WALL_ID ? PRACTICE_HOLDS : this.source.holds(wallId);
  }

  private holdMesh(wallId: string, id: string): Mesh | null {
    if (wallId === PRACTICE_WALL_ID) {
      let m = this.practice.get(id);
      if (!m) {
        const h = PRACTICE_HOLDS.find((x) => x.id === id);
        if (!h) return null;
        this.practice.set(id, (m = buildPracticeHold(h)));
      }
      return m;
    }
    return this.pieces.get(id) ?? null;
  }

  private async loadPieces(wallId: string, ids: string[]) {
    if (wallId === PRACTICE_WALL_ID) return;
    const holds = this.holdsOf(wallId);
    await Promise.all(
      ids
        .filter((id) => !this.pieces.has(id))
        .map(async (id) => {
          const h = holds.find((x) => x.id === id);
          if (!h?.piecePath) return;
          const geom = await this.source.piece(h);
          if (!this.pieces.has(id)) this.addPiece(id, geom);
        }),
    );
  }

  /** Register a freshly cut hold so it shows without downloading it again. */
  addPiece(id: string, geom: BufferGeometry) {
    const m = new Mesh(geom, this.pieceMat);
    m.userData.holdId = id;
    this.pieces.set(id, m);
  }

  forgetPiece(id: string) {
    this.pieces.delete(id);
  }

  /** A grid surface of the wall, fitted to its small outline file (the real scan is much bigger). */
  private ghost(wallId: string): Promise<GridWall | null> {
    let p = this.ghosts.get(wallId);
    if (!p) {
      p = this.source.ghost(wallId).then((arr) => (arr ? gridFromPoints(arr) : null));
      p.catch(() => this.ghosts.delete(wallId));
      this.ghosts.set(wallId, p);
    }
    return p;
  }

  /** Grid lines over a very light fill, the same look as the demo wall's outline. */
  private gridObjects(grid: GridWall, fg: string, strength: number): Group {
    const g = new Group();
    g.add(
      new LineSegments(
        grid.lines,
        new LineBasicMaterial({
          color: fg,
          transparent: true,
          opacity: Math.min(1, 0.22 * strength),
          depthWrite: false,
        }),
      ),
    );
    const fill = new Mesh(
      grid.fill,
      new MeshBasicMaterial({
        color: fg,
        transparent: true,
        opacity: Math.min(1, 0.045 * strength),
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    fill.userData.noCount = true;
    g.add(fill);
    return g;
  }

  /** The real scan, with its own copies of the materials so dimming never touches the tagger's scan. */
  private backdrop(wallId: string): Promise<Backdrop | null> {
    let p = this.backdrops.get(wallId);
    if (!p) {
      p = this.source.scan(wallId).then((scan) => {
        if (!scan) return null;
        const group = new Group();
        for (const m of scan.meshes) {
          const src = (Array.isArray(m.material) ? m.material[0] : m.material) as MeshStandardMaterial;
          const mat = src.clone();
          // Holds are cut from this same surface: push the wall back a little so they draw on top.
          mat.polygonOffset = true;
          mat.polygonOffsetFactor = 2;
          mat.polygonOffsetUnits = 2;
          const mesh = new Mesh(m.geometry, mat);
          mesh.userData.noCount = true;
          group.add(mesh);
        }
        return { group };
      });
      p.catch(() => this.backdrops.delete(wallId));
      this.backdrops.set(wallId, p);
    }
    return p;
  }

  /** Call when a wall's scan or outline changes (for example after turning the scan). */
  forgetGhost(wallId: string) {
    this.ghosts.delete(wallId);
    this.backdrops.delete(wallId);
  }

  /**
   * Show a scene. Resolves false if a newer call replaced it or loading failed.
   * Loading errors are thrown so the page can show a message.
   */
  async show(spec: SceneSpec): Promise<boolean> {
    const tok = ++this.token;
    this.zoomFirst = false;
    if (spec.kind === 'scan') {
      this.newScene();
      this.wallId = spec.wallId;
      for (const m of spec.scan.meshes) this.scene.add(m);
      this.pickables = spec.scan.meshes.slice();
      this.pickMode = 'scan';
      this.fit(spec.scan.box, 0.2);
      this.setMarkers(spec.markers);
      this.status(
        `Full scan · ${spec.scan.tris.toLocaleString('en-US')} triangles · ${this.holdsOf(spec.wallId).length} tagged`,
      );
      return true;
    }
    const wallId = spec.wallId;
    const routeHolds = spec.kind === 'route' ? withMarkers(this.holdsOf(wallId), spec.holds) : null;
    const ids = routeHolds
      ? Object.keys(routeHolds)
      : ((spec.kind === 'wall' ? spec.holdIds : undefined) ?? this.holdsOf(wallId).map((h) => h.id));
    // Real walls: a light grid shows at once (small file); the real scan replaces it once downloaded.
    let grid: GridWall | null = null;
    if (wallId !== PRACTICE_WALL_ID) {
      this.status('Loading holds…');
      const [g] = await Promise.all([this.ghost(wallId).catch(() => null), this.loadPieces(wallId, ids)]);
      grid = g;
      if (tok !== this.token) return false;
    }
    this.newScene();
    this.wallId = wallId;
    const fg = this.colour('--fg');
    // Dark themes need a stronger wall outline and a rim around route holds to stay readable.
    const outline = parseFloat(this.theme.css('--outline-strength')) || 1;
    const haloOpacity = parseFloat(this.theme.css('--halo-opacity')) || 0;
    const haloMat = new MeshBasicMaterial({
      color: this.colour('--halo'),
      side: BackSide,
      transparent: true,
      opacity: haloOpacity,
      depthWrite: false,
    });
    const box = new Box3();
    let gridGroup: Group | null = null;
    if (wallId === PRACTICE_WALL_ID) {
      // The demo wall is always shown as it is, like a scanned wall.
      for (const o of practiceWallObjects({
        wall: this.colour('--wall'),
        tnut: this.colour('--tnut'),
        mat: this.colour('--mat'),
        fg,
      }))
        this.scene.add(o);
      if (spec.kind === 'wall') box.set(PRACTICE_BOX.min.clone(), PRACTICE_BOX.max.clone());
    } else if (grid) {
      gridGroup = this.gridObjects(grid, fg, outline);
      this.scene.add(gridGroup);
      if (spec.kind === 'wall') box.copy(grid.box);
    }
    const offMat = new MeshStandardMaterial({
      color: this.colour('--off'),
      transparent: true,
      opacity: 0.42,
      roughness: 0.8,
      flatShading: true,
    });
    const routeBox = new Box3();
    let shown = 0;
    // Hold copies that the real wall replaces once it loads (the scan has the same holds in true colour).
    const copies: Object3D[] = [];
    for (const id of ids) {
      let m: Object3D | null = this.holdMesh(wallId, id);
      if (!m) continue;
      m.visible = true; // copies are shared between scenes; an earlier scene may have hidden this one
      if (routeHolds?.[id] !== 'off') copies.push(m);
      if (routeHolds?.[id] === 'off') {
        m = m.clone();
        m.traverse((o) => {
          if ((o as Mesh).isMesh) (o as Mesh).material = offMat as Material;
        });
      }
      this.scene.add(m);
      this.pickables.push(m);
      routeBox.expandByObject(m);
      if (routeHolds && routeHolds[id] !== 'off' && haloOpacity > 0) this.scene.add(halo(m, haloMat));
      shown++;
    }
    this.pickMode = 'hold';
    if (spec.kind === 'route') {
      if (routeBox.isEmpty()) routeBox.set(new Vector3(-1, 0, 0), new Vector3(1, 2, 0.5));
      const s = routeBox.getSize(new Vector3());
      routeBox
        .expandByVector(new Vector3(Math.max(0, (1.8 - s.x) / 2), Math.max(0, (1.8 - s.y) / 2), 0))
        .expandByScalar(0.15);
      this.fit(routeBox, 0.42);
      this.setMarkers(spec.holds, true);
      this.status(
        `${shown} of ${this.holdsOf(wallId).length} holds loaded · ${this.countTris().toLocaleString('en-US')} triangles${wallId === PRACTICE_WALL_ID ? '' : ' · loading wall…'}`,
      );
    } else {
      if (box.isEmpty())
        box.copy(routeBox.isEmpty() ? new Box3(new Vector3(-2, 0, -0.5), new Vector3(2, 3.5, 1)) : routeBox);
      this.fit(box, 0.25);
      this.setMarkers(spec.markers);
      this.status(`${shown} holds · ${this.countTris().toLocaleString('en-US')} triangles`);
    }
    this.render();
    // The real wall can be tens of MB, so the route shows first and the wall fades in behind it.
    if (wallId !== PRACTICE_WALL_ID) void this.showBackdrop(wallId, tok, spec.kind, gridGroup, copies, shown);
    return true;
  }

  private async showBackdrop(
    wallId: string,
    tok: number,
    kind: 'wall' | 'route',
    grid: Group | null,
    copies: Object3D[],
    shown: number,
  ) {
    // If the scan can't be loaded, the grid and the hold copies stay.
    const b = await this.backdrop(wallId).catch(() => null);
    if (tok !== this.token) return;
    if (!b) {
      if (kind === 'route') this.status(`${shown} holds · wall grid`);
      return;
    }
    // Show the wall as it is: no dimming, and the scan's own holds instead of the copies cut from it
    // (their colours are a little off). The copies stay as invisible tap targets; rings mark the route.
    if (grid) this.scene.remove(grid);
    for (const m of copies) m.visible = false;
    this.scene.add(b.group);
    if (kind === 'route') this.status(`${shown} holds · full wall`);
    this.render();
  }

  private countTris() {
    let t = 0;
    this.scene.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh && !m.userData.noCount) {
        const g = m.geometry;
        t += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
      }
    });
    return Math.round(t);
  }

  private status(text: string) {
    this.events.status?.(text);
  }

  /* ---------------- Markers ---------------- */

  private frame(id: string): { p: Vector3; n: Vector3; r: number; kind: Hold['kind'] } | null {
    if (!this.wallId) return null;
    const h = this.holdsOf(this.wallId).find((x) => x.id === id);
    return h ? { p: new Vector3(...h.c), n: new Vector3(...h.n), r: h.r, kind: h.kind } : null;
  }

  private label(text: string, colour: string, dark: boolean) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 96;
    const x = c.getContext('2d')!;
    x.fillStyle = colour;
    x.beginPath();
    x.roundRect(4, 4, 248, 88, 44);
    x.fill();
    x.fillStyle = dark ? '#1A1300' : '#FFFFFF';
    x.font = '700 50px system-ui, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(text, 128, 52);
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    const s = new Sprite(new SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.scale.set(0.34, 0.1275, 1);
    s.renderOrder = 10;
    return s;
  }

  setMarkers(map: MarkerMap, hideHand = false) {
    this.scene.remove(this.markerGroup);
    this.markerGroup = new Group();
    this.scene.add(this.markerGroup);
    const roles = new Set<MarkerRole>();
    const practice = this.wallId === PRACTICE_WALL_ID;
    for (const [id, role] of Object.entries(map)) {
      if (hideHand && role === 'hand') continue;
      const f = this.frame(id);
      if (!f) continue;
      roles.add(role);
      const rad = !practice ? f.r * 1.1 : f.kind === 'volume' ? f.r * 1.05 : f.r * 1.45;
      const col = this.colour(ROLE_TOKEN[role]);
      const mat = new MeshBasicMaterial({ color: col });
      const tube = Math.max(0.008, rad * 0.075);
      const g = new Group();
      const torus = new TorusGeometry(rad, tube, 8, 40);
      g.add(new Mesh(torus, mat));
      if (role === 'top') {
        const outer = new Mesh(torus, mat);
        outer.scale.setScalar(1.22);
        g.add(outer);
      }
      if (role === 'off') {
        const bar = new BoxGeometry(rad * 2, tube * 2.2, tube * 2.2);
        const a = new Mesh(bar, mat),
          b = new Mesh(bar, mat);
        a.rotation.z = Math.PI / 4;
        b.rotation.z = -Math.PI / 4;
        a.position.z = b.position.z = rad * 0.7;
        g.add(a, b);
      }
      g.position.copy(f.p).addScaledVector(f.n, f.kind === 'volume' && practice ? 0.02 : f.r * 0.3);
      g.quaternion.setFromUnitVectors(ZAX, f.n);
      g.traverse((o) => (o.userData.noCount = true));
      this.markerGroup.add(g);
      if (role === 'start' || role === 'top') {
        const s = this.label(role === 'start' ? 'START' : 'TOP', col, role === 'top');
        s.position.copy(g.position).add(new Vector3(0, rad + 0.12, 0));
        this.markerGroup.add(s);
      }
    }
    this.events.legend?.(LEGEND_ORDER.filter((r) => roles.has(r)));
    this.render();
  }

  /* ---------------- Tag preview ---------------- */

  setPreview(p: { geom: BufferGeometry | null; c: Vector3; r: number; n: Vector3 } | null) {
    if (this.previewGroup) this.scene.remove(this.previewGroup);
    this.previewGroup = null;
    if (p) {
      const acc = this.colour('--accent');
      const g = new Group();
      if (p.geom)
        g.add(
          new Mesh(
            p.geom,
            new MeshBasicMaterial({
              color: acc,
              transparent: true,
              opacity: 0.55,
              side: DoubleSide,
              polygonOffset: true,
              polygonOffsetFactor: -2,
              polygonOffsetUnits: -2,
            }),
          ),
        );
      const ring = new Mesh(
        new TorusGeometry(p.r, Math.max(0.005, p.r * 0.045), 8, 56),
        new MeshBasicMaterial({ color: acc }),
      );
      ring.position.copy(p.c).addScaledVector(p.n, 0.01);
      ring.quaternion.setFromUnitVectors(ZAX, p.n);
      g.add(ring);
      g.traverse((o) => (o.userData.noCount = true));
      this.scene.add(g);
      this.previewGroup = g;
    }
    this.render();
  }

  /* ---------------- Taps ---------------- */

  private onDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
  };

  private onUp = (e: PointerEvent) => {
    const d = this.down;
    this.down = null;
    if (!d) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 7 && performance.now() - d.t < 650)
      this.tap(e.clientX, e.clientY);
  };

  private nearestHold(x: number, y: number, maxPx: number): string | null {
    const rc = this.renderer.domElement.getBoundingClientRect();
    let best: string | null = null,
      bestD = maxPx;
    const v = new Vector3();
    for (const o of this.pickables) {
      const id = o.userData.holdId as string | undefined;
      if (!id) continue;
      const f = this.frame(id);
      if (!f) continue;
      v.copy(f.p).project(this.camera);
      if (v.z > 1) continue;
      const d = Math.hypot(
        ((v.x + 1) / 2) * rc.width + rc.left - x,
        ((1 - v.y) / 2) * rc.height + rc.top - y,
      );
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  private tap(x: number, y: number) {
    if (!this.pickables.length) return;
    this.camera.updateMatrixWorld();
    const rc = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(
      new Vector2(((x - rc.left) / rc.width) * 2 - 1, -((y - rc.top) / rc.height) * 2 + 1),
      this.camera,
    );
    const hits: Intersection[] = this.ray.intersectObjects(this.pickables, true);
    if (this.pickMode === 'scan') {
      const hit = hits[0];
      if (!hit) return;
      if (this.tooSmall(hit.point)) {
        this.zoomTo(hit.point, 1.2);
        this.events.hint?.('Zoomed in. Now tap a hold.');
        return;
      }
      const n = hit.face ? hit.face.normal.clone() : new Vector3(0, 0, 1);
      if (n.dot(this.viewDirAt(hit.point)) < 0) n.negate();
      this.events.scanTap?.(hit.point.clone(), n);
      return;
    }
    let id: string | null = null;
    if (hits[0]) {
      let o: Object3D | null = hits[0].object;
      while (o && o.userData.holdId == null) o = o.parent;
      if (o) id = o.userData.holdId as string;
    }
    if (this.zoomFirst) {
      const nearId = id ?? this.nearestHold(x, y, TAP_PX * 2);
      const pt = hits[0]?.point ?? (nearId ? this.frame(nearId)?.p : undefined);
      if (pt && this.tooSmall(pt)) {
        this.zoomTo(pt, 1.2);
        this.events.hint?.('Zoomed in. Now tap the holds.');
        return;
      }
    }
    id ??= this.nearestHold(x, y, TAP_PX);
    if (id) this.events.holdTap?.(id);
  }
}

/**
 * A slightly larger copy of a hold, drawn from the inside only, so it shows as a rim around the hold.
 * Keeps dark holds visible on a dark stage (and pale holds on a pale one).
 */
function halo(hold: Object3D, mat: Material): Object3D {
  hold.updateMatrixWorld();
  const box = new Box3().setFromObject(hold);
  const c = box.getCenter(new Vector3());
  const r = box.getSize(new Vector3()).length() / 2 || 0.05;
  // About a 1.2 cm rim whatever the hold size, within sensible limits.
  const k = Math.min(1.5, Math.max(1.06, 1 + 0.012 / r));
  const h = hold.clone();
  h.traverse((o) => {
    if ((o as Mesh).isMesh) (o as Mesh).material = mat;
    o.userData = { noCount: true };
  });
  h.matrixAutoUpdate = false;
  h.matrix
    .makeTranslation(c.x, c.y, c.z)
    .multiply(new Matrix4().makeScale(k, k, k))
    .multiply(new Matrix4().makeTranslation(-c.x, -c.y, -c.z))
    .multiply(hold.matrixWorld);
  return h;
}

/** The real scan drawn behind the route's rings. */
interface Backdrop {
  group: Group;
}
