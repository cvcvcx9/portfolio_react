const mq = (q: string) => window.matchMedia(q).matches

export const env = {
  reducedMotion: mq('(prefers-reduced-motion: reduce)'),
  finePointer: mq('(hover: hover) and (pointer: fine)'),
  lowPower:
    mq('(pointer: coarse)') ||
    window.innerWidth < 760 ||
    (navigator.hardwareConcurrency ?? 8) <= 4 ||
    ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4,
}

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T | null

export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll(sel)) as T[]
