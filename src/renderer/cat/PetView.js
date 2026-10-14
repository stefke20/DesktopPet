// The WebGL view: one renderer / camera / lights shared by every character.
import * as THREE from 'three';
import { Character } from './Character.js';

export class PetView {
  /** @param models {cat: ArrayBuffer, dog: ArrayBuffer} */
  constructor(canvas, models, opts = {}) {
    this.opts = { pxPerUnit: 480, size: 640, ...opts };
    const { size } = this.opts;
    this.baseSize = size;
    this.sizeFactor = 1;
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'default' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(opts.pixelRatio || window.devicePixelRatio || 1);
    this.renderer.setSize(size, size, false);
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';

    this.scene = new THREE.Scene();
    // Near-orthographic perspective: 1 unit == pxPerUnit px at z = 0.
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

    this.characters = {};
    for (const species of Object.keys(models)) {
      const ch = new Character(this.scene, species, models[species], opts);
      ch.visible = false;
      this.characters[species] = ch;
    }
    this.species = null;
    this.active = null;
    this.setSpecies(opts.species || 'cat');
    this.time = 0;
  }

  setSpecies(species) {
    if (!this.characters[species]) return this.active;
    for (const [id, ch] of Object.entries(this.characters)) ch.visible = id === species;
    this.species = species;
    this.active = this.characters[species];
    this.setSizeFactor(this.sizeFactor);
    return this.active;
  }

  /** Scale the whole picture (1 = 480 px per unit). Outline thickens slightly when small. */
  setSizeFactor(f) {
    this.sizeFactor = f;
    const px = Math.round(this.baseSize * f);
    this.renderer.setSize(px, px, false);
    this.canvas.style.width = px + 'px';
    this.canvas.style.height = px + 'px';
    for (const ch of Object.values(this.characters)) ch.setOutlineScale(f < 0.8 ? 1.25 : 1);
  }

  render(dt = 0.016) {
    this.time += dt;
    this.active.syncUniforms();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() { this.renderer.dispose(); }
}
