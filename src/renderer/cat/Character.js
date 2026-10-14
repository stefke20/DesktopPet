// One playable character (cat or dog): skinned cel-shaded body with outline,
// big glossy eyes, nose, mouth, whiskers and tongue. Several Characters can live
// in one scene; only the active one is visible.
import * as THREE from 'three';
import { getRig } from '../../shared/cat/rig-def.js';
import { unpackCat } from '../../shared/cat/generate.js';
import { toonVertex, toonFragment, outlineVertex, outlineFragment } from './toon-shader.js';
import { COATS } from './coats.js';

const eyeVertex = /* glsl */ `
varying vec3 vP; varying vec3 vNv; varying vec3 vView;
void main(){
  vP = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = -mv.xyz;
  vNv = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}`;

// Big toon eye: coloured iris, pupil (slit or round), two white highlights, lid outline.
const eyeFragment = /* glsl */ `
precision highp float;
varying vec3 vP; varying vec3 vNv; varying vec3 vView;
uniform vec3 uIris; uniform vec3 uIris2; uniform vec3 uLid; uniform vec3 uOutline;
uniform float uBlink; uniform float uPupil; uniform float uR;
uniform float uPupMin; uniform float uPupMax; uniform float uPupH;
float e(float v, float w){ return smoothstep(-w, w, v); }
void main(){
  vec3 p = vP / uR;
  vec2 q = vec2(p.z, p.y);
  float front = p.x;
  float r = length(q * vec2(0.95, 0.78));
  vec3 col = mix(uIris, uIris2, smoothstep(-0.7, 0.8, q.y * -1.0 + 0.0) * 0.9);
  col = mix(col, uIris * 1.1, smoothstep(0.1, 0.9, -q.y) * 0.5);
  float pw = mix(uPupMin, uPupMax, uPupil);
  float pupil = 1.0 - e(length(vec2(q.x / pw, q.y / uPupH)) - 1.0, 0.06);
  col = mix(col, vec3(0.03, 0.02, 0.04), pupil);
  col = mix(col, uOutline, smoothstep(0.78, 1.0, r) * 0.7);
  float h1 = 1.0 - e(length((q - vec2(-0.3, 0.38))) - 0.24, 0.05);
  float h2 = 1.0 - e(length((q - vec2(0.33, -0.34))) - 0.1, 0.05);
  col = mix(col, vec3(1.0), clamp(h1 + h2, 0.0, 1.0) * (1.0 - uBlink * 0.9));
  float upper = mix(1.2, -1.1, uBlink) - 0.25 * q.x * q.x;
  float lower = mix(-1.3, -0.1, uBlink) + 0.1 * q.x * q.x;
  float cover = max(e(q.y - upper, 0.04), e(lower - q.y, 0.04));
  float line = max(1.0 - smoothstep(0.0, 0.1, abs(q.y - upper)), 1.0 - smoothstep(0.0, 0.1, abs(q.y - lower)));
  col = mix(col, uLid, clamp(cover, 0.0, 1.0));
  col = mix(col, uOutline, line * 0.9 * step(0.02, uBlink));
  col = mix(col, uOutline, smoothstep(0.9, 1.0, length(q)));
  col = mix(col, uOutline * 0.5, step(front, 0.0));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export class Character {
  constructor(scene, species, modelBuffer, opts = {}) {
    this.species = species;
    this.def = getRig(species);
    this.dog = species === 'dog';
    this.outlineWidth = opts.outline ?? 0.0055;
    this.scene = scene;
    this.mud = 0;
    this.mouth = 0;

    // `orient` carries placement/orientation; `rig` holds the skeleton.
    this.orient = new THREE.Group();
    scene.add(this.orient);
    this.rig = new THREE.Group();
    this.orient.add(this.rig);

    this.bones = {};
    this._buildSkeleton();
    this._buildBody(unpackCat(modelBuffer));
    this._buildFace();
    this._buildShadow();
    this.coatName = null;
    this.setCoat(this.dog ? 'golden' : 'ginger');
  }

  set visible(v) { this.orient.visible = v; }
  get visible() { return this.orient.visible; }

  _buildSkeleton() {
    const BONES = this.def.BONES;
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

    const C = () => new THREE.Color();
    this.uniforms = {
      uBase: { value: C() }, uStripe: { value: C() }, uWhite: { value: C() }, uEarInner: { value: C() }, uEarOuter: { value: C() },
      uHeadCol: { value: C() }, uShadowTint: { value: C() },
      uPatternType: { value: 0 }, uStrength: { value: 1 }, uWhiteAmount: { value: 1 }, uDog: { value: this.dog ? 1 : 0 },
      uBlaze: { value: 0 }, uHasHead: { value: 0 }, uMud: { value: 0 },
      uLight: { value: new THREE.Vector3(-0.45, 0.75, 0.55) },
    };
    this.bodyMaterial = new THREE.ShaderMaterial({ vertexShader: toonVertex, fragmentShader: toonFragment, uniforms: this.uniforms });
    this.outlineUniforms = { uThickness: { value: this.outlineWidth }, uColor: { value: new THREE.Color('#3a1c10') } };
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
    const FACE = this.def.FACE;
    const head = this.bones.head;
    const hp = this.def.BONES.find((b) => b.name === 'head').pos;
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
          // cats: vertical slits; dogs: big round pupils
          uPupMin: { value: this.dog ? 0.5 : 0.2 }, uPupMax: { value: this.dog ? 0.62 : 0.55 }, uPupH: { value: this.dog ? 0.62 : 0.78 },
        },
      });
      this.eyeMaterials.push(mat);
      const pivot = new THREE.Group();
      pivot.position.copy(local(side === 'L' ? FACE.eyeL : FACE.eyeR));
      const m = new THREE.Mesh(sphere, mat);
      m.scale.set(this.dog ? 0.55 : 0.5, this.dog ? 1.0 : 1.1, this.dog ? 1.0 : 0.9);
      pivot.add(m);
      head.add(pivot);
      this.eyes[side] = { pivot, mat };
    }

    this.noseMat = new THREE.MeshBasicMaterial({ color: '#ff8f9e' });
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), this.noseMat);
    if (this.dog) nose.scale.set(0.017, 0.0135, 0.021); else nose.scale.set(0.007, 0.0075, 0.0125);
    nose.position.copy(local(FACE.nose));
    head.add(nose);
    this.nose = nose;
    if (this.dog) {   // a shiny highlight dot on the dog's nose (child of the squashed sphere, so unit-sized)
      const gloss = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      gloss.scale.set(0.22, 0.16, 0.26); gloss.position.set(0.15, 0.62, 0.38); nose.add(gloss);
    }

    this.lineMat = new THREE.MeshBasicMaterial({ color: '#3a1c10' });
    for (const s of [1, -1]) {
      const pts = this.dog
        ? [new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.004, -0.014, s * 0.002), new THREE.Vector3(-0.026, -0.02, s * 0.014), new THREE.Vector3(-0.056, -0.017, s * 0.03), new THREE.Vector3(-0.082, -0.008, s * 0.036)]
        : [new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.002, -0.009, s * 0.002), new THREE.Vector3(-0.003, -0.015, s * 0.011), new THREE.Vector3(-0.001, -0.016, s * 0.022)];
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.0011, 5), this.lineMat);
      tube.position.copy(local([FACE.nose[0] - (this.dog ? 0.012 : 0.003), FACE.nose[1] - (this.dog ? 0.012 : 0.006), 0]));
      head.add(tube);
    }

    // tongue: hangs from the mouth, scaled by `mouth` (0 hidden .. 1 out)
    this.tongue = new THREE.Group();
    this.tongue.position.copy(local(FACE.tongue));
    const tongueMat = new THREE.MeshBasicMaterial({ color: '#ff7f95' });
    const tm = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), tongueMat);
    tm.scale.set(this.dog ? 0.022 : 0.012, this.dog ? 0.036 : 0.02, this.dog ? 0.016 : 0.01);
    tm.position.set(this.dog ? 0.012 : 0.004, this.dog ? -0.03 : -0.014, 0);
    this.tongue.add(tm);
    const crease = new THREE.Mesh(new THREE.BoxGeometry(0.0012, this.dog ? 0.026 : 0.012, 0.0012), new THREE.MeshBasicMaterial({ color: '#d9506c' }));
    crease.position.set(this.dog ? 0.03 : 0.012, this.dog ? -0.03 : -0.014, 0);
    this.tongue.add(crease);
    this.tongue.scale.setScalar(0.0001);
    head.add(this.tongue);
    this.tongueMat = tongueMat;

    // whiskers (cat: three per side; dog: none, just the groups the rig animates)
    this.whiskerMat = new THREE.MeshBasicMaterial({ color: '#3a1c10' });
    this.whiskers = { L: new THREE.Group(), R: new THREE.Group() };
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1;
      const g = this.whiskers[side];
      g.position.copy(local([FACE.whiskerRoot[0] - 0.006, FACE.whiskerRoot[1], FACE.whiskerRoot[2] * s]));
      if (!this.dog) {
        for (let i = 0; i < 3; i++) {
          const spread = (i - 1) * 0.32;
          const length = 0.075 - Math.abs(i - 1) * 0.012;
          const pts = [];
          for (let t = 0; t <= 1.001; t += 0.25) {
            pts.push(new THREE.Vector3(Math.cos(spread) * length * t * 0.35, Math.sin(spread) * length * t * 0.8 - 0.02 * t * t * length * 3, s * length * t * 0.9));
          }
          g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.0011, 4), this.whiskerMat));
        }
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
    this.shadow.scale.set(this.dog ? 0.78 : 0.66, 0.3, 1);
    this.shadow.renderOrder = -1;
    this.orient.add(this.shadow);
  }

  setCoat(name) {
    const set = COATS[this.species];
    const c = set[name] || set[Object.keys(set)[0]];
    this.coatName = set[name] ? name : Object.keys(set)[0];
    const u = this.uniforms;
    u.uBase.value.set(c.base);
    u.uStripe.value.set(c.stripe);
    u.uWhite.value.set(c.white);
    u.uEarInner.value.set(c.ear);
    u.uEarOuter.value.set(c.earOuter || c.base);
    u.uHeadCol.value.set(c.head || c.base);
    u.uShadowTint.value.set(c.shadow);
    u.uPatternType.value = c.pattern;
    u.uStrength.value = c.strength ?? 1;
    u.uWhiteAmount.value = c.whiteAmount;
    u.uBlaze.value = c.blaze || 0;
    this.outlineUniforms.uColor.value.set(c.outline);
    for (const m of this.eyeMaterials) {
      m.uniforms.uIris.value.set(c.eye[0]);
      m.uniforms.uIris2.value.set(c.eye[1]);
      m.uniforms.uLid.value.set(this.dog ? (c.head || c.base) : c.base);
      m.uniforms.uOutline.value.set(c.outline);
    }
    this.noseMat.color.set(c.nose);
    this.lineMat.color.set(c.outline);
    this.whiskerMat.color.set(c.outline);
  }

  setMouth(v) {
    this.mouth = v;
    this.tongue.scale.setScalar(Math.max(0.0001, v));
  }

  setOutlineScale(k) { this.outlineUniforms.uThickness.value = this.outlineWidth * k; }

  syncUniforms() { this.uniforms.uMud.value = this.mud; }
}
