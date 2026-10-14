// Three.js view of the cat: skinned cel-shaded body with outline, big glossy
// eyes, nose, mouth and whiskers.
import * as THREE from 'three';
import { BONES, FACE } from '../../shared/cat/rig-def.js';
import { unpackCat } from '../../shared/cat/generate.js';
import { toonVertex, toonFragment, outlineVertex, outlineFragment } from './toon-shader.js';

export const COATS = {
  ginger: { base: '#f2a04a', stripe: '#d4742a', white: '#fff4e2', pattern: 1, whiteAmount: 1, ear: '#ffb3a8', eye: ['#7bd66a', '#2f7a3a'], shadow: '#c9a0b8', outline: '#4a2210', nose: '#ff8f9e' },
  tabby: { base: '#a98562', stripe: '#4b3526', white: '#f5efe6', pattern: 1, whiteAmount: 1, ear: '#f2b6ac', eye: ['#d6d14a', '#6b7a14'], shadow: '#a893b5', outline: '#2c1b12', nose: '#f08c96' },
  grey: { base: '#9aa3b2', stripe: '#5a6373', white: '#f2f4f8', pattern: 1, whiteAmount: 1, ear: '#f4b8c0', eye: ['#ffd24a', '#b9822a'], shadow: '#9a8cc0', outline: '#272c38', nose: '#f59aa8' },
  black: { base: '#3a3744', stripe: '#2a2832', white: '#ffffff', pattern: 0, whiteAmount: 0, ear: '#7a5c68', eye: ['#ffd84a', '#c48a1a'], shadow: '#5a4f80', outline: '#0e0c12', nose: '#c07a8a' },
  tuxedo: { base: '#3a3744', stripe: '#2a2832', white: '#fffaf2', pattern: 0, whiteAmount: 1, ear: '#e7aab0', eye: ['#8fe07a', '#2f8a3a'], shadow: '#6a5f92', outline: '#0e0c12', nose: '#f59aa8' },
  cream: { base: '#f3dcb2', stripe: '#d9b27a', white: '#fffaf0', pattern: 0.7, whiteAmount: 1, ear: '#ffbdb2', eye: ['#7ec8ee', '#2a6aa0'], shadow: '#cfa8c0', outline: '#5a3a22', nose: '#ff9aa6' },
};

const eyeVertex = /* glsl */ `
varying vec3 vP; varying vec3 vNv; varying vec3 vView;
void main(){
  vP = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = -mv.xyz;
  vNv = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}`;

// Big toon eye: coloured iris, tall pupil, two white highlights, lid outline.
const eyeFragment = /* glsl */ `
precision highp float;
varying vec3 vP; varying vec3 vNv; varying vec3 vView;
uniform vec3 uIris; uniform vec3 uIris2; uniform vec3 uLid; uniform vec3 uOutline;
uniform float uBlink; uniform float uPupil; uniform float uR;
float e(float v, float w){ return smoothstep(-w, w, v); }
void main(){
  vec3 p = vP / uR;
  vec2 q = vec2(p.z, p.y);
  float front = p.x;
  // sclera is mostly hidden: iris fills the eye
  float r = length(q * vec2(0.95, 0.78));
  vec3 col = mix(uIris, uIris2, smoothstep(-0.7, 0.8, q.y * -1.0 + 0.0) * 0.9);   // darker at the top (lid shadow)
  col = mix(col, uIris * 1.1, smoothstep(0.1, 0.9, -q.y) * 0.5);
  // pupil: vertical oval that widens with uPupil
  float pw = mix(0.2, 0.55, uPupil);
  float pupil = 1.0 - e(length(vec2(q.x / pw, q.y / 0.78)) - 1.0, 0.06);
  col = mix(col, vec3(0.03, 0.02, 0.04), pupil);
  // limbal ring
  col = mix(col, uOutline, smoothstep(0.78, 1.0, r) * 0.7);
  // highlights (sit on the camera-facing side of the eye)
  float h1 = 1.0 - e(length((q - vec2(-0.3, 0.38)) * vec2(1.0, 1.0)) - 0.24, 0.05);
  float h2 = 1.0 - e(length((q - vec2(0.33, -0.34))) - 0.1, 0.05);
  col = mix(col, vec3(1.0), clamp(h1 + h2, 0.0, 1.0) * (1.0 - uBlink * 0.9));
  // eyelids
  float upper = mix(1.2, -1.1, uBlink) - 0.25 * q.x * q.x;
  float lower = mix(-1.3, -0.1, uBlink) + 0.1 * q.x * q.x;
  float cover = max(e(q.y - upper, 0.04), e(lower - q.y, 0.04));
  float line = max(1.0 - smoothstep(0.0, 0.1, abs(q.y - upper)), 1.0 - smoothstep(0.0, 0.1, abs(q.y - lower))) ;
  col = mix(col, uLid, clamp(cover, 0.0, 1.0));
  col = mix(col, uOutline, line * 0.9 * step(0.02, uBlink) + line * 0.0);
  // outer edge outline
  col = mix(col, uOutline, smoothstep(0.9, 1.0, length(q)) );
  col = mix(col, uOutline * 0.5, step(front, 0.0));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export class CatView {
  constructor(canvas, modelBuffer, opts = {}) {
    this.opts = { pxPerUnit: 480, size: 640, outline: 0.0055, ...opts };
    const { size } = this.opts;
    this.baseSize = size;
    this.sizeFactor = 1;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'default' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(opts.pixelRatio || window.devicePixelRatio || 1);
    this.renderer.setSize(size, size, false);
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    this.canvas = canvas;

    this.scene = new THREE.Scene();
    // Near-orthographic perspective: 1 cat unit == pxPerUnit px at z = 0.
    const H = size / this.opts.pxPerUnit;
    const fov = 12;
    const dist = H / 2 / Math.tan((fov * Math.PI) / 360);
    this.camera = new THREE.PerspectiveCamera(fov, 1, dist * 0.5, dist * 2);
    this.camera.position.set(0, 0, dist);
    this.scene.add(this.camera);
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-0.5, 0.7, 0.6);
    this.scene.add(key);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xc8b8c8, 1.4));

    // `orient` carries the cat's placement/orientation; `rig` holds the skeleton.
    this.orient = new THREE.Group();
    this.scene.add(this.orient);
    this.rig = new THREE.Group();
    this.orient.add(this.rig);

    this.bones = {};
    this._buildSkeleton();
    this._buildBody(unpackCat(modelBuffer));
    this._buildFace();
    this._buildShadow();
    this.setCoat('ginger');
    this.mud = 0;
    this.time = 0;
  }

  _buildSkeleton() {
    const list = [];
    for (const def of BONES) {
      const b = new THREE.Bone();
      b.name = def.name;
      this.bones[def.name] = b;
      list.push(b);
    }
    for (const def of BONES) {
      const b = this.bones[def.name];
      if (def.parent) {
        const pp = BONES.find((x) => x.name === def.parent).pos;
        b.position.set(def.pos[0] - pp[0], def.pos[1] - pp[1], def.pos[2] - pp[2]);
        this.bones[def.parent].add(b);
      } else {
        b.position.set(...def.pos);
      }
    }
    this.boneList = list;
  }

  _buildBody(m) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(m.skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(m.skinWeight, 4));
    geo.setIndex(new THREE.BufferAttribute(m.indices, 1));

    this.uniforms = {
      uBase: { value: new THREE.Color() }, uStripe: { value: new THREE.Color() }, uWhite: { value: new THREE.Color() },
      uEarInner: { value: new THREE.Color() }, uBlush: { value: new THREE.Color() }, uShadowTint: { value: new THREE.Color() },
      uPattern: { value: 1 }, uWhiteAmount: { value: 1 }, uMud: { value: 0 },
      uLight: { value: new THREE.Vector3(-0.45, 0.75, 0.55) },
    };
    this.bodyMaterial = new THREE.ShaderMaterial({ vertexShader: toonVertex, fragmentShader: toonFragment, uniforms: this.uniforms });
    this.outlineUniforms = { uThickness: { value: this.opts.outline }, uColor: { value: new THREE.Color('#3a1c10') } };
    this.outlineMaterial = new THREE.ShaderMaterial({
      vertexShader: outlineVertex, fragmentShader: outlineFragment, uniforms: this.outlineUniforms, side: THREE.BackSide,
    });

    this.mesh = new THREE.SkinnedMesh(geo, this.bodyMaterial);
    this.outline = new THREE.SkinnedMesh(geo, this.outlineMaterial);
    for (const mesh of [this.mesh, this.outline]) mesh.frustumCulled = false;
    this.mesh.add(this.bones.pelvis);
    this.rig.add(this.mesh);
    this.rig.add(this.outline);
    this.rig.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(this.boneList);
    this.mesh.bind(this.skeleton, this.mesh.matrixWorld);
    this.outline.bind(this.skeleton, this.mesh.matrixWorld);
  }

  _buildFace() {
    const head = this.bones.head;
    const hp = BONES.find((b) => b.name === 'head').pos;
    const local = (p) => new THREE.Vector3(p[0] - hp[0], p[1] - hp[1], p[2] - hp[2]);

    this.eyes = {};
    this.eyeMaterials = [];
    const sphere = new THREE.SphereGeometry(FACE.eyeRadius, 32, 24);
    for (const side of ['L', 'R']) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: eyeVertex, fragmentShader: eyeFragment,
        uniforms: {
          uIris: { value: new THREE.Color() }, uIris2: { value: new THREE.Color() }, uLid: { value: new THREE.Color() },
          uOutline: { value: new THREE.Color() },
          uBlink: { value: 0 }, uPupil: { value: 0.5 }, uR: { value: FACE.eyeRadius },
        },
      });
      this.eyeMaterials.push(mat);
      const pivot = new THREE.Group();
      pivot.position.copy(local(side === 'L' ? FACE.eyeL : FACE.eyeR));
      const m = new THREE.Mesh(sphere, mat);
      m.scale.set(0.5, 1.1, 0.9);   // flattened into the face, a little tall
      pivot.add(m);
      head.add(pivot);
      this.eyes[side] = { pivot, mat };
    }

    // nose: small rounded wedge
    this.noseMat = new THREE.MeshBasicMaterial({ color: '#ff8f9e' });
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), this.noseMat);
    nose.scale.set(0.007, 0.0075, 0.0125);
    nose.position.copy(local(FACE.nose));
    head.add(nose);
    this.nose = nose;

    // ":3" mouth
    this.lineMat = new THREE.MeshBasicMaterial({ color: '#3a1c10' });
    for (const s of [1, -1]) {
      const pts = [
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.002, -0.009, s * 0.002), new THREE.Vector3(-0.003, -0.015, s * 0.011), new THREE.Vector3(-0.001, -0.016, s * 0.022),
      ];
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.0011, 5), this.lineMat);
      tube.position.copy(local([FACE.nose[0] - 0.003, FACE.nose[1] - 0.006, 0]));
      head.add(tube);
    }

    // whiskers: three per side, dark and thin
    this.whiskerMat = new THREE.MeshBasicMaterial({ color: '#3a1c10' });
    this.whiskers = { L: new THREE.Group(), R: new THREE.Group() };
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1;
      const g = this.whiskers[side];
      g.position.copy(local([FACE.whiskerRoot[0] - 0.006, FACE.whiskerRoot[1], FACE.whiskerRoot[2] * s]));
      for (let i = 0; i < 3; i++) {
        const spread = (i - 1) * 0.32;
        const length = 0.075 - Math.abs(i - 1) * 0.012;
        const pts = [];
        for (let t = 0; t <= 1.001; t += 0.25) {
          pts.push(new THREE.Vector3(
            Math.cos(spread) * length * t * 0.35,
            Math.sin(spread) * length * t * 0.8 - 0.02 * t * t * length * 3,
            s * length * t * 0.9,
          ));
        }
        g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.0011, 4), this.whiskerMat));
      }
      head.add(g);
    }
  }

  _buildShadow() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grd.addColorStop(0, 'rgba(0,0,0,0.5)');
    grd.addColorStop(0.65, 'rgba(0,0,0,0.2)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.75 }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.set(-0.01, 0.0015, 0);
    this.shadow.scale.set(0.66, 0.3, 1);
    this.shadow.renderOrder = -1;
    this.orient.add(this.shadow);
  }

  setCoat(name) {
    const c = COATS[name] || COATS.ginger;
    this.coatName = name;
    const u = this.uniforms;
    u.uBase.value.set(c.base);
    u.uStripe.value.set(c.stripe);
    u.uWhite.value.set(c.white);
    u.uEarInner.value.set(c.ear);
    u.uShadowTint.value.set(c.shadow);
    u.uPattern.value = c.pattern;
    u.uWhiteAmount.value = c.whiteAmount;
    this.outlineUniforms.uColor.value.set(c.outline);
    for (const m of this.eyeMaterials) {
      m.uniforms.uIris.value.set(c.eye[0]);
      m.uniforms.uIris2.value.set(c.eye[1]);
      m.uniforms.uLid.value.set(c.base);
      m.uniforms.uOutline.value.set(c.outline);
    }
    this.noseMat.color.set(c.nose);
    this.lineMat.color.set(c.outline);
    this.whiskerMat.color.set(c.outline);
  }

  /** Scale the whole cat on screen (1 = 480 px per cat unit). */
  setSizeFactor(f) {
    this.sizeFactor = f;
    const px = Math.round(this.baseSize * f);
    this.renderer.setSize(px, px, false);
    this.canvas.style.width = px + 'px';
    this.canvas.style.height = px + 'px';
    this.outlineUniforms.uThickness.value = this.opts.outline * (f < 0.8 ? 1.25 : 1);
  }

  // Kept for API compatibility with the realistic-fur version: no-ops here.
  setFurQuality() {}
  updateFur() {}

  render(dt = 0.016) {
    this.time += dt;
    this.uniforms.uMud.value = this.mud;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.dispose();
  }
}
