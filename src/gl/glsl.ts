// GLSL sources. GPUComputationRenderer injects `resolution` and the
// texturePosition / textureVelocity samplers into the simulation shaders.

const noise = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

vec3 snoiseVec3(vec3 x) {
  return vec3(
    snoise(x),
    snoise(vec3(x.y - 19.1, x.z + 33.4, x.x + 47.2)),
    snoise(vec3(x.z + 74.2, x.x - 124.5, x.y + 99.4))
  );
}

vec3 curlNoise(vec3 p) {
  const float e = 0.1;
  vec3 dx = vec3(e, 0.0, 0.0);
  vec3 dy = vec3(0.0, e, 0.0);
  vec3 dz = vec3(0.0, 0.0, e);
  vec3 px0 = snoiseVec3(p - dx);
  vec3 px1 = snoiseVec3(p + dx);
  vec3 py0 = snoiseVec3(p - dy);
  vec3 py1 = snoiseVec3(p + dy);
  vec3 pz0 = snoiseVec3(p - dz);
  vec3 pz1 = snoiseVec3(p + dz);
  float x = py1.z - py0.z - pz1.y + pz0.y;
  float y = pz1.x - pz0.x - px1.z + px0.z;
  float z = px1.y - px0.y - py1.x + py0.x;
  return normalize(vec3(x, y, z) + 1e-5);
}
`

// Spring toward the active target + curl turbulence + repulsion from the pointer ray.
export const velocityShader = /* glsl */ `
uniform float uTime;
uniform float uDelta;
uniform sampler2D uTarget;
uniform float uSpin;
uniform float uSpring;
uniform float uDamping;
uniform float uTurbulence;
uniform vec3 uRayOrigin;
uniform vec3 uRayDir;
uniform float uMouseRadius;
uniform float uMouseForce;

${noise}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec3 pos = texture2D(texturePosition, uv).xyz;
  vec4 velData = texture2D(textureVelocity, uv);
  vec3 vel = velData.xyz;
  float seed = velData.w;

  vec4 tgt = texture2D(uTarget, uv);
  vec3 target = tgt.xyz;
  float tag = tgt.w;

  // Rings flow: rotate every target except the fixed white knots.
  if (uSpin > 0.0 && tag < 4.5) {
    float a = uTime * uSpin * (0.7 + seed * 0.6);
    float c = cos(a);
    float s = sin(a);
    target.xy = vec2(c * target.x - s * target.y, s * target.x + c * target.y);
  }

  vec3 acc = (target - pos) * uSpring * (0.55 + seed * 0.9);
  acc += curlNoise(pos * 0.42 + vec3(0.0, 0.0, uTime * 0.07)) * uTurbulence;

  vec3 w = pos - uRayOrigin;
  vec3 onRay = uRayOrigin + uRayDir * dot(w, uRayDir);
  vec3 away = pos - onRay;
  float d = length(away);
  float fall = 1.0 - smoothstep(0.0, uMouseRadius, d);
  acc += (away / max(d, 1e-3)) * fall * fall * uMouseForce;

  vel += acc * uDelta;
  vel *= exp(-uDamping * uDelta);
  float sp = length(vel);
  if (sp > 16.0) vel *= 16.0 / sp;

  gl_FragColor = vec4(vel, seed);
}
`

export const positionShader = /* glsl */ `
uniform float uDelta;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 p = texture2D(texturePosition, uv);
  vec3 v = texture2D(textureVelocity, uv).xyz;
  p.xyz += v * uDelta;
  gl_FragColor = p;
}
`

// Tags: 0 base (temperature) · 1 ice · 2 ember · 3 dim · 4 acid · 5 white
export const pointsVertex = /* glsl */ `
uniform sampler2D uPosition;
uniform sampler2D uVelocity;
uniform sampler2D uTarget;
uniform float uSize;
uniform float uPixelRatio;
uniform float uTime;
uniform float uDim;
uniform vec3 uCool;
uniform vec3 uHot;
uniform vec3 uIce;
uniform vec3 uEmber;
uniform vec3 uAcid;
uniform vec3 uWhite;

attribute vec2 aRef;
attribute float aRand;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec3 pos = texture2D(uPosition, aRef).xyz;
  vec3 vel = texture2D(uVelocity, aRef).xyz;
  float tag = texture2D(uTarget, aRef).w;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  float speed = length(vel);
  float heat = smoothstep(0.35, 4.5, speed);

  vec3 base = uCool;
  float alpha = 1.0;
  if (tag > 0.5 && tag < 1.5) base = uIce;
  else if (tag > 1.5 && tag < 2.5) {
    base = uEmber;
    // current pulses travelling along energized segments
    alpha *= 0.55 + 0.9 * pow(0.5 + 0.5 * sin(pos.x * 2.6 - uTime * 3.2 + pos.y * 3.0), 6.0);
  }
  else if (tag > 2.5 && tag < 3.5) { base = uCool; alpha = 0.16; }
  else if (tag > 3.5 && tag < 4.5) base = uAcid;
  else if (tag > 4.5) base = uWhite;

  vec3 col = mix(base, uHot, heat * 0.85);
  alpha *= 0.7 + 0.3 * sin(uTime * (0.8 + aRand * 2.2) + aRand * 40.0);

  vColor = col;
  vAlpha = alpha * uDim;
  float size = uSize * (0.5 + aRand * 0.95) * (1.0 + heat * 0.5);
  gl_PointSize = size * uPixelRatio * (10.0 / max(-mv.z, 0.5));
}
`

export const pointsFragment = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d);
  a *= a;
  gl_FragColor = vec4(vColor * a * vAlpha, a * vAlpha);
}
`

export const backdropVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}
`

// Soft nebula glow behind the active shape + fine film grain.
export const backdropFragment = /* glsl */ `
uniform vec2 uCenter;
uniform vec3 uGlow;
uniform float uAspect;
uniform float uTime;
uniform float uStrength;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

// Values are linear; the composer converts to sRGB, so #05060a ≈ vec3(0.0015, 0.0018, 0.0032).
void main() {
  vec2 p = vUv - uCenter;
  p.x *= uAspect;
  float r = length(p);
  vec3 col = vec3(0.0015, 0.0018, 0.0032);
  col += uGlow * 0.016 * uStrength * exp(-r * r * 2.6);
  col += vec3(0.003, 0.0036, 0.007) * exp(-pow(vUv.y - 1.1, 2.0) * 6.0);
  col += (hash(vUv * 900.0 + uTime) - 0.5) * 0.0012;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`
