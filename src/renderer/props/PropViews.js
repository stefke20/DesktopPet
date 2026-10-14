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

  /** bf: Butterfly sim entity; U: px per unit; this.px covers ~0.55 units. */
  update(bf, U) {
    this.build(bf.palette);
    this.setPx(0.62 * U);
    this.camera.left = -0.235; this.camera.right = 0.235; this.camera.top = 0.235; this.camera.bottom = -0.235;
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

export class YarnView extends MiniView {
  constructor() {
    super(2);
    const geo = new THREE.SphereGeometry(0.34, 32, 24);
    this.ball = new THREE.Group();
    const mesh = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ map: yarnTexture(), gradientMap: toonGradient() }));
    const out = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#4a1a2c', side: THREE.BackSide }));
    out.scale.setScalar(1.07);
    // loose end of thread, curling away
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.32, 0.1, 0.1), new THREE.Vector3(0.44, 0.0, 0.14), new THREE.Vector3(0.5, -0.12, 0.1), new THREE.Vector3(0.44, -0.2, 0.06)]);
    const thread = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.022, 6), new THREE.MeshToonMaterial({ color: '#ff6b8e', gradientMap: toonGradient() }));
    const threadOut = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.034, 6), new THREE.MeshBasicMaterial({ color: '#4a1a2c', side: THREE.BackSide }));
    this.ball.add(mesh, out, thread, threadOut);
    this.ball.rotation.x = 0.4;
    this.scene.add(this.ball);
    this.mesh = mesh;
  }

  /** body: physics circle {x,y,r,ang}. */
  update(body) {
    this.setPx(body.r * 3.1);
    const half = 0.5;   // scene units across half the canvas
    this.camera.left = -half; this.camera.right = half; this.camera.top = half; this.camera.bottom = -half;
    this.camera.updateProjectionMatrix();
    // scene ball radius 0.34 -> body.r px: canvas of body.r*3.1 px spans 1 unit
    const s = (body.r * 2) / (this.px * 0.68);
    this.ball.scale.setScalar(s);
    this.ball.rotation.set(0.4, 0, -body.ang);
    this.place(body.x, body.y);
    this.show(true);
    this.render();
  }
}
