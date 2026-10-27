import { q, qa, whileVisible } from './util'

type Role = 'controller' | 'app'

interface Req {
  method: 'GET' | 'POST' | 'PATCH'
  path: string
  status: number
  ms: number
  session?: boolean
  attempt?: number
  body?: string
}

interface Action {
  label: string
  hint: string
  reqs: Req[]
}

const MASK = '<span class="mask">••••••</span>'
const ROLE_NAME: Record<Role, string> = { controller: '관제사', app: '안전관리자' }

const ACTIONS: Record<Role, Action[]> = {
  controller: [
    {
      label: '계획 조회',
      hint: 'GET ×2',
      reqs: [
        { method: 'GET', path: '/work-plans/{id}', status: 200, ms: 128 },
        { method: 'GET', path: '/work-plans/{id}/phases/{phase}', status: 200, ms: 94 },
      ],
    },
    {
      label: '결재 승인',
      hint: 'POST',
      reqs: [
        {
          method: 'POST',
          path: '/work-plans/{id}/approval',
          status: 200,
          ms: 142,
          body: `headers  authorization: Bearer ${MASK}\nbody     { "decision": "APPROVE", "comment": "현장 확인 완료" }`,
        },
      ],
    },
    {
      label: '단전 조작',
      hint: '401 → 복원 → 재시도',
      reqs: [
        { method: 'POST', path: '/power/switch', status: 401, ms: 31, body: 'access token 만료 → 세션 복원으로 넘어감' },
        { method: 'POST', path: '/session/restore', status: 200, ms: 88, session: true, body: `cookie   refresh (HttpOnly)\nbody     { "access_token": "${MASK}" }` },
        { method: 'POST', path: '/power/switch', status: 200, ms: 176, attempt: 2, body: `body     { "section": "A", "direction": "OFF", "password": "${MASK}" }` },
      ],
    },
    {
      label: '첨부 보기',
      hint: 'blob',
      reqs: [{ method: 'GET', path: '/files/{token}/plain', status: 200, ms: 210, body: '응답 요약  image/jpeg · 1.2 MB (본문은 표시하지 않음)' }],
    },
  ],
  app: [
    { label: '현장대기 보고', hint: 'POST', reqs: [{ method: 'POST', path: '/work-plans/{id}/site-wait', status: 200, ms: 133 }] },
    {
      label: '스텝 제출',
      hint: 'POST',
      reqs: [
        {
          method: 'POST',
          path: '/work-plans/{id}/steps/{code}',
          status: 200,
          ms: 158,
          body: `body     { "evidence": ["ft_${MASK}"], "location": "증빙 위치" }`,
        },
      ],
    },
    {
      label: '증빙 업로드',
      hint: '봉투 암호화',
      reqs: [{ method: 'POST', path: '/files', status: 201, ms: 412, body: '요청 요약  envelope · 2.1 MB · checksum sha256:9f2c…e81a\n키 값        dek: ' + MASK }],
    },
  ],
}

const AUTO: Action = { label: '자동 요청 · 10초 갱신', hint: '', reqs: [{ method: 'GET', path: '/work-plans/{id}/state', status: 200, ms: 61 }] }

export function initInspector(root: HTMLElement) {
  const roleBtns = qa<HTMLButtonElement>(root, '[data-role]')
  const actionsEl = q(root, '[data-actions]')
  const groupsEl = q(root, '[data-groups]')
  const totalEl = q(root, '[data-total]')
  let role: Role = 'controller'
  let total = 0
  let autoTimer = 0

  const renderActions = () => {
    actionsEl.innerHTML = ''
    for (const action of ACTIONS[role]) {
      const b = document.createElement('button')
      b.type = 'button'
      b.innerHTML = `<span>${action.label}</span><small>${action.hint}</small>`
      b.addEventListener('click', () => {
        b.classList.add('is-flash')
        window.setTimeout(() => b.classList.remove('is-flash'), 500)
        play(action, false)
      })
      actionsEl.appendChild(b)
    }
  }

  const play = async (action: Action, auto: boolean) => {
    groupsEl.querySelector('.fl-empty')?.remove()
    const group = document.createElement('div')
    group.className = `fl-group${auto ? ' fl-group--auto' : ''}`
    const count = document.createElement('small')
    group.innerHTML = `<div class="fl-group__head"><span>${action.label}${auto ? '' : ' · 클릭'}</span></div>`
    group.firstElementChild!.appendChild(count)
    groupsEl.prepend(group)
    while (groupsEl.children.length > 7) groupsEl.lastElementChild?.remove()

    let n = 0
    for (const req of action.reqs) {
      const row = document.createElement('div')
      row.className = 'fl-row'
      const target = req.session ? '세션 라우트 → {인증 서버}/refresh' : `↗ {선택한 서버}${req.path}`
      row.innerHTML =
        `<span class="fl-row__method">${req.method}</span>` +
        `<span class="fl-row__path">${req.path}</span>` +
        `<span class="fl-row__status is-pending">…</span>` +
        `<span class="fl-row__meta">${auto ? '백그라운드' : ROLE_NAME[role]}${req.attempt ? ` · 재시도 ${req.attempt}` : ''} · ${target}</span>` +
        `<span class="fl-row__body">${req.body ?? '본문 없음'}</span>`
      row.addEventListener('click', () => row.classList.toggle('is-open'))
      group.appendChild(row)
      n++
      total++
      count.textContent = `${n}개 요청`
      totalEl.textContent = `${total}건`
      await new Promise((r) => window.setTimeout(r, req.ms * 2.2))
      const status = q(row, '.fl-row__status')
      status.classList.remove('is-pending')
      status.classList.toggle('is-bad', req.status >= 400)
      status.textContent = `${req.status} · ${req.ms}ms`
      await new Promise((r) => window.setTimeout(r, 140))
    }
  }

  roleBtns.forEach((btn) =>
    btn.addEventListener('click', () => {
      role = btn.dataset.role as Role
      roleBtns.forEach((b) => b.setAttribute('aria-checked', String(b === btn)))
      renderActions()
    }),
  )

  let primed = false
  whileVisible(root, (visible) => {
    window.clearInterval(autoTimer)
    autoTimer = visible ? window.setInterval(() => play(AUTO, true), 12000) : 0
    if (visible && !primed) {
      primed = true
      window.setTimeout(() => play(ACTIONS.controller[0], false), 600)
    }
  })
  renderActions()
}
