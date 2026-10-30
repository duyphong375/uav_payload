// Chụp 6 route × 2 độ phân giải; ghi lỗi console và phần tử tràn.
// Chỉ đọc/ghi ảnh evidence; không sửa source.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = process.env.KVC_BASE_URL || 'http://127.0.0.1:5173'
const OUT = resolve(process.env.KVC_SHOT_DIR || '../review/KVC-GCS-PLAN-002/70-verify/screens')

const ROUTES = [
  ['mission', '#/mission'],
  ['overview', '#/overview'],
  ['alerts', '#/alerts'],
  ['history', '#/history'],
  ['devices', '#/devices'],
  ['settings', '#/settings'],
]

const VIEWPORTS = [
  ['1366x768', { width: 1366, height: 768 }],
  ['1920x1080', { width: 1920, height: 1080 }],
]

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const report = []

for (const [vpName, viewport] of VIEWPORTS) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`))

  for (const [name, hash] of ROUTES) {
    consoleErrors.length = 0
    await page.goto(`${BASE}/${hash}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)

    const overflow = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth
      const vh = document.documentElement.clientHeight
      const docW = document.documentElement.scrollWidth
      const docH = document.documentElement.scrollHeight
      return { vw, vh, docW, docH, horizontalOverflow: docW > vw + 1, verticalOverflow: docH > vh + 1 }
    })

    const file = `${vpName}-${name}.png`
    await page.screenshot({ path: resolve(OUT, file), fullPage: false })
    report.push({ viewport: vpName, route: name, file, overflow, consoleErrors: [...consoleErrors] })
    process.stdout.write(`shot ${file} overflow=${overflow.horizontalOverflow}/${overflow.verticalOverflow} errors=${consoleErrors.length}\n`)
  }

  await context.close()
}

// Ảnh theme sáng cho Mission
const lightContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
const lightPage = await lightContext.newPage()
await lightPage.goto(`${BASE}/#/mission`, { waitUntil: 'domcontentloaded' })
await lightPage.evaluate(() => {
  localStorage.setItem('theme', 'light')
  document.documentElement.classList.remove('dark')
  document.documentElement.classList.add('light')
})
await lightPage.waitForTimeout(800)
await lightPage.screenshot({ path: resolve(OUT, '1920x1080-mission-light.png') })
await lightContext.close()

await browser.close()

console.log(JSON.stringify({ out: OUT, shots: report.length, report }, null, 2))
