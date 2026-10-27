import { q, qa, say } from './util'

// Units are half hours from 06:00 on day D. Operating days switch at 09:00 (unit 6 and unit 54).
const UNITS = 60
const BOUNDARIES = [6, 54]
const DAYS = [
  { name: '운영일 D-1', short: 'D-1', from: -Infinity, to: 6 },
  { name: '운영일 D', short: '운영일 D · 09:00 → 익일 09:00', from: 6, to: 54 },
  { name: '운영일 D+1', short: 'D+1', from: 54, to: Infinity },
]

const clock = (u: number) => {
  const minutes = 6 * 60 + u * 30
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function initOpday(root: HTMLElement) {
  const track = q(root, '[data-opday]')
  const daysEl = q(root, '[data-days]')
  const axis = q(root, '[data-axis]')
  const work = q(root, '[data-work]')
  const workLabel = q(root, '[data-work-label]')
  const log = q(root, '[data-log]')
  const presets = qa<HTMLButtonElement>(root, '[data-preset]')

  let start = 5
  let end = 7

  const pct = (u: number) => `${(Math.max(0, Math.min(UNITS, u)) / UNITS) * 100}%`

  const dayEls = DAYS.map((d) => {
    const el = document.createElement('div')
    el.className = 'opday__day'
    el.style.left = pct(d.from)
    el.style.right = `calc(100% - ${pct(d.to)})`
    el.innerHTML = `<span>${d.short}</span>`
    daysEl.appendChild(el)
    return el
  })

  for (let u = 0; u <= UNITS; u += 6) {
    const t = document.createElement('span')
    t.className = `opday__tick${BOUNDARIES.includes(u) ? ' is-boundary' : u === 36 ? '' : ' is-minor'}`
    t.style.left = pct(u)
    t.textContent = clock(u)
    if (u === 0 || u === UNITS) t.style.transform = u === 0 ? 'translateX(0)' : 'translateX(-100%)'
    axis.appendChild(t)
  }

  const render = () => {
    work.style.left = pct(start)
    work.style.width = `${((end - start) / UNITS) * 100}%`
    const label = `${clock(start)}–${clock(end)}${start < 36 && end > 36 ? ' (자정 넘김)' : ''}`
    workLabel.textContent = label
    // keep the floating label inside the track near both ends
    const edge = start < 10 ? 'left' : end > UNITS - 10 ? 'right' : 'center'
    workLabel.style.left = edge === 'left' ? '0' : edge === 'center' ? '50%' : 'auto'
    workLabel.style.right = edge === 'right' ? '0' : 'auto'
    workLabel.style.transform = edge === 'center' ? 'translateX(-50%)' : 'none'
    work.setAttribute('aria-valuenow', String(start))
    work.setAttribute('aria-valuetext', label)
    const hits = DAYS.filter((d) => start < d.to && end > d.from)
    dayEls.forEach((el, i) => el.classList.toggle('is-hit', hits.includes(DAYS[i])))
    presets.forEach((b) => b.classList.toggle('is-on', b.dataset.preset === `${start},${end}`))
    const names = hits.map((d) => d.name).join(', ')
    const note =
      hits.length > 1
        ? '두 운영일과 겹칩니다.'
        : end === 6 || end === 54
          ? '정확히 09:00에 끝나므로 이전 운영일에만 속합니다.'
          : start === 6 || start === 54
            ? '정확히 09:00에 시작하므로 새 운영일에만 속합니다.'
            : start < 36 && end > 36
              ? '자정을 넘겨도 같은 운영일입니다. 달력 날짜로 자르면 이 작업을 놓칩니다.'
              : '한 운영일에 속합니다.'
    say(log, `${label} → ${names}. ${note}`, hits.length > 1 ? 'warn' : 'ok')
  }

  const set = (s: number, e: number) => {
    start = Math.max(0, Math.min(UNITS - 1, s))
    end = Math.max(start + 1, Math.min(UNITS, e))
    render()
  }

  // Drag: the bar moves, the handles resize.
  let drag: { mode: 'move' | 'l' | 'r'; x0: number; s0: number; e0: number } | null = null
  const unitAt = (dx: number) => Math.round((dx / track.clientWidth) * UNITS)
  work.addEventListener('pointerdown', (e) => {
    const handle = (e.target as HTMLElement).dataset.handle as 'l' | 'r' | undefined
    drag = { mode: handle ?? 'move', x0: e.clientX, s0: start, e0: end }
    work.setPointerCapture(e.pointerId)
    e.preventDefault()
  })
  work.addEventListener('pointermove', (e) => {
    if (!drag) return
    const du = unitAt(e.clientX - drag.x0)
    if (drag.mode === 'move') {
      const len = drag.e0 - drag.s0
      const s = Math.max(0, Math.min(UNITS - len, drag.s0 + du))
      set(s, s + len)
    } else if (drag.mode === 'l') set(Math.min(drag.s0 + du, end - 1), end)
    else set(start, Math.max(drag.e0 + du, start + 1))
  })
  const stop = () => (drag = null)
  work.addEventListener('pointerup', stop)
  work.addEventListener('pointercancel', stop)
  work.addEventListener('keydown', (e) => {
    const k = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
    if (!k) return
    e.preventDefault()
    if (e.shiftKey) set(start, end + k)
    else if (start + k >= 0 && end + k <= UNITS) set(start + k, end + k)
  })
  presets.forEach((b) =>
    b.addEventListener('click', () => {
      const [s, e] = b.dataset.preset!.split(',').map(Number)
      set(s, e)
    }),
  )
  render()
}
