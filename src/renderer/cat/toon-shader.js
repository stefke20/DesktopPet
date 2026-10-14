// Cel-shaded body + inverted-hull outline for the skinned characters (cat and dog).

export const toonVertex = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>

varying vec3 vN;
varying vec3 vRest;
varying vec3 vRestN;
varying vec3 vViewPos;

void main() {
  vec3 objectNormal = normal;
  vec3 transformed = position;
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <skinning_vertex>
  vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
  vViewPos = mv.xyz;
  vN = normalize(normalMatrix * normalize(objectNormal));
  vRest = position;
  vRestN = normal;
  gl_Position = projectionMatrix * mv;
}
`;

export const toonFragment = /* glsl */ `
precision highp float;
varying vec3 vN;
varying vec3 vRest;
varying vec3 vRestN;
varying vec3 vViewPos;

uniform vec3 uBase;
uniform vec3 uStripe;
uniform vec3 uWhite;
uniform vec3 uEarInner;
uniform vec3 uEarOuter;
uniform vec3 uHeadCol;
uniform vec3 uShadowTint;
uniform float uPatternType;   // 0 tabby, 1 plain, 2 spots, 3 saddle
uniform float uStrength;
uniform float uWhiteAmount;
uniform float uDog;
uniform float uBlaze;
uniform float uHasHead;
uniform float uMud;
uniform vec3 uLight;

float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vn(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float edge(float v, float w) { return smoothstep(-w, w, v); }

void main() {
  vec3 p = vRest;
  float ay = p.y - 0.19;
  float ang = atan(p.z, ay);
  float up = cos(ang);                                   // 1 on the back, -1 on the belly
  float tail = smoothstep(-0.236, -0.252, p.x);
  float head = smoothstep(0.255, 0.28, p.x);
  float legs = smoothstep(0.125, 0.1, p.y) * (1.0 - tail);
  float warp = (vn(vec3(p.x * 14.0, ang * 1.3, p.z * 8.0)) - 0.5) * 2.2;
  float torso = (1.0 - tail) * (1.0 - head);
  float stripe = 0.0;
  float white = 0.0;
  float inner = 0.0;
  float earOut = 0.0;
  float headTint = 0.0;

  if (uDog < 0.5) {
    // ---------------- cat ----------------
    if (uPatternType < 0.5) {
      float s = sin(p.x * 78.0 + warp * 2.2 + ang * 0.5);
      stripe = edge(s - 0.1, 0.05) * smoothstep(-0.3, 0.45, up) * torso;
      stripe = max(stripe, edge(sin(p.x * 66.0 - 0.4) - 0.15, 0.06) * tail);
      stripe = max(stripe, edge(-0.445 - p.x, 0.012) * tail);
      stripe = max(stripe, edge(sin(p.y * 150.0 + warp) - 0.25, 0.06) * legs * smoothstep(0.045, 0.07, p.y));
      float fore = edge(sin(p.z * 150.0) - 0.45, 0.07) * head * smoothstep(0.35, 0.6, up) * smoothstep(0.405, 0.36, p.x) * smoothstep(0.31, 0.345, p.x);
      float cheek = edge(sin((p.y - 0.28) * 190.0 + p.x * 30.0) - 0.55, 0.07) * head * smoothstep(0.045, 0.06, abs(p.z)) * smoothstep(0.37, 0.34, p.x) * (1.0 - smoothstep(0.1, 0.5, up));
      stripe = max(stripe, max(fore, cheek));
    }
    float bib = smoothstep(0.1, 0.13, p.x) * smoothstep(0.235, 0.2, p.y) * smoothstep(0.065, 0.045, abs(p.z)) * (1.0 - head);
    float belly = smoothstep(-0.5, -0.8, up) * torso;
    float socks = smoothstep(0.055, 0.045, p.y) * legs;
    float muzzle = smoothstep(0.358, 0.372, p.x) * smoothstep(0.31, 0.29, p.y) * smoothstep(0.045, 0.03, abs(p.z));
    white = max(max(bib, belly), max(socks, muzzle));
    inner = smoothstep(0.12, 0.5, vRestN.x) * smoothstep(0.37, 0.385, p.y) * smoothstep(0.34, 0.3, p.x) * head;
  } else {
    // ---------------- dog ----------------
    float belly = smoothstep(-0.35, -0.75, up) * torso;
    float bib = smoothstep(0.1, 0.14, p.x) * smoothstep(0.24, 0.19, p.y) * smoothstep(0.07, 0.04, abs(p.z)) * (1.0 - head);
    float socks = smoothstep(0.06, 0.045, p.y) * legs;
    float muzzle = smoothstep(0.385, 0.405, p.x) * smoothstep(0.305, 0.27, p.y);
    float chin = smoothstep(0.268, 0.255, p.y) * smoothstep(0.34, 0.37, p.x);
    float blaze = uBlaze * smoothstep(0.016, 0.008, abs(p.z)) * smoothstep(0.3, 0.34, p.x) * smoothstep(0.475, 0.44, p.x) * smoothstep(0.285, 0.31, p.y);
    float tailTip = smoothstep(0.43, 0.455, p.y) * tail;
    white = max(max(bib, belly), max(socks, max(muzzle, max(chin, max(blaze, tailTip * step(2.5, uPatternType) )))));
    if (uPatternType > 1.5 && uPatternType < 2.5) {
      // dalmatian spots
      float n = vn(p * 36.0 + 3.0);
      stripe = smoothstep(0.62, 0.66, n) * (1.0 - socks * 0.0);
    } else if (uPatternType > 2.5) {
      // beagle saddle: dark patch over the back, brown head
      float sx = smoothstep(-0.2, -0.16, p.x + warp * 0.012) * smoothstep(0.16, 0.1, p.x + warp * 0.012);
      stripe = sx * smoothstep(0.05, 0.45, up) * torso;
      headTint = head * (1.0 - blaze) * (1.0 - muzzle) * (1.0 - chin);
    }
    earOut = smoothstep(0.052, 0.062, abs(p.z)) * smoothstep(0.37, 0.355, p.y) * smoothstep(0.33, 0.3, p.x) * smoothstep(0.24, 0.26, p.x);
    white *= uWhiteAmount;
    if (uPatternType > 1.5 && uPatternType < 2.5) white *= 0.0;   // dalmatian: base already white
  }
  white *= uWhiteAmount;

  vec3 col = mix(uBase, uStripe, stripe * uStrength);
  if (uDog > 0.5 && uPatternType > 2.5) col = mix(col, uHeadCol, headTint);
  col = mix(col, uWhite, white * (1.0 - stripe * 0.0));
  col = mix(col, uEarInner, inner);
  col = mix(col, uEarOuter, earOut);
  float mud = uMud * smoothstep(0.09, 0.05, p.y) * (0.6 + 0.4 * vn(p * 90.0));
  col = mix(col, vec3(0.30, 0.19, 0.1), clamp(mud, 0.0, 0.95));

  // cel shading
  vec3 N = normalize(vN);
  vec3 V = normalize(-vViewPos);
  vec3 L = normalize(uLight);
  float d = dot(N, L);
  float lit = edge(d - 0.12, 0.035);
  float hi = edge(d - 0.62, 0.03);
  vec3 shade = mix(mix(vec3(1.0), uShadowTint, 0.55), vec3(1.0), lit);
  shade += hi * vec3(0.07, 0.065, 0.05);
  float rim = edge(pow(1.0 - max(dot(N, V), 0.0), 2.0) - 0.62, 0.04) * 0.14 * (0.5 + 0.5 * lit);
  vec3 outc = col * shade + rim * vec3(1.0, 0.95, 0.9);
  gl_FragColor = vec4(outc, 1.0);
  #include <colorspace_fragment>
}
`;

export const outlineVertex = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
uniform float uThickness;
void main() {
  vec3 objectNormal = normal;
  vec3 transformed = position;
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <skinning_vertex>
  transformed += normalize(objectNormal) * uThickness;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}
`;

export const outlineFragment = /* glsl */ `
precision highp float;
uniform vec3 uColor;
void main() {
  gl_FragColor = vec4(uColor, 1.0);
  #include <colorspace_fragment>
}
`;
