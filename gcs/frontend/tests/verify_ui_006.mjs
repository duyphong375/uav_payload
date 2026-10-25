import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const OUT_DIR = path.resolve(import.meta.dirname, '../../../review/KVC-GCS-UI-006')
const BASE_URL = 'http://localhost:5173'

async function runVerification() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true })
  }

  const browser = await chromium.launch({ headless: true })

  const contextDark = await browser.newContext({
    viewport: { width: 1440, height: 950 },
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const page = await contextDark.newPage()

  await page.goto(`${BASE_URL}/#/overview`, { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    localStorage.setItem('kvc_theme', 'dark')
    document.documentElement.classList.add('dark')
    document.documentElement.classList.remove('light')
  })
  await page.waitForTimeout(1000)

  // 1. Chụp phần trên Overview Dark Mode
  await page.screenshot({
    path: path.join(OUT_DIR, '01_overview_dark_mode_top.png'),
    fullPage: false,
  })

  // 2. Cuộn tất cả các container có overflow-y-auto
  await page.evaluate(() => {
    const containers = document.querySelectorAll('.overflow-y-auto')
    containers.forEach((c) => {
      c.scrollTop = c.scrollHeight
    })
  })
  await page.waitForTimeout(800)

  await page.screenshot({
    path: path.join(OUT_DIR, '02_overview_dark_mode_table_and_ticker.png'),
    fullPage: false,
  })

  await browser.close()
  console.log('Đã cập nhật ảnh chụp cuộn xuống bảng!')
}

runVerification().catch((err) => {
  console.error(err)
  process.exit(1)
})
