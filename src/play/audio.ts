/** Tiny synthesized sound kit: no files to load, started on the first tap. */
export class Sfx {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null

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

  boing(power: number) {
    this.tone(170, 420 + power * 260, 0.28, 'sine', 0.9)
    this.tone(340, 900, 0.12, 'triangle', 0.25)
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

  pop() {
    this.tone(660, 1180, 0.08, 'triangle', 0.45)
  }

  fanfare() {
    ;[0, 4, 7, 12].forEach((s, i) => this.tone(523 * Math.pow(2, s / 12), 523 * Math.pow(2, s / 12), 0.22, 'triangle', 0.5, i * 0.09))
  }
}
