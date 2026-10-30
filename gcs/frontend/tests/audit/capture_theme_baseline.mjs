// Chụp 6 route x 2 theme (dark/light) + đo tương phản.
// Chỉ đọc source, ghi ảnh + JSON; không sửa mã ứng dụng.
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = process.env.KVC_BASE_URL || 'http://127.0.0.1:5173'
const OUT = resolve(process.env.KVC_SHOT_DIR || '../review/KVC-GCS-UI/00-baseline')

const ROUTES = [
  ['mission', '#/mission'],
  ['overview', '#/overview'],
  ['alerts', '#/alerts'],
  ['history', '#/history'],
  ['devices', '#/devices'],
  ['settings', '#/settings'],
]

const VIEWPORT = { width: 1366, height: 768 }
const THEMES = ['dark', 'light']

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
const report = []

for (const theme of THEMES) {
  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`))

  for (const [name, hash] of ROUTES) {
    consoleErrors.length = 0
    await page.goto(`${BASE}/${hash}`, { waitUntil: 'domcontentloaded' })
    await page.evaluate((t) => {
      localStorage.setItem('kvc_gcs_theme', t)
    }, theme)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1400)

    const overflow = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth
      const vh = document.documentElement.clientHeight
      return {
        vw,
        vh,
        docW: document.documentElement.scrollWidth,
        docH: document.documentElement.scrollHeight,
        horizontalOverflow: document.documentElement.scrollWidth > vw + 1,
      }
    })

    const contrast = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      const cache = new Map()
      function toRgba(str) {
        if (!str) return null
        if (cache.has(str)) return cache.get(str)
        ctx.clearRect(0, 0, 1, 1)
        ctx.fillStyle = '#000'
        ctx.fillStyle = str
        ctx.fillRect(0, 0, 1, 1)
        const d = ctx.getImageData(0, 0, 1, 1).data
        const out = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }
        cache.set(str, out)
        return out
      }
      function lum({ r, g, b }) {
        const f = (v) => {
          const s = v / 255
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
      }
      function bgOf(el) {
        let cur = el
        while (cur) {
          const c = toRgba(getComputedStyle(cur).backgroundColor)
          if (c && c.a > 0.5) return c
          cur = cur.parentElement
        }
        return { r: 255, g: 255, b: 255, a: 1 }
      }
      const out = []
      let checked = 0
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const value = (node.nodeValue || '').trim()
          if (value.length < 1) return NodeFilter.FILTER_REJECT
          const parent = node.parentElement
          if (!parent) return NodeFilter.FILTER_REJECT
          const tag = parent.tagName
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return NodeFilter.FILTER_REJECT
          return NodeFilter.FILTER_ACCEPT
        },
      })
      let node
      while ((node = walker.nextNode())) {
        if (checked >= 1500) break
        const el = node.parentElement
        if (!el) continue
        const style = getComputedStyle(el)
        if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) < 0.35) continue
        const rect = el.getBoundingClientRect()
        if (rect.width < 3 || rect.height < 3) continue
        if (rect.bottom < 0 || rect.top > window.innerHeight) continue
        const fg = toRgba(style.color)
        if (!fg || fg.a < 0.5) continue
        const bg = bgOf(el)
        const L1 = lum(fg)
        const L2 = lum(bg)
        const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
        const size = parseFloat(style.fontSize)
        const bold = parseInt(style.fontWeight, 10) >= 700
        const large = size >= 24 || (size >= 18.66 && bold)
        const threshold = large ? 3.0 : 4.5
        checked++
        if (ratio < threshold) {
          out.push({
            text: (node.nodeValue || '').trim().slice(0, 44),
            color: style.color,
            bg: `rgb(${bg.r}, ${bg.g}, ${bg.b})`,
            ratio: Math.round(ratio * 100) / 100,
            threshold,
            size: Math.round(size),
            tag: el.tagName.toLowerCase(),
            cls: String(el.className || '').slice(0, 80),
          })
        }
      }
      return { checked, failures: out }
    })

    const file = `${theme}-${name}.png`
    await page.screenshot({ path: resolve(OUT, file), fullPage: false })
    report.push({
      theme,
      route: name,
      file,
      overflow,
      contrastChecked: contrast.checked,
      contrastFailures: contrast.failures.length,
      worst: contrast.failures.sort((a, b) => a.ratio - b.ratio).slice(0, 8),
      consoleErrors: [...consoleErrors],
    })
    process.stdout.write(
      `${file} fail=${contrast.failures.length}/${contrast.checked} overflow=${overflow.horizontalOverflow}\n`
    )
  }

  await page.close()
}

await browser.close()

writeFileSync(resolve(OUT, 'contrast-before.json'), JSON.stringify(report, null, 2))
const total = report.reduce((s, r) => s + r.contrastFailures, 0)
const checked = report.reduce((s, r) => s + r.contrastChecked, 0)
console.log(JSON.stringify({ out: OUT, shots: report.length, contrastFailures: total, contrastChecked: checked }, null, 2))
