/** Tiny synthesized sound kit: no files to load, started on the first tap. */
export class Sfx {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  private windGain: GainNode | null = null
  private windFilter: BiquadFilterNode | null = null

  constructor(public enabled: boolean) {}

  /** Must run inside a user gesture the first time. */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.22
      this.master.connect(this.ctx.destination)
      const len = Math.floor(this.ctx.sampleRate * 0.5)
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
      const data = this.noiseBuf.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  private tone(from: number, to: number, dur: number, type: OscillatorType, vol: number, delay = 0) {
    if (!this.enabled || !this.ctx || !this.master) return
    const t0 = this.ctx.currentTime + delay
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(from, t0)
    osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t0 + dur)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g).connect(this.master)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  }

  private noise(dur: number, freq: number, vol: number) {
    if (!this.enabled || !this.ctx || !this.master || !this.noiseBuf) return
    const t0 = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = freq
    filter.Q.value = 0.8
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(vol, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    src.connect(filter).connect(g).connect(this.master)
    src.start(t0)
    src.stop(t0 + dur)
  }

  /** Continuous wind that swells with speed (`level` 0–1). Safe to call every frame. */
  wind(level: number) {
    if (!this.ctx || !this.master || !this.noiseBuf) return
    if (!this.windGain || !this.windFilter) {
      const src = this.ctx.createBufferSource()
      src.buffer = this.noiseBuf
      src.loop = true
      this.windFilter = this.ctx.createBiquadFilter()
      this.windFilter.type = 'lowpass'
      this.windFilter.Q.value = 0.6
      this.windGain = this.ctx.createGain()
      this.windGain.gain.value = 0
      src.connect(this.windFilter).connect(this.windGain).connect(this.master)
      src.start()
    }
    const now = this.ctx.currentTime
    this.windGain.gain.setTargetAtTime(this.enabled ? level * 0.45 : 0, now, 0.15)
    this.windFilter.frequency.setTargetAtTime(300 + level * 2200, now, 0.15)
  }

  /** Filtered noise whose pitch falls from `from` to `to` Hz; `pan` -1 (left) to 1 (right). */
  private sweep(from: number, to: number, dur: number, vol: number, pan = 0) {
    if (!this.enabled || !this.ctx || !this.master || !this.noiseBuf) return
    const t0 = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const f = this.ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.Q.value = 1.2
    f.frequency.setValueAtTime(from, t0)
    f.frequency.exponentialRampToValueAtTime(to, t0 + dur * 0.9)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.04, dur * 0.2))
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    let out: AudioNode = src.connect(f).connect(g)
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner()
      p.pan.value = pan
      out = out.connect(p)
    }
    out.connect(this.master)
    src.start(t0)
    src.stop(t0 + dur + 0.02)
  }

  /** The slam: a falling swoosh. */
  whoosh() {
    this.sweep(2800, 500, 0.24, 0.55)
  }

  /** A lantern rushing past on one side; `level` 0–1 grows with closeness and speed. */
  pass(level: number, pan: number) {
    this.sweep(1900, 520, 0.22, 0.05 + level * 0.3, pan)
  }

  /** The slam hitting the water. */
  boom(power: number) {
    this.tone(150, 45, 0.36, 'sine', Math.min(0.5 + power * 0.4, 1))
    this.noise(0.3, 520, 0.55)
  }

  /** Through a gate: a soft pop, then a sparkle that climbs a whole tone with each gate in a row. */
  gate(chain: number) {
    const f = 660 * Math.pow(2, (Math.min(chain, 9) - 1) / 6)
    this.tone(240, 520, 0.08, 'sine', 0.7)
    this.tone(f, f * 1.5, 0.12, 'triangle', 0.4, 0.05)
    this.tone(f * 1.5, f * 2, 0.16, 'sine', 0.3, 0.11)
  }

  /** A puffer blowing itself up: a low, swelling note. */
  puff() {
    this.tone(160, 380, 0.28, 'sine', 0.45)
    this.noise(0.18, 600, 0.15)
  }

  /** Stomping a puffer: a sharp pop, then a bright pair of rising notes. */
  pop() {
    this.noise(0.12, 2400, 0.7)
    this.tone(700, 140, 0.14, 'square', 0.22)
    this.tone(988, 1318, 0.12, 'triangle', 0.45, 0.06)
    this.tone(1318, 1760, 0.16, 'triangle', 0.4, 0.13)
  }

  /** A puffer locked on: two quick high blips. */
  lock() {
    this.tone(1568, 1568, 0.05, 'square', 0.16)
    this.tone(2093, 2093, 0.07, 'square', 0.14, 0.06)
  }

  /** Dashing onto a locked puffer: a rising zip. */
  zip() {
    this.sweep(600, 3600, 0.18, 0.6)
  }

  /** Bumping into a puffer: a dull cartoon bonk. */
  bonk() {
    this.tone(260, 70, 0.3, 'square', 0.25)
    this.tone(130, 60, 0.35, 'sine', 0.6)
  }

  /** Around a gate: the chain breaks with two falling notes. */
  miss() {
    this.tone(440, 300, 0.16, 'triangle', 0.4)
    this.tone(300, 150, 0.3, 'sine', 0.5, 0.12)
  }

  /** Breaking into a faster tier: a deep thump under two rising notes, higher for each tier. */
  tierUp(tier: number) {
    this.tone(110, 36, 0.6, 'sine', 0.95)
    this.noise(0.45, 360, 0.5)
    const f = 392 * Math.pow(2, tier / 6)
    this.tone(f, f * 1.5, 0.26, 'triangle', 0.35, 0.04)
    this.tone(f * 1.5, f * 2, 0.32, 'triangle', 0.3, 0.13)
  }

  /** Rises with speed, so acceleration is audible. */
  jump(speed: number) {
    const f = 200 + Math.min(speed, 40) * 9
    this.tone(f, f * 2.2, 0.22, 'sine', 0.8)
    this.tone(f * 2, f * 3.2, 0.08, 'triangle', 0.22)
  }

  perfect(combo: number) {
    const f = 880 * Math.pow(1.06, Math.min(combo, 12))
    this.tone(f, f * 1.5, 0.1, 'triangle', 0.45)
    this.tone(f * 1.5, f * 2, 0.12, 'sine', 0.35, 0.06)
  }

  plop() {
    this.tone(300, 140, 0.18, 'sine', 0.55)
    this.noise(0.14, 900, 0.3)
  }

  /** Each skip rings a little higher. */
  plip(n: number) {
    const f = 560 * Math.pow(1.12, Math.min(n, 14))
    this.tone(f, f * 1.45, 0.13, 'sine', 0.7)
    this.noise(0.09, 2600, 0.35)
  }

  bloop() {
    this.tone(260, 85, 0.38, 'sine', 0.9)
    this.noise(0.3, 700, 0.45)
  }
}
