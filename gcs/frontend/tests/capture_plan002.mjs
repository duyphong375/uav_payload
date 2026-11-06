// Chụp 6 route × 2 density × 2 độ phân giải + 6 route × 2 theme @1366×768.
// Ghi lỗi console, tràn ngang và ảnh evidence. Chỉ đọc/ghi ảnh; không sửa source.
//
// Biến môi trường:
//   KVC_BASE_URL  — mặc định http://127.0.0.1:5173
//   KVC_SHOT_DIR  — mặc định ../../review/KVC-GCS-UI/02-density-matrix (từ gcs/frontend)
//   KVC_DENSITY   — 'comfortable' | 'compact' | 'both' (mặc định 'both')
//   KVC_THEME     — 'dark' | 'light' | 'both' (mặc định 'both')
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = process.env.KVC_BASE_URL || 'http://127.0.0.1:5173'
const OUT = resolve(process.env.KVC_SHOT_DIR || '../../review/KVC-GCS-UI/02-density-matrix')
const DENSITY_ENV = process.env.KVC_DENSITY || 'both'
const THEME_ENV = process.env.KVC_THEME || 'both'

const ROUTES = [
  ['mission', '#/mission'],
  ['overview', '#/overview'],
  ['alerts', '#/alerts'],
  ['history', '#/history'],
  ['devices', '#/devices'],
  ['settings', '#/settings'],
]

const VIEWPORTS = [
  ['1920x1080', { width: 1920, height: 1080 }],
  ['1366x768', { width: 1366, height: 768 }],
  // Laptop 1366×768 có thanh trình duyệt / taskbar: chiều cao khả dụng ~640.
  ['1366x640', { width: 1366, height: 640 }],
  // Laptop nhỏ / zoom 125 %.
  ['1280x720', { width: 1280, height: 720 }],
  ['1024x768', { width: 1024, height: 768 }],
  // Tablet dọc.
  ['768x1024', { width: 768, height: 1024 }],
  // Điện thoại.
  ['390x844', { width: 390, height: 844 }],
  ['360x640', { width: 360, height: 640 }],
]

const THEME_SWITCH_VIEWPORT = { width: 1366, height: 768 }

const pick = (env, both) => (env === 'both' ? both : [env])
const DENSITIES = pick(DENSITY_ENV, ['comfortable', 'compact'])
const THEMES = pick(THEME_ENV, ['dark', 'light'])

/** Backend GCS không chạy trong môi trường chụp ảnh: ghi nhận riêng, không tính là lỗi UI. */
const isBackendOffline = (text) =>
  /ERR_CONNECTION_REFUSED|ERR_NETWORK/.test(text) && /127\.0\.0\.1:8000|localhost:8000/.test(text)

for (const d of DENSITIES) {
  if (d !== 'comfortable' && d !== 'compact') {
    throw new Error(`KVC_DENSITY không hợp lệ: ${d} (dùng comfortable|compact|both)`)
  }
}
for (const t of THEMES) {
  if (t !== 'dark' && t !== 'light') {
    throw new Error(`KVC_THEME không hợp lệ: ${t} (dùng dark|light|both)`)
  }
}

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const report = []

/** Đặt theme + density trước khi trang mount, rồi reload để provider đọc lại. */
async function prime(page, { theme, density }) {
  await page.goto(`${BASE}/#/mission`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    ({ theme: t, density: d }) => {
      localStorage.setItem('kvc_gcs_theme', t)
      localStorage.setItem('kvc_gcs_density', d)
    },
    { theme, density }
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1300)
}

async function measure(page) {
  return page.evaluate(() => {
    const root = document.documentElement
    const header = document.querySelector('header')
    const sidebar = document.querySelector('aside[aria-label="Điều hướng chính"]')
    const headerHeight = header ? Math.round(header.getBoundingClientRect().height) : null
    const sidebarWidth = sidebar ? Math.round(sidebar.getBoundingClientRect().width) : null
    const tableCell = document.querySelector('.kvc-density-cell')
    const cellStyle = tableCell ? getComputedStyle(tableCell) : null
    return {
      vw: root.clientWidth,
      vh: root.clientHeight,
      docW: root.scrollWidth,
      docH: root.scrollHeight,
      horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      verticalOverflow: root.scrollHeight > root.clientHeight + 1,
      density: root.dataset.density ?? null,
      theme: root.classList.contains('light') ? 'light' : 'dark',
      headerHeight,
      sidebarWidth,
      cellPadding: cellStyle
        ? `${cellStyle.paddingTop} ${cellStyle.paddingRight} ${cellStyle.paddingBottom} ${cellStyle.paddingLeft}`
        : null,
    }
  })
}

// Ma trận đầy đủ (2 density) chỉ chạy ở 2 độ phân giải chuẩn; các viewport bổ
// sung chỉ chạy `comfortable` để giữ thời gian chụp hợp lý.
const FULL_MATRIX_VIEWPORTS = new Set(['1920x1080', '1366x768'])

// ---------- Ma trận 1: route × density × viewport ----------
for (const [vpName, viewport] of VIEWPORTS) {
  const densitiesForViewport = FULL_MATRIX_VIEWPORTS.has(vpName) ? DENSITIES : ['comfortable']
  for (const density of densitiesForViewport) {
    for (const theme of ['dark']) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
      const page = await context.newPage()
      const consoleErrors = []
      const backendOffline = []
      page.on('console', (msg) => {
        if (msg.type() !== 'error') return
        const text = msg.text()
        if (isBackendOffline(`${text} ${msg.location().url}`)) backendOffline.push(text)
        else consoleErrors.push(text)
      })
      page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`))

      await prime(page, { theme, density })

      for (const [name, hash] of ROUTES) {
        consoleErrors.length = 0
        backendOffline.length = 0
        await page.goto(`${BASE}/${hash}`, { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(1200)

        const metrics = await measure(page)
        const file = `${vpName}-${density}-${name}.png`
        await page.screenshot({ path: resolve(OUT, file), fullPage: false })
        report.push({
          kind: 'density',
          viewport: vpName,
          density,
          theme,
          route: name,
          file,
          metrics,
          consoleErrors: [...consoleErrors],
          backendOffline: [...backendOffline],
        })
        process.stdout.write(
          `shot ${file} density=${metrics.density} header=${metrics.headerHeight} sidebar=${metrics.sidebarWidth} overflowH=${metrics.horizontalOverflow} errors=${consoleErrors.length} backendOffline=${backendOffline.length}\n`
        )
      }

      await context.close()
    }
  }
}

// ---------- Ma trận 2: route × theme @1366×768 ----------
for (const theme of THEMES) {
  const context = await browser.newContext({
    viewport: THEME_SWITCH_VIEWPORT,
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()
  const consoleErrors = []
  const backendOffline = []
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (isBackendOffline(`${text} ${msg.location().url}`)) backendOffline.push(text)
    else consoleErrors.push(text)
  })
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`))

  await prime(page, { theme, density: 'comfortable' })

  for (const [name, hash] of ROUTES) {
    consoleErrors.length = 0
    backendOffline.length = 0
    await page.goto(`${BASE}/${hash}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)

    const metrics = await measure(page)
    const file = `1366x768-comfortable-${theme}-${name}.png`
    await page.screenshot({ path: resolve(OUT, file), fullPage: false })
    report.push({
      kind: 'theme',
      viewport: '1366x768',
      density: 'comfortable',
      theme,
      route: name,
      file,
      metrics,
      consoleErrors: [...consoleErrors],
      backendOffline: [...backendOffline],
    })
    process.stdout.write(
      `${file} themeApplied=${metrics.theme} density=${metrics.density} overflowH=${metrics.horizontalOverflow} errors=${consoleErrors.length} backendOffline=${backendOffline.length}\n`
    )
  }

  await context.close()
}

// ---------- Kiểm tra density giữ sau reload ----------
{
  const context = await browser.newContext({ viewport: THEME_SWITCH_VIEWPORT })
  const page = await context.newPage()
  await prime(page, { theme: 'dark', density: 'comfortable' })
  await page.goto(`${BASE}/#/settings`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('group', { name: 'Chọn mật độ hiển thị' }).waitFor({ state: 'visible' })
  await page
    .getByRole('group', { name: 'Chọn mật độ hiển thị' })
    .getByRole('button', { name: 'Gọn' })
    .click()
  await page.waitForTimeout(400)
  const afterClick = await page.evaluate(() => document.documentElement.dataset.density ?? null)
  const storedAfterClick = await page.evaluate(() => localStorage.getItem('kvc_gcs_density'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  const afterReload = await page.evaluate(() => document.documentElement.dataset.density ?? null)
  const persisted = afterClick === 'compact' && afterReload === 'compact'
  report.push({
    kind: 'density-persistence',
    clicked: afterClick,
    storedAfterClick,
    afterReload,
    persisted,
  })
  process.stdout.write(
    `density persistence: click=${afterClick} stored=${storedAfterClick} reload=${afterReload} persisted=${persisted}\n`
  )
  await context.close()
}

await browser.close()

const summary = {
  out: OUT,
  densities: DENSITIES,
  themes: THEMES,
  shots: report.filter((r) => r.file).length,
  horizontalOverflow: report.filter((r) => r.metrics?.horizontalOverflow).length,
  consoleErrorRoutes: report.filter((r) => r.consoleErrors?.length > 0).length,
  backendOfflineRoutes: report.filter((r) => r.backendOffline?.length > 0).length,
  densityPersistence: report.find((r) => r.kind === 'density-persistence'),
  report,
}

writeFileSync(resolve(OUT, 'capture-report.json'), JSON.stringify(summary, null, 2))
console.log(
  JSON.stringify(
    {
      out: summary.out,
      shots: summary.shots,
      horizontalOverflow: summary.horizontalOverflow,
      consoleErrorRoutes: summary.consoleErrorRoutes,
      backendOfflineRoutes: summary.backendOfflineRoutes,
      densityPersistence: summary.densityPersistence,
    },
    null,
    2
  )
)
