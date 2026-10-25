import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const OUT_DIR = path.resolve(import.meta.dirname, '../../../review/KVC-GCS-UI-007')
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

  // 1. Vào trang Giám sát trực tiếp (Mission)
  await page.goto(`${BASE_URL}/#/mission`, { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    localStorage.setItem('kvc_theme', 'dark')
    document.documentElement.classList.add('dark')
    document.documentElement.classList.remove('light')
  })
  await page.waitForTimeout(1000)

  // 1.1 Chụp trang Giám sát trực tiếp với nút chuyển lớp Vệ tinh Google Maps ở góc dưới trái
  await page.screenshot({
    path: path.join(OUT_DIR, '01_mission_page_default_map.png'),
    fullPage: false,
  })

  // 1.2 Nhấp nút chuyển lớp Vệ tinh
  const satLayerBtn = page.getByRole('button', { name: /Chuyển sang chế độ Vệ tinh 3D/i })
  if (await satLayerBtn.isVisible()) {
    await satLayerBtn.click()
    await page.waitForTimeout(1000)
    await page.screenshot({
      path: path.join(OUT_DIR, '02_mission_page_satellite_layer.png'),
      fullPage: false,
    })
  }

  // 1.3 Nhấp vào nút GNSS trên AppHeader để mở Phần Vệ Tinh (GnssSatelliteSheet)
  const gnssHeaderBtn = page.getByRole('button', { name: /Xem chi tiết vệ tinh GNSS/i })
  if (await gnssHeaderBtn.isVisible()) {
    await gnssHeaderBtn.click()
    await page.waitForTimeout(1000)
    await page.screenshot({
      path: path.join(OUT_DIR, '03_gnss_satellite_sheet_open.png'),
      fullPage: false,
    })
  }

  // 1.4 Đóng sheet và chuyển sang Overview
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)

  await page.goto(`${BASE_URL}/#/overview`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)

  // Cuộn đến bảng phần cứng và nhấp GNSS NEO-M8N / ATGM336H
  const gnssCard = page.locator('text=1. GNSS NEO-M8N / ATGM336H')
  if (await gnssCard.isVisible()) {
    await gnssCard.click()
    await page.waitForTimeout(1000)
    await page.screenshot({
      path: path.join(OUT_DIR, '04_overview_gnss_sheet_from_hardware.png'),
      fullPage: false,
    })
  }

  await browser.close()
  console.log('Đã hoàn thành chụp ảnh kiểm chứng phần vệ tinh!')
}

runVerification().catch((err) => {
  console.error(err)
  process.exit(1)
})
