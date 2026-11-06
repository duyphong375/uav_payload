// Kiểm tra offline + tương phản + bàn phím + mật độ. Chỉ đọc, không sửa source.
// Exit code != 0 khi có vi phạm tương phản/PiP/bàn phím/tràn ngang/mật độ (PLAN-002 §13.4.5).
//
// Biến môi trường:
//   KVC_BASE_URL    — mặc định http://127.0.0.1:5173
//   KVC_VERIFY_DIR  — mặc định ../../review/KVC-GCS-UI/70-verify (từ gcs/frontend)
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = process.env.KVC_BASE_URL || 'http://127.0.0.1:5173'
const OUT = resolve(process.env.KVC_VERIFY_DIR || '../../review/KVC-GCS-UI/70-verify')
mkdirSync(OUT, { recursive: true })

const ROUTES = ['#/mission', '#/overview', '#/alerts', '#/devices', '#/settings', '#/history']
const failures = []
const fail = (scope, detail) => {
  failures.push({ scope, detail })
  process.stderr.write(`FAIL [${scope}] ${JSON.stringify(detail)}\n`)
}

/** Backend GCS (127.0.0.1:8000) không chạy trong môi trường kiểm chứng: tách khỏi lỗi UI. */
const isBackendOffline = (text) =>
  /ERR_CONNECTION_REFUSED|ERR_NETWORK/.test(text) && /127\.0\.0\.1:8000|localhost:8000/.test(text)

const results = {
  offline: {},
  contrast: [],
  keyboard: {},
  density: [],
  console: [],
  measurements: {},
}

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
  if (!results.offline.radarRendered) fail('offline', { reason: 'Radar Local không render khi tile bị chặn' })
  if (results.offline.claimOfflineBasemap) {
    fail('offline', { reason: 'UI tự nhận có bản đồ offline dù chưa kiểm chứng' })
  }
  await browser.close()
}

// ---------- 2. Đo tương phản cho các tổ hợp màu chính (2 theme) ----------
for (const theme of ['dark', 'light']) {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } })
  const page = await context.newPage()

  await page.goto(`${BASE}/#/overview`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((t) => localStorage.setItem('kvc_gcs_theme', t), theme)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)

  for (const hash of ROUTES) {
    const consoleErrors = []
    const backendOffline = []
    const onConsole = (msg) => {
      if (msg.type() !== 'error') return
      const text = msg.text()
      if (isBackendOffline(`${text} ${msg.location().url}`)) backendOffline.push(text)
      else consoleErrors.push(text)
    }
    const onPageError = (err) => consoleErrors.push(`pageerror: ${err.message}`)
    page.on('console', onConsole)
    page.on('pageerror', onPageError)

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
            selector:
              el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''),
          })
        }
      }
      return out
    })

    page.off('console', onConsole)
    page.off('pageerror', onPageError)
    results.contrast.push({ theme, route: hash, failures: samples.slice(0, 40), total: samples.length })
    results.console.push({ theme, route: hash, errors: consoleErrors, backendOffline })
    if (samples.length > 0) fail('contrast', { theme, route: hash, count: samples.length, worst: samples[0] })
    if (consoleErrors.length > 0) fail('console', { theme, route: hash, errors: consoleErrors.slice(0, 3) })
  }

  await browser.close()
}

// ---------- 3. Bàn phím: tab order + focus visible + PiP ----------
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

  if (sequence.length < 5) fail('keyboard', { reason: 'Tab không đi qua phần tử tương tác', stops: sequence.length })
  if (sequence.some((s) => !s.visible)) fail('keyboard', { reason: 'Có tab stop không hiển thị' })
  if (pipOpen === 0) fail('keyboard', { reason: 'Không mở được PiP bằng nút Video phụ' })
  if (!results.keyboard.pipClosedByEsc) fail('keyboard', { reason: 'Escape không đóng PiP', pipOpen, pipAfterEsc })
  if (!ariaCurrent) fail('keyboard', { reason: 'Không có aria-current="page" trên điều hướng' })

  await browser.close()
}

// ---------- 4. Mật độ: data-density, token, chiều cao header, sidebar ----------
{
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } })
  const page = await context.newPage()

  await page.goto(`${BASE}/#/mission`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    localStorage.setItem('kvc_gcs_theme', 'dark')
    localStorage.setItem('kvc_gcs_density', 'comfortable')
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)

  for (const route of ['#/overview', '#/history', '#/devices']) {
    await page.goto(`${BASE}/${route}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
    const reading = await page.evaluate(() => {
      const root = document.documentElement
      const header = document.querySelector('header')
      const sidebar = document.querySelector('aside[aria-label="Điều hướng chính"]')
      const cell = document.querySelector('.kvc-density-cell')
      const cs = cell ? getComputedStyle(cell) : null
      const panel = document.querySelector('.kvc-density-panel')
      const ps = panel ? getComputedStyle(panel) : null
      return {
        density: root.dataset.density ?? null,
        headerHeight: header ? Math.round(header.getBoundingClientRect().height) : null,
        sidebarWidth: sidebar ? Math.round(sidebar.getBoundingClientRect().width) : null,
        cellPadding: cs
          ? `${cs.paddingTop}/${cs.paddingRight}/${cs.paddingBottom}/${cs.paddingLeft}`
          : null,
        panelPadding: ps ? ps.paddingTop : null,
        horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      }
    })
    results.density.push({ route, ...reading })

    if (reading.density !== 'comfortable') fail('density', { route, reason: 'data-density không phải comfortable', reading })
    if (reading.headerHeight !== 56) fail('density', { route, reason: 'header không cao 56px', reading })
    if (reading.sidebarWidth !== 220) fail('density', { route, reason: 'sidebar không rộng 220px', reading })
    if (reading.horizontalOverflow) fail('density', { route, reason: 'tràn ngang', reading })
  }

  // Bấm "Gọn" trong Settings và kiểm token đổi + giữ sau reload
  await page.goto(`${BASE}/#/settings`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('group', { name: 'Chọn mật độ hiển thị' }).waitFor({ state: 'visible' })
  await page
    .getByRole('group', { name: 'Chọn mật độ hiển thị' })
    .getByRole('button', { name: 'Gọn' })
    .click()
  await page.waitForTimeout(400)

  // Đo token compact trên trang có bảng (Settings không dùng kvc-density-cell)
  await page.goto(`${BASE}/#/history`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  const compact = await page.evaluate(() => {
    const root = document.documentElement
    const cell = document.querySelector('.kvc-density-cell')
    const panel = document.querySelector('.kvc-density-panel')
    return {
      density: root.dataset.density ?? null,
      cellPadding: cell ? getComputedStyle(cell).paddingTop : null,
      panelPadding: panel ? getComputedStyle(panel).paddingTop : null,
    }
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  const persisted = await page.evaluate(() => document.documentElement.dataset.density ?? null)

  results.density.push({ route: '#/history (compact)', ...compact, afterReload: persisted })
  if (compact.density !== 'compact') fail('density', { reason: 'Bấm Gọn không đặt data-density=compact', compact })
  if (compact.cellPadding !== '6px') fail('density', { reason: 'Token ô bảng compact không phải 6px', compact })
  if (compact.panelPadding !== '10px') fail('density', { reason: 'Token panel compact không phải 10px', compact })
  if (persisted !== 'compact') fail('density', { reason: 'compact không giữ sau reload', persisted })

  // Đo dải KPI ở Overview @1366×768 (mục tiêu ≤ 104px theo addendum §13.4)
  await page.goto(`${BASE}/#/overview`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  const kpiBand = await page.evaluate(() => {
    const label = Array.from(document.querySelectorAll('span,div')).find(
      (el) => (el.textContent || '').trim() === 'Mục tiêu cứu nạn'
    )
    if (!label) return null
    let band = label
    while (band && !String(band.className).includes('grid-cols-1')) band = band.parentElement
    if (!band) return null
    const rect = band.getBoundingClientRect()
    return { height: Math.round(rect.height), width: Math.round(rect.width) }
  })
  results.measurements.kpiBand = kpiBand
  if (!kpiBand) fail('measure', { reason: 'Không tìm thấy dải KPI Overview' })
  else if (kpiBand.height > 104) {
    fail('measure', { reason: `Dải KPI ${kpiBand.height}px vượt mục tiêu ≤104px @1366×768`, kpiBand })
  }

  await browser.close()
}

// ---------- 5. Bố cục Mission: overlay không đè nhau trên mọi kích thước ----------
// Trước đây mỗi lớp nổi tự đặt `absolute` với offset riêng, nên khi màn hình
// hẹp/thấp chúng chồng lên nhau mà không có gì phát hiện. Khối này biến điều đó
// thành điều kiện máy kiểm được: mọi phần tử `[data-overlay]` phải nằm trong
// khung nhìn và không cặp nào giao nhau.
{
  const OVERLAY_VIEWPORTS = [
    ['1920x1080', { width: 1920, height: 1080 }],
    ['1366x768', { width: 1366, height: 768 }],
    ['1366x640', { width: 1366, height: 640 }],
    ['1280x720', { width: 1280, height: 720 }],
    ['1024x768', { width: 1024, height: 768 }],
    ['768x1024', { width: 768, height: 1024 }],
    ['390x844', { width: 390, height: 844 }],
    ['360x640', { width: 360, height: 640 }],
  ]

  results.overlays = []

  for (const [vpName, viewport] of OVERLAY_VIEWPORTS) {
    const browser = await chromium.launch()
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()

    await page.goto(`${BASE}/#/mission`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => {
      localStorage.setItem('kvc_gcs_theme', 'dark')
      localStorage.setItem('kvc_gcs_density', 'comfortable')
      // Xoá lựa chọn thu gọn đã lưu để kiểm tra đúng hành vi mặc định theo
      // chiều cao, không bị ảnh hưởng bởi lần chạy trước.
      localStorage.removeItem('kvc_topbar_collapsed')
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1400)

    // Mở cả PiP để có thêm một lớp nổi cạnh tranh chỗ.
    await page.click('button[aria-label="Bật tắt Video phụ"]').catch(() => {})
    await page.waitForTimeout(500)

    const layout = await page.evaluate(() => {
      const rects = Array.from(document.querySelectorAll('[data-overlay]')).map((el) => {
        const r = el.getBoundingClientRect()
        return {
          id: el.dataset.overlay,
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          right: r.right,
          bottom: r.bottom,
        }
      })
      const overlapPairs = []
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i]
          const b = rects[j]
          const ox = Math.min(a.right, b.right) - Math.max(a.x, b.x)
          const oy = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y)
          if (ox > 1 && oy > 1) {
            overlapPairs.push({ a: a.id, b: b.id, overlapX: Math.round(ox), overlapY: Math.round(oy) })
          }
        }
      }
      return {
        viewport: { w: window.innerWidth, h: window.innerHeight },
        rects,
        overlapPairs,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        outsideViewport: rects.filter(
          (r) => r.x < -1 || r.y < -1 || r.right > window.innerWidth + 1 || r.bottom > window.innerHeight + 1
        ),
      }
    })

    results.overlays.push({ viewport: vpName, ...layout })

    if (layout.horizontalOverflow) {
      fail('layout', { viewport: vpName, reason: 'tràn ngang trên trang Mission' })
    }
    if (layout.outsideViewport.length > 0) {
      fail('layout', {
        viewport: vpName,
        reason: 'overlay tràn ra ngoài khung nhìn',
        overlays: layout.outsideViewport,
      })
    }
    if (layout.overlapPairs.length > 0) {
      fail('layout', { viewport: vpName, reason: 'overlay đè nhau', pairs: layout.overlapPairs })
    }
    if (layout.rects.length === 0) {
      fail('layout', { viewport: vpName, reason: 'không tìm thấy data-overlay nào để kiểm tra' })
    }

    await context.close()
    await browser.close()
  }
}

writeFileSync(resolve(OUT, 'verify-data.json'), JSON.stringify(results, null, 2))
console.log(
  JSON.stringify(
    {
      offline: results.offline,
      contrastRoutes: results.contrast.map((r) => ({
        theme: r.theme,
        route: r.route,
        failures: r.total,
      })),
      consoleErrors: results.console.filter((c) => c.errors.length > 0).length,
      keyboard: {
        pipOpened: results.keyboard.pipOpened,
        pipClosedByEsc: results.keyboard.pipClosedByEsc,
        ariaCurrent: results.keyboard.ariaCurrent,
        tabStops: results.keyboard.tabSequence.length,
      },
      density: results.density,
      kpiBand: results.measurements.kpiBand,
      overlays: (results.overlays ?? []).map((o) => ({
        viewport: o.viewport,
        overlays: o.rects.length,
        overlaps: o.overlapPairs.length,
        outside: o.outsideViewport.length,
      })),
      backendOfflineRoutes: results.console.filter((c) => c.backendOffline.length > 0).length,
      failureCount: failures.length,
      failures,
    },
    null,
    2
  )
)

if (failures.length > 0) {
  console.error(`\nVERIFY FAILED: ${failures.length} vi phạm`)
  process.exitCode = 1
} else {
  console.log('\nVERIFY PASSED: 0 vi phạm')
}
