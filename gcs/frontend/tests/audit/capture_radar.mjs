// Chụp chế độ RADAR và SPLIT của trang mission để kiểm tra R2 (bảng radar).
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = process.env.KVC_BASE_URL || 'http://127.0.0.1:5173'
const OUT = resolve(process.env.KVC_SHOT_DIR || '../review/KVC-GCS-UI/02-after-layout')
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } })

for (const theme of ['dark', 'light']) {
  const page = await context.newPage()
  await page.goto(`${BASE}/#/mission`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((t) => localStorage.setItem('kvc_gcs_theme', t), theme)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)

  for (const [name, label] of [
    ['radar', /Radar Local/i],
    ['split', /Hai khung song song/i],
  ]) {
    const btn = page.getByRole('button', { name: label })
    if ((await btn.count()) === 0) {
      console.log(`${theme}-${name}: button not found`)
      continue
    }
    await btn.first().click()
    await page.waitForTimeout(700)
    await page.screenshot({ path: resolve(OUT, `${theme}-mission-${name}.png`) })
    console.log(`${theme}-mission-${name}.png`)
  }
  await page.close()
}

await browser.close()
