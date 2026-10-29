import {
  BackSide,
  BufferGeometry,
  ClampToEdgeWrapping,
  Float32BufferAttribute,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three'

/** Low evening sun, a little left of the throw lane: the glitter path runs toward it. */
export const SUN_DIR = new Vector3(-0.38, 0.055, -1).normalize()

const f = (n: number) => n.toFixed(6)

// ── Swell: a few Gerstner waves, shared by the GPU surface and the CPU buoyancy ──
const WAVES = [
  { dir: [0.28, 0.96], length: 11, amp: 0.13, steep: 0.55, phase: 0.0 },
  { dir: [-0.42, 0.91], length: 6.5, amp: 0.08, steep: 0.5, phase: 1.7 },
  { dir: [0.8, 0.6], length: 3.8, amp: 0.045, steep: 0.45, phase: 4.1 },
  { dir: [-0.15, 0.99], length: 2.3, amp: 0.025, steep: 0.4, phase: 2.6 },
].map((w) => {
  const len = Math.hypot(w.dir[0], w.dir[1])
  const k = (Math.PI * 2) / w.length
  return {
    dx: w.dir[0] / len,
    dz: w.dir[1] / len,
    k,
    omega: Math.sqrt(9.8 * k),
    amp: w.amp,
    q: w.steep / (k * w.amp * 4),
    phase: w.phase,
  }
})

const GERSTNER_GLSL = /* glsl */ `
vec3 gerstner(vec2 p, float t, out vec3 n) {
  vec3 off = vec3(0.0);
  vec3 s = vec3(0.0);
  ${WAVES.map(
    (w) => `{
    float th = ${f(w.k)} * dot(vec2(${f(w.dx)}, ${f(w.dz)}), p) - ${f(w.omega)} * t + ${f(w.phase)};
    float c = cos(th);
    float sn = sin(th);
    off += vec3(${f(w.q * w.amp * w.dx)} * c, ${f(w.amp)} * sn, ${f(w.q * w.amp * w.dz)} * c);
    s += vec3(${f(w.dx * w.k * w.amp)} * c, ${f(w.q * w.k * w.amp)} * sn, ${f(w.dz * w.k * w.amp)} * c);
  }`,
  ).join('\n')}
  n = normalize(vec3(-s.x, 1.0 - s.y, -s.z));
  return off;
}`

function offset(x: number, z: number, t: number) {
  let ox = 0
  let oy = 0
  let oz = 0
  for (const w of WAVES) {
    const th = w.k * (w.dx * x + w.dz * z) - w.omega * t + w.phase
    const c = Math.cos(th)
    ox += w.q * w.amp * w.dx * c
    oy += w.amp * Math.sin(th)
    oz += w.q * w.amp * w.dz * c
  }
  return { ox, oy, oz }
}

/** Surface height at a world point: two fixed-point steps undo the waves' horizontal shift. */
export function heightAt(x: number, z: number, t: number) {
  let px = x
  let pz = z
  for (let i = 0; i < 2; i++) {
    const o = offset(px, pz, t)
    px = x - o.ox
    pz = z - o.oz
  }
  return offset(px, pz, t).oy
}

// ── Sky: one function for the dome, the environment map and the sea's reflection ──
export const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir;
vec3 skyColor(vec3 d) {
  float y = d.y;
  float h = max(y, 0.0);
  vec3 col = mix(vec3(0.95, 0.34, 0.26), vec3(0.3, 0.09, 0.22), smoothstep(0.0, 0.06, h));
  col = mix(col, vec3(0.055, 0.03, 0.13), smoothstep(0.04, 0.24, h));
  col = mix(col, vec3(0.005, 0.007, 0.03), smoothstep(0.2, 0.7, h));
  float s = max(dot(d, uSunDir), 0.0);
  col += vec3(1.5, 0.6, 0.3) * (pow(s, 9.0) * 0.16 + pow(s, 80.0) * 0.55);
  col += vec3(9.0, 5.2, 3.0) * smoothstep(0.99975, 0.99988, s);
  col = mix(col, vec3(0.5, 0.2, 0.2), smoothstep(0.0, -0.25, y));
  return col;
}`

function skyMaterial(stars: boolean) {
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: { uSunDir: { value: SUN_DIR }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vDir;
      ${SKY_GLSL}
      float hash3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = skyColor(d);
        ${
          stars
            ? `vec3 p = d * 260.0;
        vec3 cell = floor(p);
        float r = hash3(cell);
        if (r > 0.9965) {
          float star = smoothstep(0.32, 0.0, length(fract(p) - 0.5));
          float tw = 0.55 + 0.45 * sin(uTime * (1.5 + r * 3.0) + r * 90.0);
          col += vec3(1.0, 0.94, 0.9) * star * tw * smoothstep(0.12, 0.45, d.y) * 2.2;
        }`
            : ''
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
}

export function skyDome(radius: number, stars: boolean) {
  const mesh = new Mesh(new SphereGeometry(radius, 48, 24), skyMaterial(stars))
  mesh.renderOrder = -1
  mesh.frustumCulled = false
  return mesh
}

// ── Ripples: a damped wave equation on a float texture that travels with the jelly ──
const MAX_DROPS = 16
const QUAD_VS = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`

export class RippleSim {
  readonly rect: Vector4
  readonly texel: Vector2
  readonly worldTexel: number
  private center = new Vector2()
  private size: number
  private a: WebGLRenderTarget
  private b: WebGLRenderTarget
  private scene = new Scene()
  private quad: Mesh
  private cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private stepMat: ShaderMaterial
  private shiftMat: ShaderMaterial
  private drops: Vector4[] = []
  private acc = 0

  /** A `size` x `size` metre window; it scrolls in whole texels so the water under the jelly is always simulated. */
  constructor(
    private renderer: WebGLRenderer,
    size: number,
    texelSize: number,
  ) {
    const n = Math.round(size / texelSize)
    this.size = n * texelSize
    this.rect = new Vector4(-this.size / 2, -this.size / 2, this.size, this.size)
    this.texel = new Vector2(1 / n, 1 / n)
    this.worldTexel = texelSize
    const opts = {
      type: HalfFloatType,
      format: RGBAFormat,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      wrapS: ClampToEdgeWrapping,
      wrapT: ClampToEdgeWrapping,
      depthBuffer: false,
    }
    this.a = new WebGLRenderTarget(n, n, opts)
    this.b = new WebGLRenderTarget(n, n, opts)
    // Same speed in metres per second whatever the resolution: coupling scales with texel area.
    const coupling = 0.4 * (0.125 / texelSize) ** 2
    this.stepMat = new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uState: { value: null },
        uTexel: { value: this.texel },
        uRect: { value: this.rect },
        uDrops: { value: Array.from({ length: MAX_DROPS }, () => new Vector4()) },
        uDropCount: { value: 0 },
        uCoupling: { value: Math.min(coupling, 1.6) },
      },
      vertexShader: QUAD_VS,
      fragmentShader: /* glsl */ `
        uniform sampler2D uState;
        uniform vec2 uTexel;
        uniform vec4 uRect;
        uniform vec4 uDrops[${MAX_DROPS}];
        uniform int uDropCount;
        uniform float uCoupling;
        varying vec2 vUv;
        void main() {
          vec4 c = texture2D(uState, vUv);
          float avg = (
            texture2D(uState, vUv - vec2(uTexel.x, 0.0)).r + texture2D(uState, vUv + vec2(uTexel.x, 0.0)).r +
            texture2D(uState, vUv - vec2(0.0, uTexel.y)).r + texture2D(uState, vUv + vec2(0.0, uTexel.y)).r
          ) * 0.25;
          c.g += (avg - c.r) * uCoupling;
          c.g *= 0.991;
          c.r += c.g;
          c.r *= 0.998;
          vec2 world = uRect.xy + vUv * uRect.zw;
          for (int i = 0; i < ${MAX_DROPS}; i++) {
            if (i >= uDropCount) break;
            vec4 d = uDrops[i];
            float x = 1.0 - length(world - d.xy) / d.z;
            if (x > 0.0) c.r += d.w * (0.5 - 0.5 * cos(x * 3.14159265));
          }
          float e = smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.96, vUv.x) * smoothstep(0.0, 0.04, vUv.y) * smoothstep(1.0, 0.96, vUv.y);
          c.rg *= mix(0.85, 1.0, e);
          gl_FragColor = vec4(c.rg, 0.0, 1.0);
        }`,
    })
    this.shiftMat = new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: { uState: { value: null }, uShift: { value: new Vector2() } },
      vertexShader: QUAD_VS,
      fragmentShader: /* glsl */ `
        uniform sampler2D uState;
        uniform vec2 uShift;
        varying vec2 vUv;
        void main() {
          vec2 src = vUv + uShift;
          bool inside = src.x >= 0.0 && src.x <= 1.0 && src.y >= 0.0 && src.y <= 1.0;
          gl_FragColor = inside ? texture2D(uState, src) : vec4(0.0);
        }`,
    })
    this.quad = new Mesh(new PlaneGeometry(2, 2), this.stepMat)
    this.quad.frustumCulled = false
    this.scene.add(this.quad)
    const prev = renderer.getRenderTarget()
    for (const rt of [this.a, this.b]) {
      renderer.setRenderTarget(rt)
      renderer.setClearColor(0x000000, 0)
      renderer.clear()
    }
    renderer.setRenderTarget(prev)
  }

  get texture() {
    return this.a.texture
  }

  /** A disturbance of `strength` metres spread over `radius` metres; negative pushes water down. */
  drop(x: number, z: number, radius: number, strength: number) {
    const [mx, mz, sx, sz] = [this.rect.x, this.rect.y, this.rect.z, this.rect.w]
    if (x < mx || x > mx + sx || z < mz || z > mz + sz) return
    if (this.drops.length < MAX_DROPS) this.drops.push(new Vector4(x, z, Math.max(radius, this.worldTexel * 1.5), strength))
  }

  /** Re-centre the window on (x, z) once the jelly drifts away from the middle. */
  follow(x: number, z: number) {
    const dx = x - this.center.x
    const dz = z - this.center.y
    const limit = this.size * 0.12
    if (Math.abs(dx) < limit && Math.abs(dz) < limit) return
    const sx = Math.round(dx / this.worldTexel) * this.worldTexel
    const sz = Math.round(dz / this.worldTexel) * this.worldTexel
    this.shiftMat.uniforms.uShift.value.set(sx / this.size, sz / this.size)
    this.run(this.shiftMat)
    this.center.x += sx
    this.center.y += sz
    this.rect.x = this.center.x - this.size / 2
    this.rect.y = this.center.y - this.size / 2
  }

  update(dt: number) {
    this.acc = Math.min(this.acc + dt, 0.1)
    let steps = 0
    while (this.acc >= 1 / 60 && steps < 4) {
      const u = this.stepMat.uniforms
      const list = u.uDrops.value as Vector4[]
      this.drops.forEach((d, i) => list[i].copy(d))
      u.uDropCount.value = this.drops.length
      this.drops = []
      this.run(this.stepMat)
      this.acc -= 1 / 60
      steps++
    }
  }

  /** One full-screen pass from the current state into the other target, then swap. */
  private run(mat: ShaderMaterial) {
    mat.uniforms.uState.value = this.a.texture
    this.quad.material = mat
    const prev = this.renderer.getRenderTarget()
    this.renderer.setRenderTarget(this.b)
    this.renderer.render(this.scene, this.cam)
    this.renderer.setRenderTarget(prev)
    ;[this.a, this.b] = [this.b, this.a]
  }
}

// ── Sea surface ──
/** A grid whose spacing is fine around the play area and coarse toward the horizon. */
function seaGeometry(segments: number, size: number) {
  const plane = new PlaneGeometry(2, 2, segments, segments)
  const src = plane.attributes.position
  const pos: number[] = []
  const warp = (u: number) => size * u * (0.07 + 0.93 * Math.abs(u))
  for (let i = 0; i < src.count; i++) {
    pos.push(warp(src.getX(i)), 0, -warp(src.getY(i)))
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setIndex(plane.index)
  plane.dispose()
  return g
}

export class Ocean {
  readonly mesh: Mesh
  readonly material: ShaderMaterial

  constructor(
    readonly ripples: RippleSim | null,
    segments: number,
  ) {
    this.material = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: SUN_DIR },
        uRipple: { value: ripples?.texture ?? null },
        uRippleOn: { value: ripples ? 1 : 0 },
        uRippleRect: { value: ripples?.rect ?? new Vector4(0, 0, 1, 1) },
        uRippleTexel: { value: ripples?.texel ?? new Vector2(1, 1) },
        uRippleWorldTexel: { value: ripples?.worldTexel ?? 1 },
        uJelly: { value: new Vector3() },
        uOrigin: { value: new Vector2() },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform vec2 uOrigin;
        varying vec3 vWorld;
        varying vec2 vBase;
        varying float vHeight;
        ${GERSTNER_GLSL}
        void main() {
          vec3 n;
          vec2 base = position.xz + uOrigin;
          vec3 off = gerstner(base, uTime, n);
          vec3 p = vec3(base.x, 0.0, base.y) + off;
          vWorld = p;
          vBase = base;
          vHeight = off.y;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform sampler2D uRipple;
        uniform float uRippleOn;
        uniform vec4 uRippleRect;
        uniform vec2 uRippleTexel;
        uniform float uRippleWorldTexel;
        uniform vec3 uJelly;
        varying vec3 vWorld;
        varying vec2 vBase;
        varying float vHeight;
        ${GERSTNER_GLSL}
        ${SKY_GLSL}
        float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) {
          vec2 i = floor(p);
          vec2 q = fract(p);
          q = q * q * (3.0 - 2.0 * q);
          return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), q.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), q.x), q.y);
        }
        vec2 microSlope(vec2 p, float t) {
          vec2 s = vec2(0.0);
          s += vec2(0.62, 0.78) * cos(dot(p, vec2(0.62, 0.78)) * 4.1 + t * 2.1) * 0.5;
          s += vec2(-0.71, 0.70) * cos(dot(p, vec2(-0.71, 0.70)) * 5.3 + t * 2.6) * 0.42;
          s += vec2(0.93, -0.37) * cos(dot(p, vec2(0.93, -0.37)) * 7.7 - t * 3.1) * 0.33;
          s += vec2(-0.2, -0.98) * cos(dot(p, vec2(-0.2, -0.98)) * 9.9 + t * 3.7) * 0.27;
          s += vec2(0.45, 0.89) * cos(dot(p, vec2(0.45, 0.89)) * 13.7 - t * 4.3) * 0.2;
          s += vec2(-0.87, -0.5) * cos(dot(p, vec2(-0.87, -0.5)) * 17.9 + t * 5.0) * 0.16;
          return s;
        }
        void main() {
          vec3 n;
          gerstner(vBase, uTime, n);
          vec3 toCam = cameraPosition - vWorld;
          float dist = length(toCam);
          vec3 v = toCam / dist;

          float rh = 0.0;
          float rv = 0.0;
          if (uRippleOn > 0.5) {
            vec2 ruv = (vWorld.xz - uRippleRect.xy) / uRippleRect.zw;
            if (ruv.x > 0.0 && ruv.x < 1.0 && ruv.y > 0.0 && ruv.y < 1.0) {
              vec4 s = texture2D(uRipple, ruv);
              float hx = texture2D(uRipple, ruv + vec2(uRippleTexel.x, 0.0)).r - texture2D(uRipple, ruv - vec2(uRippleTexel.x, 0.0)).r;
              float hz = texture2D(uRipple, ruv + vec2(0.0, uRippleTexel.y)).r - texture2D(uRipple, ruv - vec2(0.0, uRippleTexel.y)).r;
              vec2 slope = vec2(hx, hz) / (2.0 * uRippleWorldTexel);
              n = normalize(n + vec3(-slope.x, 0.0, -slope.y) * 3.0);
              rh = s.r;
              rv = s.g;
            }
          }
          vec2 ms = microSlope(vWorld.xz, uTime) * 0.05 * smoothstep(70.0, 8.0, dist);
          n = normalize(n + vec3(-ms.x, 0.0, -ms.y));

          vec3 r = reflect(-v, n);
          r.y = abs(r.y);
          vec3 refl = skyColor(r);
          float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
          vec3 deep = vec3(0.004, 0.026, 0.06);
          vec3 shallow = vec3(0.02, 0.16, 0.2);
          vec3 body = mix(deep, shallow, clamp(vHeight * 2.4 + 0.45, 0.0, 1.0));
          float sss = pow(max(dot(-v, uSunDir) * 0.5 + 0.5, 0.0), 4.0) * clamp(vHeight * 3.0 + 0.35, 0.0, 1.0);
          body += vec3(0.04, 0.24, 0.2) * sss * 0.7;
          vec3 col = mix(body, refl, fres);
          col += vec3(6.0, 3.6, 2.2) * pow(max(dot(r, uSunDir), 0.0), 700.0);

          float foam = smoothstep(0.012, 0.05, abs(rv) * 4.0 + max(rh, 0.0) * 1.6);
          foam *= smoothstep(0.35, 0.75, vnoise(vWorld.xz * 7.0 + vec2(uTime * 0.4, 0.0)) * 0.6 + foam * 0.5);
          col = mix(col, vec3(0.85, 0.93, 1.0), foam * 0.75);

          vec2 jd = vWorld.xz - uJelly.xz;
          float near = exp(-dot(jd, jd) * 1.1) * (1.0 - smoothstep(0.2, 1.8, uJelly.y - vWorld.y));
          col += vec3(1.0, 0.22, 0.52) * near * 0.22;

          vec3 fogDir = normalize(vec3(-v.x, 0.0, -v.z));
          col = mix(col, skyColor(fogDir), smoothstep(40.0, 150.0, dist));
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
    this.mesh = new Mesh(seaGeometry(segments, 320), this.material)
    this.mesh.frustumCulled = false
  }

  /** `center` is where the dense part of the grid should sit (just ahead of the camera). */
  update(dt: number, t: number, jelly: Vector3, center: Vector3) {
    this.ripples?.follow(jelly.x, jelly.z)
    this.ripples?.update(dt)
    const u = this.material.uniforms
    u.uTime.value = t
    u.uJelly.value.copy(jelly)
    u.uOrigin.value.set(Math.round(center.x), Math.round(center.z))
    if (this.ripples) u.uRipple.value = this.ripples.texture
  }
}
