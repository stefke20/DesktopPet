// 3D toon props for random events, drawn in the same style as the pets:
// flat colours, bold dark outline, simple cel shading.
import * as THREE from 'three';

function toonGradient() {
  const d = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

/** A small transparent WebGL canvas that we move around the overlay. */
class MiniView {
  constructor(z) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = `position:fixed;left:0;top:0;pointer-events:none;display:none;z-index:${z};will-change:transform`;
    document.body.appendChild(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, premultipliedAlpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, -5, 5);
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-0.5, 0.7, 0.6);
    this.scene.add(key, new THREE.HemisphereLight(0xffffff, 0xc8b8c8, 1.4));
    this.px = 0;
  }

  /** Size of the square canvas in CSS px. */
  setPx(px) {
    px = Math.max(48, Math.round(px));
    if (px === this.px) return;
    this.px = px;
    this.renderer.setSize(px, px, false);
    this.canvas.style.width = px + 'px';
    this.canvas.style.height = px + 'px';
  }

  place(x, y) { this.canvas.style.transform = `translate3d(${Math.round(x - this.px / 2)}px, ${Math.round(y - this.px / 2)}px, 0)`; }
  show(v) { this.canvas.style.display = v ? 'block' : 'none'; }
  render() { this.renderer.render(this.scene, this.camera); }
}

function outlineOf(geometry, color, grow) {
  const m = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
  m.scale.set(grow, grow, 1);
  m.position.z = -0.004;
  return m;
}

// --------------------------------------------------------------------------- butterfly
function forewing() {
  const s = new THREE.Shape();
  s.moveTo(0.004, 0.0);
  s.bezierCurveTo(0.01, 0.08, 0.07, 0.17, 0.15, 0.15);
  s.bezierCurveTo(0.19, 0.12, 0.17, 0.05, 0.12, 0.0);
  s.bezierCurveTo(0.08, -0.02, 0.03, -0.01, 0.004, 0.0);
  return s;
}
function hindwing() {
  const s = new THREE.Shape();
  s.moveTo(0.004, 0.0);
  s.bezierCurveTo(0.05, 0.0, 0.12, -0.01, 0.13, -0.06);
  s.bezierCurveTo(0.13, -0.12, 0.06, -0.15, 0.02, -0.1);
  s.bezierCurveTo(0.0, -0.07, 0.0, -0.03, 0.004, 0.0);
  return s;
}

export class ButterflyView extends MiniView {
  constructor() {
    super(30);
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.wings = [];
    this.built = null;
  }

  /** (Re)build the meshes for a palette. */
  build(pal) {
    if (this.built === pal) return;
    this.built = pal;
    this.group.clear();
    this.wings = [];
    const fillA = new THREE.MeshBasicMaterial({ color: pal.wing, side: THREE.DoubleSide });
    const fillB = new THREE.MeshBasicMaterial({ color: pal.wing2, side: THREE.DoubleSide });
    const spotM = new THREE.MeshBasicMaterial({ color: pal.spot, side: THREE.DoubleSide });
    const edge = new THREE.MeshBasicMaterial({ color: pal.edge });
    for (const side of [1, -1]) {
      const pivot = new THREE.Group();
      for (const [shape, inner] of [[forewing(), 0.6], [hindwing(), 0.55]]) {
        const geo = new THREE.ShapeGeometry(shape, 24);
        const w = new THREE.Group();
        const out = outlineOf(geo, pal.edge, 1.13); out.position.set(-0.004, 0, -0.004);
        const base = new THREE.Mesh(geo, fillA);
        const patch = new THREE.Mesh(geo, fillB); patch.scale.set(inner, inner, 1); patch.position.set(0.012, shape === null ? 0 : 0.0, 0.002);
        w.add(out, base, patch);
        // spots along the rim
        for (const [sx, sy, r] of (inner > 0.58 ? [[0.14, 0.12, 0.012], [0.16, 0.085, 0.009], [0.115, 0.14, 0.008]] : [[0.1, -0.1, 0.011], [0.12, -0.07, 0.008]])) {
          const spot = new THREE.Mesh(new THREE.CircleGeometry(r, 14), spotM); spot.position.set(sx, sy, 0.004); w.add(spot);
        }
        pivot.add(w);
      }
      pivot.scale.x = side;
      const flap = new THREE.Group();
      flap.add(pivot);
      this.group.add(flap);
      this.wings.push({ flap, side });
    }
    // body, head, antennae (drawn in front of the wings)
    const bodyGeo = new THREE.CapsuleGeometry(0.013, 0.09, 6, 12);
    const body = new THREE.Mesh(bodyGeo, edge); body.position.set(0, -0.005, 0.01);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.017, 14, 10), edge); head.position.set(0, 0.058, 0.012);
    this.group.add(body, head);
    for (const s of [1, -1]) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(s * 0.006, 0.07, 0.012), new THREE.Vector3(s * 0.025, 0.11, 0.012), new THREE.Vector3(s * 0.05, 0.13, 0.012)]);
      this.group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.0027, 5), edge));
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 8, 6), edge); tip.position.set(s * 0.052, 0.131, 0.012); this.group.add(tip);
    }
  }

  /** bf: Butterfly sim entity; U: px per pet unit. Full wingspan ~ 0.2 U, about as wide as the pet's head. */
  update(bf, U) {
    this.build(bf.palette);
    const ppu = 0.48 * U;                    // px per butterfly-model unit (model wingspan ~0.42)
    this.setPx(Math.max(0.3 * U, 40));
    const half = this.px / ppu / 2;
    this.camera.left = -half; this.camera.right = half; this.camera.top = half; this.camera.bottom = -half;
    this.camera.updateProjectionMatrix();
    const flap = 0.08 + 0.8 * (0.5 + 0.5 * Math.sin(bf.phase));
    for (const w of this.wings) w.flap.rotation.y = -w.side * flap;
    this.group.rotation.set(0.25 + 0.08 * Math.sin(bf.phase * 0.5), 0, bf.heading - Math.PI / 2 + 0.1 * Math.sin(bf.t * 3));
    this.place(bf.x, bf.y);
    this.show(true);
    this.render();
  }
}

// --------------------------------------------------------------------------- yarn ball
function yarnTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ff6b8e'; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#ff9db4'; g.lineWidth = 7; g.lineCap = 'round';
  for (let i = -4; i < 16; i++) { g.beginPath(); g.moveTo(i * 20, 130); g.bezierCurveTo(i * 20 + 30, 80, i * 20 + 10, 40, i * 20 + 50, -5); g.stroke(); }
  g.strokeStyle = '#d94670'; g.lineWidth = 4;
  for (let i = -4; i < 16; i++) { g.beginPath(); g.moveTo(i * 20 + 12, 130); g.bezierCurveTo(i * 20 + 42, 80, i * 20 + 22, 40, i * 20 + 62, -5); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function tennisTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#d7f03c'; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#fbfff0'; g.lineWidth = 9; g.lineCap = 'round';
  for (const x0 of [64, 192]) { g.beginPath(); g.moveTo(x0 - 26, -4); g.bezierCurveTo(x0 + 18, 34, x0 + 18, 94, x0 - 26, 132); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A rolling toy: ball of yarn (cats) or tennis ball (dogs). Sized from the physics body (head-sized). */
export class ToyView extends MiniView {
  constructor(kind) {
    super(2);
    this.kind = kind;
    const geo = new THREE.SphereGeometry(0.34, 32, 24);
    this.ball = new THREE.Group();
    const tex = kind === 'ball' ? tennisTexture() : yarnTexture();
    const mesh = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ map: tex, gradientMap: toonGradient() }));
    const out = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: kind === 'ball' ? '#3a4a10' : '#4a1a2c', side: THREE.BackSide }));
    out.scale.setScalar(1.07);
    this.ball.add(mesh, out);
    if (kind !== 'ball') {   // loose end of thread, curling away
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.32, 0.1, 0.1), new THREE.Vector3(0.44, 0.0, 0.14), new THREE.Vector3(0.5, -0.12, 0.1), new THREE.Vector3(0.44, -0.2, 0.06)]);
      this.ball.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.022, 6), new THREE.MeshToonMaterial({ color: '#ff6b8e', gradientMap: toonGradient() })));
      this.ball.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.034, 6), new THREE.MeshBasicMaterial({ color: '#4a1a2c', side: THREE.BackSide })));
    }
    this.scene.add(this.ball);
  }

  /** body: physics circle {x,y,r,ang}. */
  update(body) {
    this.setPx(body.r * 3.1);
    this.camera.left = -0.5; this.camera.right = 0.5; this.camera.top = 0.5; this.camera.bottom = -0.5;
    this.camera.updateProjectionMatrix();
    // a 1-unit-wide canvas is body.r*3.1 px; the model ball has radius 0.34 units -> scale to body.r px
    this.ball.scale.setScalar((body.r * 2) / (this.px * 0.68));
    this.ball.rotation.set(0.4, 0, -body.ang);
    this.place(body.x, body.y);
    this.show(true);
    this.render();
  }
}

// --------------------------------------------------------------------------- toy mouse
export class MouseView extends MiniView {
  constructor() {
    super(2);
    const fur = new THREE.MeshToonMaterial({ color: '#b7bac9', gradientMap: toonGradient() });
    const belly = new THREE.MeshToonMaterial({ color: '#e6e8f0', gradientMap: toonGradient() });
    const pink = new THREE.MeshBasicMaterial({ color: '#ff9fb3' });
    const dark = new THREE.MeshBasicMaterial({ color: '#2c2e3a' });
    const ol = new THREE.MeshBasicMaterial({ color: '#2c2e3a', side: THREE.BackSide });
    this.root = new THREE.Group();
    this.scene.add(this.root);
    const add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, outline = 1.12) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); this.root.add(m);
      if (outline) { const o = new THREE.Mesh(geo, ol); o.position.copy(m.position); o.scale.set(sx * outline, sy * outline, sz * outline); this.root.add(o); }
      return m;
    };
    const sph = new THREE.SphereGeometry(1, 20, 14);
    this.body = new THREE.Group(); this.root.add(this.body);
    const grp = this.body;
    const addTo = (g, geo, mat, x, y, z, sx, sy, sz, outline = 1.14) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); g.add(m);
      if (outline) { const o = new THREE.Mesh(geo, ol); o.position.copy(m.position); o.scale.set(sx * outline, sy * outline, sz * outline); g.add(o); }
    };
    addTo(grp, sph, fur, 0, 0.07, 0, 0.115, 0.07, 0.065);                // body
    addTo(grp, sph, belly, 0.0, 0.045, 0.012, 0.08, 0.04, 0.05, 0);     // belly patch
    addTo(grp, sph, fur, 0.12, 0.085, 0, 0.065, 0.055, 0.05);             // head
    addTo(grp, sph, pink, 0.178, 0.09, 0, 0.016, 0.014, 0.014, 1.2);      // nose
    addTo(grp, sph, dark, 0.15, 0.105, 0.04, 0.008, 0.01, 0.008, 0);      // eye
    for (const z of [0.035, -0.035]) {
      addTo(grp, sph, fur, 0.095, 0.14, z, 0.028, 0.034, 0.012);           // ear
      addTo(grp, sph, pink, 0.098, 0.14, z * 1.2, 0.017, 0.022, 0.006, 0);  // inner ear
    }
    // whiskers
    for (const [dy, dz] of [[0.012, 0.045], [-0.004, 0.05]]) for (const sz of [1, -1]) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.17, 0.09 + dy * 0.2, sz * 0.012), new THREE.Vector3(0.19, 0.095 + dy, sz * dz), new THREE.Vector3(0.2, 0.09 + dy * 0.5, sz * dz * 1.7)]);
      grp.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.0016, 4), dark));
    }
    // tail
    this.tailPts = [];
    this.tail = new THREE.Mesh(new THREE.BufferGeometry(), dark);
    this.root.add(this.tail);
    // legs
    this.legs = [];
    for (const [x, z] of [[0.07, 0.035], [0.07, -0.035], [-0.07, 0.035], [-0.07, -0.035]]) {
      const leg = new THREE.Group(); leg.position.set(x, 0.045, z);
      addTo(leg, sph, fur, 0, -0.03, 0, 0.026, 0.035, 0.022, 1.15);
      this.root.add(leg); this.legs.push(leg);
    }
    void add;
  }

  update(m, U) {
    const ppu = 0.62 * U;                         // model length ~0.33 -> ~0.2 U
    this.setPx(Math.max(0.55 * U, 56));
    const half = this.px / ppu / 2;
    this.camera.left = -half; this.camera.right = half; this.camera.top = half; this.camera.bottom = -half;
    this.camera.updateProjectionMatrix();
    this.root.scale.x = m.facing >= 0 ? 1 : -1;
    const moving = m.moving ? 1 : 0;
    const bob = moving * Math.abs(Math.sin(m.phase)) * 0.012;
    this.body.position.y = bob;
    this.body.rotation.z = (m.state === 'pause' ? 0.12 : -0.03) + (m.state === 'dart' ? -0.08 : 0);
    this.legs.forEach((l, i) => { l.rotation.z = moving * Math.sin(m.phase + (i % 2) * Math.PI + (i > 1 ? 1.5 : 0)) * 0.7; });
    // wavy tail
    const pts = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector3(-0.1 - t * 0.2, 0.07 + Math.sin(m.phase * 0.6 + t * 4) * 0.03 * t + t * 0.02, 0)); }
    this.tail.geometry.dispose();
    this.tail.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.0065, 5);
    // the model's feet are at scene y = -0.02, which must land on the floor line
    this.place(m.x, m.y - 0.02 * ppu);
    this.show(true);
    this.render();
  }
}

// --------------------------------------------------------------------------- bird
const BIRDS = {
  bluebird: { back: '#4aa3ff', belly: '#fff1d8', wing: '#2e72d6', beak: '#ffb02e', edge: '#13264a' },
  robin: { back: '#8a6a4a', belly: '#ff7a3c', wing: '#6b4f35', beak: '#ffc23a', edge: '#3a2214' },
  sparrow: { back: '#b98e5e', belly: '#f1e6cf', wing: '#8a6240', beak: '#f2a43a', edge: '#3a2a18' },
};

function wingShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.02, 0.1, 0.1, 0.19, 0.2, 0.17);
  s.bezierCurveTo(0.17, 0.1, 0.13, 0.04, 0.05, -0.01);
  s.lineTo(0, 0);
  return s;
}

export class BirdView extends MiniView {
  constructor() {
    super(30);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.built = null;
  }

  build(name) {
    if (this.built === name) return;
    this.built = name;
    this.root.clear();
    const pal = BIRDS[name] || BIRDS.bluebird;
    const mat = (c) => new THREE.MeshToonMaterial({ color: c, gradientMap: toonGradient() });
    const ol = new THREE.MeshBasicMaterial({ color: pal.edge, side: THREE.BackSide });
    const sph = new THREE.SphereGeometry(1, 20, 14);
    const part = (g, geo, color, x, y, z, sx, sy, sz, rz = 0, outline = 1.13) => {
      const m = new THREE.Mesh(geo, typeof color === 'string' ? mat(color) : color); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.z = rz; g.add(m);
      if (outline) { const o = new THREE.Mesh(geo, ol); o.position.copy(m.position); o.scale.set(sx * outline, sy * outline, sz * outline); o.rotation.z = rz; g.add(o); }
    };
    this.body = new THREE.Group(); this.root.add(this.body);
    part(this.body, sph, pal.back, 0, 0, 0, 0.13, 0.085, 0.075);                   // body
    part(this.body, sph, pal.belly, 0.02, -0.03, 0.012, 0.1, 0.055, 0.065, 0.15, 0);  // belly
    part(this.body, sph, pal.back, 0.115, 0.065, 0, 0.058, 0.055, 0.052);          // head
    const beak = new THREE.ConeGeometry(0.018, 0.05, 10);
    part(this.body, beak, pal.beak, 0.18, 0.062, 0, 1, 1, 1, -Math.PI / 2, 1.15);   // beak
    part(this.body, sph, '#15141c', 0.138, 0.078, 0.045, 0.011, 0.013, 0.01, 0, 0);  // eye
    part(this.body, sph, '#ffffff', 0.141, 0.083, 0.052, 0.004, 0.004, 0.004, 0, 0); // eye glint
    // tail
    const tailG = new THREE.BoxGeometry(0.13, 0.03, 0.05);
    part(this.body, tailG, pal.wing, -0.17, 0.0, 0, 1, 1, 1, 0.25, 1.15);
    // legs (only visible when perched)
    this.legs = new THREE.Group();
    for (const z of [0.02, -0.02]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.05, 6), new THREE.MeshBasicMaterial({ color: pal.beak }));
      leg.position.set(0.0, -0.1, z); this.legs.add(leg);
    }
    this.body.add(this.legs);
    // wings: near one in front, far one behind
    this.wings = [];
    for (const [z, shade] of [[0.045, pal.wing], [-0.045, pal.wing]]) {
      const w = new THREE.Group(); w.position.set(0.0, 0.03, z);
      const g = new THREE.ShapeGeometry(wingShape(), 16);
      part(w, g, shade, 0, 0, 0, 1, 1, 1, 0, 1.12);
      this.body.add(w); this.wings.push(w);
    }
  }

  update(bd, U) {
    this.build(bd.palette);
    const ppu = 0.9 * U;                       // model body ~0.27 -> ~0.24 U
    this.setPx(Math.max(0.75 * U, 64));
    const half = this.px / ppu / 2;
    this.camera.left = -half; this.camera.right = half; this.camera.top = half; this.camera.bottom = -half;
    this.camera.updateProjectionMatrix();
    this.root.scale.x = bd.facing >= 0 ? 1 : -1;
    const perched = bd.state === 'perched';
    // flap: wings swing up and down about the shoulder; folded when perched
    const a = perched ? -0.9 : Math.sin(bd.phase) * 1.0 + 0.2;
    this.wings.forEach((w, i) => { w.rotation.z = a * (i === 0 ? 1 : 0.9); w.position.z = i === 0 ? 0.045 : -0.045; });
    this.legs.visible = perched;
    this.body.rotation.z = perched ? 0.18 : bd.state === 'takeoff' ? 0.35 : Math.sin(bd.phase) * -0.05;
    this.body.position.y = perched ? 0.02 : 0;
    this.place(bd.x, bd.y - (perched ? 0 : 0));
    this.show(true);
    this.render();
  }
}
