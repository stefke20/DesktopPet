// Three.js view of the cat: skinned fur-shell body, eyes, nose, whiskers.
import * as THREE from 'three';
import { BONES, FACE } from '../../shared/cat/rig-def.js';
import { unpackCat } from '../../shared/cat/generate.js';
import { furVertex, furFragment } from './fur-shader.js';

export const COATS = {
  tabby: { base: '#8a6a47', stripe: '#2b1d14', white: '#f1ece4', pattern: 1.0, whiteAmount: 1.0, ear: '#d6a49c', eye: ['#b9c53a', '#4d6a12'] },
  ginger: { base: '#d98a43', stripe: '#a24f1d', white: '#f6ead8', pattern: 0.85, whiteAmount: 0.7, ear: '#e5b3a5', eye: ['#d9b840', '#7a5a10'] },
  grey: { base: '#7d8087', stripe: '#33363c', white: '#eceef0', pattern: 0.95, whiteAmount: 0.6, ear: '#d6aeab', eye: ['#9fd05a', '#3d6f1c'] },
  black: { base: '#17151a', stripe: '#0d0c0f', white: '#e8e6e6', pattern: 0.0, whiteAmount: 0.0, ear: '#5a4246', eye: ['#e6c93a', '#8a6a10'] },
  tuxedo: { base: '#1a181c', stripe: '#0d0c0f', white: '#f2f0ee', pattern: 0.0, whiteAmount: 1.0, ear: '#b8908f', eye: ['#a8d24a', '#3d6f1c'] },
  cream: { base: '#d9c3a0', stripe: '#a98f6b', white: '#f6efe3', pattern: 0.55, whiteAmount: 0.8, ear: '#e8bdb2', eye: ['#7fb7d6', '#2a5e86'] },
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

const eyeFragment = /* glsl */ `
precision highp float;
varying vec3 vP; varying vec3 vNv; varying vec3 vView;
uniform vec3 uIris; uniform vec3 uIris2; uniform vec3 uLid;
uniform float uBlink; uniform float uPupil; uniform float uR;
float h13(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx+31.32); return fract((p.x+p.y)*p.z); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  float a=h13(vec3(i,1.)), b=h13(vec3(i+vec2(1,0),1.)), c=h13(vec3(i+vec2(0,1),1.)), d=h13(vec3(i+vec2(1,1),1.));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
void main(){
  vec3 p = vP / uR;                     // unit sphere, +x looks forward
  vec2 e = vec2(p.z, p.y);              // in-plane coords
  float ang = atan(e.y, e.x);
  float rad = length(e);
  // iris
  float irisR = 1.02;
  vec3 col = vec3(0.93, 0.9, 0.84);
  float fibre = noise(vec2(ang * 9.0, rad * 5.0)) * 0.6 + noise(vec2(ang * 24.0, rad * 11.0)) * 0.4;
  vec3 iris = mix(uIris2, uIris, smoothstep(0.1, 0.8, rad) * 0.6 + fibre * 0.55);
  iris = mix(iris, uIris2 * 0.5, smoothstep(0.78, 1.0, rad));   // dark limbal ring
  iris *= 0.8 + 0.4 * fibre;
  float isIris = (p.x > 0.0) ? 1.0 - smoothstep(irisR - 0.04, irisR, rad) : 0.0;
  col = mix(col, iris, isIris);
  // vertical slit pupil
  float pw = mix(0.06, 0.6, uPupil);
  float pe = (e.x / pw) * (e.x / pw) + (e.y / 0.92) * (e.y / 0.92);
  float pupil = (p.x > 0.0) ? 1.0 - smoothstep(0.8, 1.0, pe) : 0.0;
  col = mix(col, vec3(0.01), pupil);
  // almond-shaped lids; blink closes the upper lid over the eye
  float upper = mix(0.66, -1.15, uBlink) - 0.38 * e.x * e.x;
  float lower = mix(-0.66, -0.15, uBlink) + 0.3 * e.x * e.x;
  float cover = max(smoothstep(upper - 0.04, upper + 0.04, p.y), smoothstep(lower + 0.04, lower - 0.04, p.y));
  float edge = min(smoothstep(0.0, 0.16, abs(p.y - upper)), smoothstep(0.0, 0.16, abs(p.y - lower)));
  col = mix(col * (0.65 + 0.35 * edge), uLid * (0.55 + 0.25 * edge), clamp(cover, 0.0, 1.0));
  // wet cornea: two soft reflections of the room
  vec3 N = normalize(vNv), V = normalize(vView);
  vec3 L1 = normalize(vec3(-0.45, 0.65, 0.6));
  vec3 H1 = normalize(L1 + V);
  float s1 = pow(max(dot(N, H1), 0.0), 220.0) * 1.6;
  vec3 L2 = normalize(vec3(0.6, -0.2, 0.7));
  float s2 = pow(max(dot(N, normalize(L2 + V)), 0.0), 90.0) * 0.35;
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.25;
  float shade = mix(0.55, 1.0, clamp(dot(N, L1) * 0.5 + 0.55, 0.0, 1.0));
  vec3 outc = col * shade + vec3(1.0) * (s1 + s2) * (1.0 - cover * 0.9) + vec3(0.7, 0.8, 1.0) * fres;
  gl_FragColor = vec4(outc, 1.0);
  #include <colorspace_fragment>
}`;

export class CatView {
  constructor(canvas, modelBuffer, opts = {}) {
    this.opts = { layers: 20, furLength: 0.013, pxPerUnit: 480, size: 640, density: 420, ...opts };
    const { size } = this.opts;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'default' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(opts.pixelRatio || window.devicePixelRatio || 1);
    this.renderer.setSize(size, size, false);
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';

    this.scene = new THREE.Scene();
    // Orthographic-ish perspective: 1 cat unit == pxPerUnit px at z = 0.
    const H = size / this.opts.pxPerUnit;
    const fov = 12;
    const dist = H / 2 / Math.tan((fov * Math.PI) / 360);
    this.camera = new THREE.PerspectiveCamera(fov, 1, dist * 0.5, dist * 2);
    this.camera.position.set(0, 0, dist);
    this.scene.add(this.camera);

    const key = new THREE.DirectionalLight(0xfff0dc, 2.4);
    key.position.set(-0.5, 0.7, 0.6);
    this.scene.add(key);
    this.scene.add(new THREE.HemisphereLight(0xb4c4e0, 0x6a5a50, 1.1));
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
    this.setCoat('tabby');
    this.mud = 0;
    this.time = 0;
    this._lastRootPos = new THREE.Vector3();
    this._inertia = new THREE.Vector3();
    this._inertiaVel = new THREE.Vector3();
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
    this.skeleton = null;
  }

  _buildBody(m) {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
    geo.setAttribute('aGrain', new THREE.BufferAttribute(m.grain, 3));
    geo.setAttribute('aFur', new THREE.BufferAttribute(m.furLen, 1));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(m.skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(m.skinWeight, 4));
    geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
    geo.instanceCount = this.opts.layers;

    this.furUniforms = {
      uFurLen: { value: this.opts.furLength },
      uLayers: { value: this.opts.layers },
      uInertia: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uBase: { value: new THREE.Color() },
      uStripe: { value: new THREE.Color() },
      uWhite: { value: new THREE.Color() },
      uEarInner: { value: new THREE.Color() },
      uPattern: { value: 1 },
      uWhiteAmount: { value: 1 },
      uDensity: { value: this.opts.density },
      uMud: { value: 0 },
      uLightKey: { value: new THREE.Vector3(-0.5, 0.7, 0.55) },
      uLightFill: { value: new THREE.Vector3(0.7, 0.15, 0.5) },
      uLightRim: { value: new THREE.Vector3(0.1, 0.4, -1) },
    };
    this.furMaterial = new THREE.ShaderMaterial({
      vertexShader: furVertex,
      fragmentShader: furFragment,
      uniforms: this.furUniforms,
      alphaToCoverage: true,
      side: THREE.FrontSide,
    });

    this.mesh = new THREE.SkinnedMesh(geo, this.furMaterial);
    this.mesh.frustumCulled = false;
    this.mesh.add(this.bones.pelvis);
    this.rig.add(this.mesh);
    this.rig.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(this.boneList);
    this.mesh.bind(this.skeleton, this.mesh.matrixWorld);
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
          uBlink: { value: 0 }, uPupil: { value: 0.5 }, uR: { value: FACE.eyeRadius },
        },
      });
      this.eyeMaterials.push(mat);
      const pivot = new THREE.Group();
      pivot.position.copy(local(side === 'L' ? FACE.eyeL : FACE.eyeR));
      const m = new THREE.Mesh(sphere, mat);
      pivot.add(m);
      head.add(pivot);
      this.eyes[side] = { pivot, mat };
    }

    // nose: small rounded wedge
    const noseMat = new THREE.MeshStandardMaterial({ color: '#d98c8c', roughness: 0.35, metalness: 0 });
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), noseMat);
    nose.scale.set(0.0072, 0.0058, 0.0105);
    nose.position.copy(local(FACE.nose));
    head.add(nose);
    this.nose = nose;
    this.noseMat = noseMat;

    // mouth: two tiny dark curves under the nose
    const mouthMat = new THREE.MeshBasicMaterial({ color: '#3a2326' });
    for (const s of [1, -1]) {
      const pts = [
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.002, -0.006, s * 0.006), new THREE.Vector3(-0.001, -0.009, s * 0.013), new THREE.Vector3(0.002, -0.0085, s * 0.02),
      ];
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.0006, 5), mouthMat);
      tube.position.copy(local([FACE.nose[0] - 0.003, FACE.nose[1] - 0.004, 0]));
      head.add(tube);
    }

    // whiskers
    const whiskerMat = new THREE.MeshBasicMaterial({ color: '#f4f1ea', transparent: true, opacity: 0.9 });
    this.whiskers = { L: new THREE.Group(), R: new THREE.Group() };
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1;
      const g = this.whiskers[side];
      g.position.copy(local([FACE.whiskerRoot[0], FACE.whiskerRoot[1], FACE.whiskerRoot[2] * s]));
      for (let i = 0; i < 4; i++) {
        const spread = (i - 1.5) * 0.28;
        const length = 0.075 - Math.abs(i - 1.5) * 0.008;
        const pts = [];
        for (let t = 0; t <= 1.001; t += 0.25) {
          pts.push(new THREE.Vector3(
            Math.cos(spread) * length * t * 0.55,
            Math.sin(spread) * length * t * 0.8 - 0.05 * t * t * length * 3,
            s * length * t * 0.85,
          ));
        }
        const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.00055, 4), whiskerMat);
        g.add(tube);
      }
      head.add(g);
    }
    // brow whiskers
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1;
      const pts = [0, 0.33, 0.66, 1].map((t) => new THREE.Vector3(0.01 * t, 0.025 * t, s * 0.015 * t));
      const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 6, 0.0005, 4), whiskerMat);
      m.position.copy(local([FACE.eyeL[0] + 0.005, FACE.eyeL[1] + 0.014, FACE.eyeL[2] * s]));
      head.add(m);
    }
  }

  _buildShadow() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)');
    grd.addColorStop(0.6, 'rgba(0,0,0,0.22)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.8 }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.set(-0.01, 0.0015, 0);
    this.shadow.scale.set(0.62, 0.3, 1);
    this.shadow.renderOrder = -1;
    this.orient.add(this.shadow);
  }

  setCoat(name) {
    const c = COATS[name] || COATS.tabby;
    this.coatName = name;
    const u = this.furUniforms;
    u.uBase.value.set(c.base);
    u.uStripe.value.set(c.stripe);
    u.uWhite.value.set(c.white);
    u.uEarInner.value.set(c.ear);
    u.uPattern.value = c.pattern;
    u.uWhiteAmount.value = c.whiteAmount;
    for (const m of this.eyeMaterials) {
      m.uniforms.uIris.value.set(c.eye[0]);
      m.uniforms.uIris2.value.set(c.eye[1]);
      m.uniforms.uLid.value.set(c.base).multiplyScalar(0.6);
    }
  }

  setFurQuality(layers) {
    this.furUniforms.uLayers.value = layers;
    this.mesh.geometry.instanceCount = layers;
  }

  /** Spring-driven fur lag from root acceleration (object space, cat units). */
  updateFur(dt, accel) {
    const k = 120, c = 9;
    const f = this._inertiaVel;
    f.x += (-this._inertia.x * k - f.x * c - accel.x * 0.02) * dt;
    f.y += (-this._inertia.y * k - f.y * c - accel.y * 0.02) * dt;
    f.z += (-this._inertia.z * k - f.z * c - accel.z * 0.02) * dt;
    this._inertia.addScaledVector(f, dt);
    this._inertia.clampLength(0, 0.012);
    this.furUniforms.uInertia.value.copy(this._inertia);
  }

  render(dt = 0.016) {
    this.time += dt;
    this.furUniforms.uTime.value = this.time;
    this.furUniforms.uMud.value = this.mud;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.dispose();
  }
}
