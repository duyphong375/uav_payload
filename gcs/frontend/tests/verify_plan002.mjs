// Kiểm tra offline + tương phản + bàn phím. Chỉ đọc, không sửa source.
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = process.env.KVC_BASE_URL || 'http://127.0.0.1:5173'
const OUT = resolve(process.env.KVC_VERIFY_DIR || '../review/KVC-GCS-PLAN-002/70-verify')
mkdirSync(OUT, { recursive: true })

const results = { offline: {}, contrast: [], keyboard: {}, console: [] }

// ---------- 1. Cold-cache / offline: chặn mọi request tile bản đồ ----------
{
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } })
  const page = await context.newPage()

  const blocked = []
  await page.route('**://*.tile.openstreetmap.org/**', (route) => {
    blocked.push(route.request().url())
    route.abort()
  })
  await page.route('**://tile.openstreetmap.org/**', (route) => {
    blocked.push(route.request().url())
    route.abort()
  })
  await page.route('**://*.basemaps.cartocdn.com/**', (route) => route.abort())
  await page.route('**://*.arcgisonline.com/**', (route) => route.abort())

  await page.goto(`${BASE}/#/mission`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)

  // Radar local phải vẫn render dù tile hỏng
  await page.click('button[aria-label="Xem Radar Local (Hệ Local)"]').catch(() => {})
  await page.waitForTimeout(1200)

  const radarText = await page.evaluate(() => document.body.innerText)
  results.offline = {
    blockedTileRequests: blocked.length,
    radarRendered: /Radar|BẮC LOCAL|\+Y/i.test(radarText),
    hasLocalGridLabel: /LOCAL/i.test(radarText),
    claimOfflineBasemap: /nền nội bộ|bản đồ offline|tile nội bộ/i.test(radarText),
    screenshot: 'offline-mission-radar.png',
  }
  await page.screenshot({ path: resolve(OUT, 'offline-mission-radar.png') })
  await browser.close()
}

// ---------- 2. Đo tương phản cho các tổ hợp màu chính ----------
{
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } })
  const page = await context.newPage()

  const routes = ['#/overview', '#/alerts', '#/devices', '#/settings', '#/history', '#/mission']
  for (const hash of routes) {
    await page.goto(`${BASE}/${hash}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)

    const samples = await page.evaluate(() => {
      function parseColor(str) {
        const m = str.match(/rgba?\(([^)]+)\)/)
        if (!m) return null
        const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number)
        return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 }
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
          const c = parseColor(getComputedStyle(cur).backgroundColor)
          if (c && c.a > 0.5) return c
          cur = cur.parentElement
        }
        return { r: 255, g: 255, b: 255, a: 1 }
      }
      const out = []
      const nodes = document.querySelectorAll('span, p, h1, h2, h3, h4, td, th, button, a, label')
      let n = 0
      for (const el of nodes) {
        if (n >= 400) break
        const text = (el.textContent || '').trim()
        if (!text || text.length > 80) continue
        const style = getComputedStyle(el)
        if (style.visibility === 'hidden' || style.display === 'none') continue
        const rect = el.getBoundingClientRect()
        if (rect.width < 4 || rect.height < 4) continue
        const fg = parseColor(style.color)
        if (!fg) continue
        const bg = bgOf(el)
        const L1 = lum(fg)
        const L2 = lum(bg)
        const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
        const size = parseFloat(style.fontSize)
        const bold = parseInt(style.fontWeight, 10) >= 700
        const large = size >= 24 || (size >= 18.66 && bold)
        const threshold = large ? 3.0 : 4.5
        n++
        if (ratio < threshold) {
          out.push({
            text: text.slice(0, 60),
            color: style.color,
            bg: `rgb(${bg.r}, ${bg.g}, ${bg.b})`,
            ratio: Math.round(ratio * 100) / 100,
            threshold,
            size: Math.round(size),
            selector: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''),
          })
        }
      }
      return out
    })

    results.contrast.push({ route: hash, failures: samples.slice(0, 40), total: samples.length })
  }

  await browser.close()
}

// ---------- 3. Bàn phím: tab order + focus visible ----------
{
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } })
  const page = await context.newPage()
  await page.goto(`${BASE}/#/overview`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)

  const sequence = []
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab')
    const info = await page.evaluate(() => {
      const el = document.activeElement
      if (!el) return null
      const s = getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      return {
        tag: el.tagName.toLowerCase(),
        label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40),
        outlineWidth: s.outlineWidth,
        outlineStyle: s.outlineStyle,
        boxShadow: s.boxShadow !== 'none',
        ringVisible: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0,
        visible: rect.width > 0 && rect.height > 0,
      }
    })
    if (info) sequence.push(info)
  }

  // Esc đóng PiP trên Mission
  await page.goto(`${BASE}/#/mission`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await page.click('button[aria-label="Bật tắt Video phụ"]').catch(() => {})
  await page.waitForTimeout(500)
  const pipOpen = await page.locator('[role="dialog"][aria-label="Cửa sổ Video PiP"]').count()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  const pipAfterEsc = await page.locator('[role="dialog"][aria-label="Cửa sổ Video PiP"]').count()

  // aria-current trên sidebar
  const ariaCurrent = await page.evaluate(() => {
    const el = document.querySelector('[aria-current="page"]')
    return el ? (el.textContent || '').trim().slice(0, 30) : null
  })

  results.keyboard = {
    tabSequence: sequence,
    focusVisibleCount: sequence.filter((s) => s.visible).length,
    pipOpened: pipOpen,
    pipClosedByEsc: pipOpen > 0 && pipAfterEsc === 0,
    ariaCurrent,
  }

  await browser.close()
}

writeFileSync(resolve(OUT, 'verify-data.json'), JSON.stringify(results, null, 2))
console.log(JSON.stringify({
  offline: results.offline,
  contrastRoutes: results.contrast.map((r) => ({ route: r.route, failures: r.total })),
  keyboard: {
    pipOpened: results.keyboard.pipOpened,
    pipClosedByEsc: results.keyboard.pipClosedByEsc,
    ariaCurrent: results.keyboard.ariaCurrent,
    tabStops: results.keyboard.tabSequence.length,
  },
}, null, 2))
