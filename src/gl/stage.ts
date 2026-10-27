import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  FloatType,
  Group,
  HalfFloatType,
  Matrix4,
  Mesh,
  NearestFilter,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  RGBAFormat,
  Raycaster,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { GPUComputationRenderer, type Variable } from 'three/addons/misc/GPUComputationRenderer.js'
import { BloomEffect, EffectComposer, EffectPass, NoiseEffect, RenderPass, VignetteEffect, BlendFunction } from 'postprocessing'
import { backdropFragment, backdropVertex, pointsFragment, pointsVertex, positionShader, velocityShader } from './glsl'
import { buildShapes, burst, type Shape, type ShapeName } from './shapes'
import { Labels } from './labels'

export type Side = 'left' | 'right' | 'center'

export interface StageOptions {
  canvas: HTMLCanvasElement
  labelsRoot: HTMLElement
  reducedMotion: boolean
  lowPower: boolean
}

export interface StageInfo {
  particles: number
  shape: ShapeName
  entropy: number
  /** true while the particle field is the subject of the screen (not a backdrop behind panels) */
  focus: boolean
}

const damp = (a: number, b: number, lambda: number, dt: number) => a + (b - a) * (1 - Math.exp(-lambda * dt))

export class Stage {
  readonly count: number
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new PerspectiveCamera(35, 1, 0.1, 100)
  private composer: EffectComposer
  private gpu: GPUComputationRenderer
  private posVar: Variable
  private velVar: Variable
  private group = new Group()
  private points: Points
  private pointsMat: ShaderMaterial
  private backdropMat: ShaderMaterial
  private shapes: Record<ShapeName, Shape>
  private textures = {} as Record<ShapeName, DataTexture>
  private labels: Labels

  private shape: ShapeName = 'planet'
  private scrollShape: ShapeName = 'planet'
  private side: Side = 'right'
  private dimTarget = 1
  private dimNarrow = 0.85
  private dim = 0
  private pulse = 0
  private scrollVelocity = 0
  private pointer = new Vector2(0, 0)
  private pointerSmooth = new Vector2(0, 0)
  private pointerActive = 0
  private hasPointer = false
  private spinAngle = 0
  private time = 0
  private halfW = 5
  private halfH = 3
  private width = 1
  private height = 1
  private pixelRatio = 1
  private slowFrames = 0
  private frames = 0
  private entropy = 0
  private labelsEnabled = true
  private glow = new Color(0.43, 0.89, 1.0)
  private glowTarget = new Color(0.43, 0.89, 1.0)
  private raycaster = new Raycaster()
  private inv = new Matrix4()
  private rayOrigin = new Vector3()
  private rayDir = new Vector3()
  private tmp = new Vector3()

  constructor(private opts: StageOptions) {
    const { canvas, reducedMotion, lowPower } = opts
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: false,
    })
    if (!this.renderer.capabilities.isWebGL2) throw new Error('WebGL2 unavailable')
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.setClearColor(0x05060a, 1)

    const size = lowPower ? 128 : 256
    this.count = size * size
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 1.75)
    this.renderer.setPixelRatio(this.pixelRatio)

    this.shapes = buildShapes(this.count)
    for (const name of Object.keys(this.shapes) as ShapeName[]) {
      const tex = new DataTexture(this.shapes[name].data, size, size, RGBAFormat, FloatType)
      tex.minFilter = NearestFilter
      tex.magFilter = NearestFilter
      tex.needsUpdate = true
      this.textures[name] = tex
    }

    // ── GPGPU simulation ──
    this.gpu = new GPUComputationRenderer(size, size, this.renderer)
    if (!this.renderer.extensions.has('EXT_color_buffer_float')) this.gpu.setDataType(HalfFloatType)
    const pos0 = this.gpu.createTexture()
    const vel0 = this.gpu.createTexture()
    const posArr = pos0.image.data as Float32Array
    const velArr = vel0.image.data as Float32Array
    if (reducedMotion) {
      posArr.set(this.shapes.planet.data)
      for (let i = 0; i < this.count; i++) velArr[i * 4 + 3] = Math.random()
    } else {
      const b = burst(this.count)
      posArr.set(b.pos)
      velArr.set(b.vel)
    }
    this.velVar = this.gpu.addVariable('textureVelocity', velocityShader, vel0)
    this.posVar = this.gpu.addVariable('texturePosition', positionShader, pos0)
    this.gpu.setVariableDependencies(this.velVar, [this.posVar, this.velVar])
    this.gpu.setVariableDependencies(this.posVar, [this.posVar, this.velVar])
    Object.assign(this.velVar.material.uniforms, {
      uTime: { value: 0 },
      uDelta: { value: 0 },
      uTarget: { value: this.textures.planet },
      uSpin: { value: 0 },
      uSpring: { value: reducedMotion ? 11 : 7.2 },
      uDamping: { value: reducedMotion ? 7 : 3.7 },
      uTurbulence: { value: 0.3 },
      uRayOrigin: { value: new Vector3(0, 0, 100) },
      uRayDir: { value: new Vector3(0, 0, -1) },
      uMouseRadius: { value: 0.6 },
      uMouseForce: { value: 0 },
    })
    Object.assign(this.posVar.material.uniforms, { uDelta: { value: 0 } })
    const err = this.gpu.init()
    if (err) throw new Error(err)

    // ── Points ──
    const geo = new BufferGeometry()
    const ref = new Float32Array(this.count * 2)
    const rand = new Float32Array(this.count)
    for (let i = 0; i < this.count; i++) {
      ref[i * 2] = ((i % size) + 0.5) / size
      ref[i * 2 + 1] = (Math.floor(i / size) + 0.5) / size
      rand[i] = Math.random()
    }
    geo.setAttribute('position', new BufferAttribute(new Float32Array(this.count * 3), 3))
    geo.setAttribute('aRef', new BufferAttribute(ref, 2))
    geo.setAttribute('aRand', new BufferAttribute(rand, 1))
    this.pointsMat = new ShaderMaterial({
      vertexShader: pointsVertex,
      fragmentShader: pointsFragment,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending,
      uniforms: {
        uPosition: { value: null },
        uVelocity: { value: null },
        uTarget: { value: this.textures.planet },
        uSize: { value: lowPower ? 2.2 : 1.75 },
        uPixelRatio: { value: this.pixelRatio },
        uTime: { value: 0 },
        uDim: { value: 0 },
        uCool: { value: new Color('#8ea6ff') },
        uHot: { value: new Color('#ff7a45') },
        uIce: { value: new Color('#6fe3ff') },
        uEmber: { value: new Color('#ff5530') },
        uAcid: { value: new Color('#c8ff4a') },
        uWhite: { value: new Color('#f4f1ea') },
      },
    })
    this.points = new Points(geo, this.pointsMat)
    this.points.frustumCulled = false
    this.group.add(this.points)
    this.scene.add(this.group)

    // ── Backdrop ──
    this.backdropMat = new ShaderMaterial({
      vertexShader: backdropVertex,
      fragmentShader: backdropFragment,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uCenter: { value: new Vector2(0.68, 0.5) },
        uGlow: { value: this.glow },
        uAspect: { value: 1 },
        uTime: { value: 0 },
        uStrength: { value: 1 },
      },
    })
    const backdrop = new Mesh(new PlaneGeometry(2, 2), this.backdropMat)
    backdrop.frustumCulled = false
    backdrop.renderOrder = -1
    this.scene.add(backdrop)

    this.camera.position.set(0, 0, 9.5)

    // ── Post ──
    this.composer = new EffectComposer(this.renderer, { frameBufferType: HalfFloatType })
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    const bloom = new BloomEffect({
      mipmapBlur: true,
      luminanceThreshold: 0.18,
      luminanceSmoothing: 0.3,
      intensity: lowPower ? 0.9 : 1.05,
      radius: 0.7,
    })
    const vignette = new VignetteEffect({ offset: 0.28, darkness: 0.62 })
    const noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false })
    noise.blendMode.opacity.value = 0.06
    this.composer.addPass(new EffectPass(this.camera, bloom, vignette, noise))

    this.labels = new Labels(opts.labelsRoot)
    this.resize()
  }

  /**
   * Move the field to a shape. Each switch adds a burst of turbulence so the morph reads as entropy → order.
   * `dimNarrow` is the brightness on narrow screens, where text always sits on top of the field.
   */
  setShape(name: ShapeName, side: Side = this.side, dim = this.dimTarget, dimNarrow = 0.4) {
    this.scrollShape = name
    this.side = side
    this.dimTarget = dim
    this.dimNarrow = dimNarrow
    this.applyShape(name)
  }

  /** Hero hover: temporarily show another shape, `null` returns to the scroll shape. */
  preview(name: ShapeName | null) {
    this.applyShape(name ?? this.scrollShape)
  }

  private applyShape(name: ShapeName) {
    if (name === this.shape) return
    this.shape = name
    const shape = this.shapes[name]
    const tex = this.textures[name]
    this.velVar.material.uniforms.uTarget.value = tex
    this.velVar.material.uniforms.uSpin.value = shape.spin
    this.pointsMat.uniforms.uTarget.value = tex
    this.glowTarget.setRGB(...shape.glow)
    if (!this.opts.reducedMotion) this.pulse = Math.max(this.pulse, 2.4)
    this.labels.set(shape.anchors, this.opts.reducedMotion ? 150 : 900)
  }

  setScrollVelocity(v: number) {
    this.scrollVelocity = v
  }

  setPointer(clientX: number, clientY: number) {
    this.pointer.set((clientX / this.width) * 2 - 1, -(clientY / this.height) * 2 + 1)
    this.pointerActive = 1
    this.hasPointer = true
  }

  setLabelsEnabled(v: boolean) {
    this.labelsEnabled = v
  }

  highlightLabel(index: number) {
    this.labels.highlight(index)
  }

  get activeShape(): ShapeName {
    return this.shape
  }

  info(): StageInfo {
    return { particles: this.count, shape: this.shape, entropy: this.entropy, focus: this.dimTarget >= 0.8 }
  }

  resize() {
    const canvas = this.opts.canvas
    const w = canvas.clientWidth || window.innerWidth
    const h = canvas.clientHeight || window.innerHeight
    this.width = w
    this.height = h
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setPixelRatio(this.pixelRatio)
    this.composer.setSize(w, h, false)
    this.pointsMat.uniforms.uPixelRatio.value = this.pixelRatio
    this.backdropMat.uniforms.uAspect.value = w / h
    this.halfH = Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.position.z
    this.halfW = this.halfH * this.camera.aspect
  }

  update(dt: number) {
    dt = Math.min(dt, 1 / 30)
    if (dt <= 0) return
    this.time += dt
    const reduced = this.opts.reducedMotion
    const t = this.time

    // ── layout: side, scale, dim ──
    const wide = this.camera.aspect > 1.05
    const scale = Math.min(1.05, Math.max(0.48, this.halfW / 5.2))
    const offset = wide ? this.halfW * 0.42 : 0
    const targetX = this.side === 'right' ? offset : this.side === 'left' ? -offset : 0
    this.group.position.x = damp(this.group.position.x, targetX, 2.6, dt)
    this.group.position.y = damp(this.group.position.y, wide ? 0 : this.halfH * 0.2, 2.6, dt)
    const s = damp(this.group.scale.x, scale, 2.6, dt)
    this.group.scale.setScalar(s)
    const dimTarget = wide ? this.dimTarget : Math.min(this.dimTarget, this.dimNarrow)
    this.dim = damp(this.dim, dimTarget, 2.2, dt)

    // ── rotation: slow sway + pointer parallax + planet spin ──
    this.pointerSmooth.x = damp(this.pointerSmooth.x, this.hasPointer ? this.pointer.x : 0, 3, dt)
    this.pointerSmooth.y = damp(this.pointerSmooth.y, this.hasPointer ? this.pointer.y : 0, 3, dt)
    if (this.shape === 'planet' && !reduced) {
      this.spinAngle += dt * 0.09
      if (this.spinAngle > Math.PI) this.spinAngle -= Math.PI * 2
    } else {
      this.spinAngle = damp(this.spinAngle, 0, 1.6, dt)
    }
    const sway = reduced ? 0 : Math.sin(t * 0.13) * 0.2
    this.group.rotation.y = this.spinAngle + sway + this.pointerSmooth.x * 0.16
    this.group.rotation.x = (reduced ? 0 : Math.cos(t * 0.11) * 0.06) - this.pointerSmooth.y * 0.09
    this.group.updateMatrixWorld(true)

    // ── pointer ray in the field's local space ──
    this.pointerActive = Math.max(0, this.pointerActive - dt * 0.6)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    this.inv.copy(this.points.matrixWorld).invert()
    this.rayOrigin.copy(this.raycaster.ray.origin).applyMatrix4(this.inv)
    this.rayDir.copy(this.raycaster.ray.direction).transformDirection(this.inv)

    // ── simulation uniforms ──
    this.pulse *= Math.exp(-1.35 * dt)
    const scrollStir = reduced ? 0 : Math.min(Math.abs(this.scrollVelocity) * 0.0045, 1.5)
    const turbulence = (reduced ? 0.04 : 0.3) + this.pulse + scrollStir
    const vu = this.velVar.material.uniforms
    vu.uTime.value = t
    vu.uDelta.value = dt
    vu.uTurbulence.value = turbulence
    vu.uRayOrigin.value.copy(this.rayOrigin)
    vu.uRayDir.value.copy(this.rayDir)
    vu.uMouseRadius.value = 0.62 / s
    vu.uMouseForce.value = this.hasPointer && !reduced ? 10 * this.pointerActive * this.dim : 0
    this.posVar.material.uniforms.uDelta.value = dt
    this.gpu.compute()

    const pu = this.pointsMat.uniforms
    pu.uPosition.value = this.gpu.getCurrentRenderTarget(this.posVar).texture
    pu.uVelocity.value = this.gpu.getCurrentRenderTarget(this.velVar).texture
    pu.uTime.value = t
    pu.uDim.value = this.dim

    // ── backdrop glow follows the field ──
    this.glow.lerp(this.glowTarget, 1 - Math.exp(-2 * dt))
    const c = this.tmp.set(0, 0, 0).applyMatrix4(this.group.matrixWorld).project(this.camera)
    this.backdropMat.uniforms.uCenter.value.set(c.x * 0.5 + 0.5, c.y * 0.5 + 0.5)
    this.backdropMat.uniforms.uTime.value = t % 100
    this.backdropMat.uniforms.uStrength.value = 0.4 + this.dim * 0.6

    this.entropy = Math.min(1, (turbulence - 0.3) / 2.2 + this.pointerActive * 0.25)
    this.entropy = Math.max(0, this.entropy)

    this.composer.render(dt)

    this.labels.setVisible(this.labelsEnabled && wide && this.dim > 0.72 && this.width >= 900)
    this.labels.update(this.points.matrixWorld, this.camera, this.width, this.height)

    this.watchFrameRate(dt)
  }

  /** Lower the pixel ratio when frames stay slow. */
  private watchFrameRate(dt: number) {
    this.frames++
    if (this.frames < 90) return
    if (dt > 1 / 38) this.slowFrames++
    else this.slowFrames = Math.max(0, this.slowFrames - 1)
    if (this.slowFrames > 45 && this.pixelRatio > 1) {
      this.pixelRatio = Math.max(1, this.pixelRatio - 0.25)
      this.slowFrames = 0
      this.resize()
    }
  }
}
