// Cel-shaded body + inverted-hull outline for the skinned cat.

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
uniform vec3 uBlush;
uniform vec3 uShadowTint;
uniform float uPattern;
uniform float uWhiteAmount;
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

  // bold tabby markings
  float s = sin(p.x * 78.0 + warp * 2.2 + ang * 0.5);
  float stripe = edge(s - 0.1, 0.05) * smoothstep(-0.3, 0.45, up) * torso;
  stripe = max(stripe, edge(sin(p.x * 66.0 - 0.4) - 0.15, 0.06) * tail);                  // tail rings
  stripe = max(stripe, edge(-0.445 - p.x, 0.012) * tail);                                  // dark tail tip
  stripe = max(stripe, edge(sin(p.y * 150.0 + warp) - 0.25, 0.06) * legs * smoothstep(0.045, 0.07, p.y) * smoothstep(0.1, 0.12, abs(p.z) * 0.0 + 0.11));
  // forehead "M" stripes
  float fore = edge(sin(p.z * 150.0) - 0.45, 0.07) * head * smoothstep(0.35, 0.6, up) * smoothstep(0.405, 0.36, p.x) * smoothstep(0.31, 0.345, p.x);
  stripe = max(stripe, fore);
  // cheek stripes
  float cheek = edge(sin((p.y - 0.28) * 190.0 + p.x * 30.0) - 0.55, 0.07) * head * smoothstep(0.045, 0.06, abs(p.z)) * smoothstep(0.37, 0.34, p.x) * (1.0 - smoothstep(0.1, 0.5, up));
  stripe = max(stripe, cheek);

  // white areas: belly, chest bib, socks, muzzle
  float bib = smoothstep(0.1, 0.13, p.x) * smoothstep(0.235, 0.2, p.y) * smoothstep(0.065, 0.045, abs(p.z)) * (1.0 - head);
  float belly = smoothstep(-0.5, -0.8, up) * torso;
  float socks = smoothstep(0.055, 0.045, p.y) * legs;
  float muzzle = smoothstep(0.358, 0.372, p.x) * smoothstep(0.31, 0.29, p.y) * smoothstep(0.045, 0.03, abs(p.z) - 0.0);
  float white = max(max(bib, belly), max(socks, muzzle)) * uWhiteAmount;

  float inner = smoothstep(0.12, 0.5, vRestN.x) * smoothstep(0.37, 0.385, p.y) * smoothstep(0.34, 0.3, p.x) * head;

  vec3 col = mix(uBase, uStripe, stripe * uPattern);
  col = mix(col, uWhite, white);
  col = mix(col, uEarInner, inner);
  // rosy cheeks
  float blush = smoothstep(0.02, 0.0, length(vec2(p.x - 0.372, (p.y - 0.285) * 1.4)) - 0.0) * 0.0;
  // mud on the paws
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
