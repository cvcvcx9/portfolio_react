import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  QuadraticBezierCurve3,
  ShaderMaterial,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three'

// ── A gate on the course: two posts hung with paper lanterns, a string of lights across their tops, a curtain of light between ──
/** Half the gap between the posts, and their height. */
export const GATE_HALF = 2.9
export const GATE_H = 4.6

const dummy = new Object3D()
const POST = new CylinderGeometry(0.05, 0.08, GATE_H, 8).translate(0, GATE_H / 2, 0)
const LAMP = new CylinderGeometry(0.26, 0.26, 0.46, 4).rotateY(Math.PI / 4)
const LAMP_YS = [1.4, 2.5, 3.6]
// Sags half a metre in the middle.
const ROPE = new QuadraticBezierCurve3(new Vector3(-GATE_HALF, GATE_H - 0.1, 0), new Vector3(0, GATE_H - 1.1, 0), new Vector3(GATE_HALF, GATE_H - 0.1, 0))
const ROPE_GEO = new TubeGeometry(ROPE, 24, 0.018, 5)
const BEAD = new SphereGeometry(0.08, 10, 8)
const BEADS = 9
const CURTAIN_H = GATE_H - 0.4
const CURTAIN = new PlaneGeometry(GATE_HALF * 2, CURTAIN_H).translate(0, CURTAIN_H / 2, 0)

export class LanternGate {
  readonly root = new Group()
  private wood = new MeshBasicMaterial({ color: '#2b160c', transparent: true, opacity: 0 })
  private glow = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  // Warm paper light, like the lanterns floating on the sea.
  private paper = new MeshBasicMaterial({ color: new Color(2.6, 1.7, 1), transparent: true, opacity: 0, depthWrite: false })
  // Brightest just above the water, with shimmering streaks drifting up.
  private curtain = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    uniforms: { uColor: { value: new Color() }, uOpacity: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        float sides = smoothstep(0.0, 0.06, vUv.x) * smoothstep(0.0, 0.06, 1.0 - vUv.x);
        // max(): pow of a value a hair below zero is NaN, and bloom would spread it over the whole screen.
        float low = pow(max(1.0 - vUv.y, 0.0), 1.8);
        float streaks = 0.6 + 0.4 * sin(vUv.x * 70.0 + sin(vUv.x * 11.0 + uTime) * 2.0);
        float drift = 0.75 + 0.25 * sin(vUv.y * 9.0 - uTime * 2.5 + vUv.x * 4.0);
        gl_FragColor = vec4(uColor, (0.05 + 0.45 * low) * streaks * drift * sides * uOpacity);
      }`,
  })
  private lamps: Mesh[] = []
  private beads = new InstancedMesh(BEAD, this.glow, BEADS)

  constructor() {
    for (const side of [-1, 1]) {
      const post = new Mesh(POST, this.wood)
      post.position.x = side * GATE_HALF
      this.root.add(post)
      for (const y of LAMP_YS) {
        const lamp = new Mesh(LAMP, this.paper)
        lamp.position.set(side * GATE_HALF, y, 0)
        this.lamps.push(lamp)
        this.root.add(lamp)
      }
    }
    for (let i = 0; i < BEADS; i++) {
      dummy.position.copy(ROPE.getPoint((i + 0.5) / BEADS))
      dummy.position.y -= 0.12
      dummy.updateMatrix()
      this.beads.setMatrixAt(i, dummy.matrix)
    }
    this.root.add(new Mesh(ROPE_GEO, this.wood), this.beads, new Mesh(CURTAIN, this.curtain))
  }

  /** A crossing `lat` metres to the side and `y` metres up goes through: between the posts, under the string. */
  static passes(lat: number, y: number) {
    return Math.abs(lat) < GATE_HALF - 0.45 && y < CURTAIN_H
  }

  /** A point on the outline, `u` 0–1, in the gate's frame: up the left post, along the string, down the right post. */
  static outline(u: number, out: Vector3) {
    if (u < 0.3) return out.set(-GATE_HALF, 0.4 + (u / 0.3) * (GATE_H - 0.6), 0)
    if (u > 0.7) return out.set(GATE_HALF, GATE_H - 0.2 - ((u - 0.7) / 0.3) * (GATE_H - 0.6), 0)
    return ROPE.getPoint((u - 0.3) / 0.4, out)
  }

  /** The string and the curtain take `color` (may be HDR); the lanterns keep their paper glow. */
  paint(color: Color, opacity: number) {
    this.glow.color.copy(color)
    this.glow.opacity = opacity
    this.paper.opacity = opacity
    this.wood.opacity = opacity
    this.curtain.uniforms.uColor.value.copy(color).multiplyScalar(0.5)
    this.curtain.uniforms.uOpacity.value = opacity
  }

  tick(t: number) {
    this.curtain.uniforms.uTime.value = t
    this.lamps.forEach((l, i) => (l.rotation.z = Math.sin(t * 1.6 + i) * 0.06))
  }

  dispose() {
    this.wood.dispose()
    this.glow.dispose()
    this.paper.dispose()
    this.curtain.dispose()
    this.beads.dispose()
  }
}
