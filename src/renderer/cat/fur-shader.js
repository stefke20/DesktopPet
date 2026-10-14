// Fur-shell material for the skinned cat. Shells are drawn with a single
// instanced draw call; gl_InstanceID selects the shell height.

export const furVertex = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>

uniform float uFurLen;
uniform float uLayers;
uniform vec3 uInertia;     // object-space fur lag (spring driven on the CPU)
uniform float uTime;

attribute float aFur;
attribute vec3 aGrain;

varying vec3 vN;
varying vec3 vT;
varying vec3 vRest;
varying vec3 vRestN;
varying float vH;
varying float vFur;
varying vec3 vViewPos;

void main() {
  float h = float(gl_InstanceID) / max(uLayers - 1.0, 1.0);
  vec3 objectNormal = normal;
  vec3 transformed = position;

  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <skinning_vertex>

  vec3 n = normalize(objectNormal);
  vec3 g = (skinMatrix * vec4(aGrain, 0.0)).xyz;
  g = normalize(g - n * dot(g, n) + 1e-5);

  float len = uFurLen * aFur;
  // Strands lean along the grain and lag behind motion.
  vec3 off = n * h + g * (0.75 * h * h) + uInertia * (h * h) * 6.0;
  off.y -= 0.12 * h * h * h;                       // slight droop
  off += n * 0.03 * h * sin(uTime * 1.7 + position.x * 60.0 + position.y * 40.0) * h; // breathing shimmer
  transformed += off * len;

  vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
  vViewPos = mv.xyz;
  vN = normalize(normalMatrix * n);
  vT = normalize(normalMatrix * g);
  vRest = position;
  vRestN = normal;
  vH = h;
  vFur = aFur;
  gl_Position = projectionMatrix * mv;
}
`;

export const furFragment = /* glsl */ `
precision highp float;

varying vec3 vN;
varying vec3 vT;
varying vec3 vRest;
varying vec3 vRestN;
varying float vH;
varying float vFur;
varying vec3 vViewPos;

uniform vec3 uBase;
uniform vec3 uStripe;
uniform vec3 uWhite;
uniform vec3 uEarInner;
uniform float uPattern;
uniform float uWhiteAmount;
uniform float uDensity;
uniform float uMud;        // 0..1 muddy paws
uniform float uTime;
uniform vec3 uLightKey;
uniform vec3 uLightFill;
uniform vec3 uLightRim;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
vec3 hash33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash13(i), b = hash13(i + vec3(1,0,0)), c = hash13(i + vec3(0,1,0)), d = hash13(i + vec3(1,1,0));
  float e = hash13(i + vec3(0,0,1)), ff = hash13(i + vec3(1,0,1)), g = hash13(i + vec3(0,1,1)), hh = hash13(i + vec3(1,1,1));
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, ff, f.x), mix(g, hh, f.x), f.y), f.z);
}
float fbm(vec3 p) { return 0.5 * vnoise(p) + 0.25 * vnoise(p * 2.03) + 0.125 * vnoise(p * 4.01); }

struct Coat { vec3 color; float stripe; float white; float ear; float paw; };

Coat coat(vec3 p, vec3 rn) {
  Coat c;
  float ay = p.y - 0.185;
  float ang = atan(p.z, ay);
  float up = cos(ang);
  float tail = smoothstep(-0.238, -0.255, p.x);
  float head = smoothstep(0.262, 0.285, p.x);
  float legs = smoothstep(0.12, 0.09, p.y) * (1.0 - tail);
  float w = fbm(vec3(p.x * 16.0, ang * 1.4, p.z * 9.0));

  // mackerel stripes on the torso, fading toward the belly
  float torsoMask = (1.0 - tail) * (1.0 - head);
  float s = sin(p.x * 128.0 + w * 6.0 + ang * 0.7);
  float stripe = smoothstep(0.05, 0.4, s) * smoothstep(-0.35, 0.55, up) * torsoMask;
  stripe = max(stripe, smoothstep(0.4, 0.85, up) * smoothstep(0.014, 0.004, abs(p.z)) * torsoMask * 0.9); // dorsal line

  // tail rings and dark tip
  float rings = smoothstep(0.1, 0.5, sin(p.x * 105.0 + w * 2.0)) * tail;
  rings = max(rings, smoothstep(-0.435, -0.46, p.x) * tail);
  stripe = max(stripe, rings);

  // leg bars
  float bars = smoothstep(0.2, 0.6, sin(p.y * 250.0 + w * 3.0)) * legs * smoothstep(0.03, 0.055, p.y);
  stripe = max(stripe, bars);

  // face: forehead lines, cheek lines and eye liner
  float fore = smoothstep(0.25, 0.7, sin(p.z * 360.0 + w * 3.0)) * head * smoothstep(0.3, 0.7, up) * smoothstep(0.34, 0.31, p.x);
  float cheek = smoothstep(0.35, 0.8, sin((p.y - 0.27) * 420.0 + p.x * 90.0 + w * 3.0)) * head * smoothstep(0.02, 0.04, abs(p.z)) * smoothstep(0.34, 0.31, p.x) * (1.0 - smoothstep(0.35, 0.7, up));
  float liner = smoothstep(0.012, 0.004, abs(p.y - 0.3 + (p.x - 0.343) * 0.25)) * smoothstep(0.34, 0.36, p.x) * smoothstep(0.02, 0.03, abs(p.z)) * smoothstep(0.42, 0.39, p.x) * head * 0.0;
  stripe = max(stripe, max(fore, max(cheek, liner)));

  // white areas
  float bib = smoothstep(0.1, 0.14, p.x) * smoothstep(0.215, 0.175, p.y) * smoothstep(0.05, 0.022, abs(p.z)) * smoothstep(0.2, 0.17, p.x + 0.0 * p.y);
  float belly = smoothstep(-0.55, -0.95, up) * torsoMask;
  float socks = smoothstep(0.042, 0.026, p.y) * legs;
  float muzzle = smoothstep(0.338, 0.356, p.x) * smoothstep(0.292, 0.268, p.y);
  float chin = smoothstep(0.262, 0.25, p.y) * head;
  float white = max(max(bib, belly * 0.85), max(socks, max(muzzle, chin)));
  white *= uWhiteAmount;

  float ear = smoothstep(0.332, 0.345, p.y) * head * (1.0 - smoothstep(0.31, 0.33, p.x)) ;
  ear *= smoothstep(0.1, 0.5, rn.x);
  c.ear = ear;
  c.paw = socks;
  c.stripe = stripe;
  c.white = white;
  vec3 col = mix(uBase, uStripe, stripe * uPattern);
  // gentle patchy tone variation
  col *= 0.88 + 0.24 * fbm(p * 22.0);
  col = mix(col, uWhite, white);
  c.color = col;
  return c;
}

void main() {
  float h = vH;
  Coat cf = coat(vRest, vRestN);

  // hair strands: jittered point per 3D cell, tapering with height
  vec3 q = vRest * uDensity;
  vec3 cell = floor(q);
  vec3 rnd = hash33(cell);
  vec3 centre = 0.5 + (rnd - 0.5) * 0.55;
  float d = length(fract(q) - centre);
  float taper = pow(1.0 - h, 0.75);
  float r = mix(0.05, 0.5, taper) * (0.8 + 0.4 * hash13(cell + 7.0));
  r += 0.2 * (1.0 - smoothstep(0.2, 0.8, vFur)) * taper; // short fur: denser, fills gaps
  // clumping: low frequency noise makes tufts
  float clump = vnoise(vRest * 130.0);
  r *= 0.85 + 0.3 * clump;
  float lenR = hash13(cell + 3.0);
  float alive = step(h, 0.7 + 0.3 * lenR);          // strands have different lengths
  float cover = 1.0 - smoothstep(r - 0.1, r + 0.04, d);
  float shortFur = step(0.04, vFur);
  if (h > 0.001 && (cover * alive * shortFur) < 0.02) discard;

  float alpha = h < 0.001 ? 1.0 : clamp(cover * 1.4, 0.0, 1.0);

  vec3 N = normalize(vN);
  vec3 V = normalize(-vViewPos);
  vec3 T = normalize(vT);

  // colour: dark at the roots, banded ("agouti") along the strand
  vec3 col = cf.color;
  float root = mix(0.38, 1.0, pow(h, 0.55));
  float band = smoothstep(0.55, 0.72, h) * (1.0 - smoothstep(0.88, 1.0, h));
  col = mix(col, mix(uStripe, col, 0.35), band * 0.35 * (1.0 - cf.white) * (1.0 - cf.stripe));
  col *= 0.86 + 0.28 * hash13(cell + 11.0);
  col = mix(col, uEarInner, cf.ear * 0.6);
  // mud on the paws
  float mud = uMud * smoothstep(0.075, 0.035, vRest.y) * (1.0 - smoothstep(0.1, 0.2, abs(vRest.x) * 0.0));
  mud *= 0.65 + 0.35 * vnoise(vRest * 160.0);
  col = mix(col, vec3(0.16, 0.1, 0.055), clamp(mud, 0.0, 0.92));
  if (h < 0.001) col *= 0.8; // skin under the fur

  // lighting
  vec3 Lk = normalize(uLightKey), Lf = normalize(uLightFill), Lr = normalize(uLightRim);
  float wrapK = clamp(dot(N, Lk) * 0.5 + 0.5, 0.0, 1.0);
  float diffK = wrapK * wrapK;
  float diffF = clamp(dot(N, Lf) * 0.5 + 0.5, 0.0, 1.0);
  vec3 sky = vec3(0.50, 0.56, 0.68), ground = vec3(0.30, 0.25, 0.21);
  vec3 amb = mix(ground, sky, N.y * 0.5 + 0.5);
  float ao = mix(0.35, 1.0, pow(h, 0.5));
  // soft self-shadowing: fur facing away from the key light gets darker deep down
  vec3 light = vec3(1.0, 0.94, 0.86) * diffK * 1.05 + vec3(0.55, 0.65, 0.9) * diffF * 0.3 + amb * 0.55;
  vec3 colLit = col * light * ao * root;

  // anisotropic (Kajiya-Kay) highlight along the hair
  vec3 H = normalize(Lk + V);
  float th = dot(T, H);
  float sinTH = sqrt(max(0.0, 1.0 - th * th));
  float spec = pow(sinTH, 80.0) * 0.28 + pow(sinTH, 12.0) * 0.05;
  spec *= smoothstep(0.1, 0.9, h) * (0.3 + 0.7 * diffK);
  // rim light gives the soft fuzzy silhouette
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.4);
  float rim = fres * (0.4 + 0.6 * clamp(dot(N, Lr) * 0.5 + 0.5, 0.0, 1.0)) * smoothstep(0.0, 0.8, h);
  vec3 rimCol = mix(vec3(0.75, 0.82, 1.0), col * 2.0, 0.45) * rim * 0.55;

  vec3 outc = colLit + vec3(1.0, 0.96, 0.9) * spec * 0.8 + rimCol;
  gl_FragColor = vec4(outc, alpha);
  #include <colorspace_fragment>
}
`;
