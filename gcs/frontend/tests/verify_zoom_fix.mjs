import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const OUT_DIR = path.resolve(import.meta.dirname, '../../../review/KVC-GCS-UI-008')
const BASE_URL = 'http://localhost:5173'

async function runZoomVerification() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true })
  }

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({
    viewport: { width: 1440, height: 950 },
    permissions: ['clipboard-read', 'clipboard-write'],
  })

  await page.goto(`${BASE_URL}/#/mission`, { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    localStorage.setItem('kvc_theme', 'dark')
    document.documentElement.classList.add('dark')
    document.documentElement.classList.remove('light')
  })
  await page.waitForTimeout(1000)

  // 1. Chuyển sang lớp Vệ tinh
  const satBtn = page.getByRole('button', { name: /Chuyển sang chế độ Vệ tinh 3D/i })
  if (await satBtn.isVisible()) {
    await satBtn.click()
    await page.waitForTimeout(1500)
  }

  // Chụp cấp zoom ban đầu (Zoom 17)
  await page.screenshot({
    path: path.join(OUT_DIR, '01_satellite_zoom_17_initial.png'),
    fullPage: false,
  })

  // 2. Phóng to từng cấp qua nút Zoom In (+)
  const zoomInBtn = page.locator('.leaflet-control-zoom-in')

  // Zoom đến 18
  await zoomInBtn.click()
  await page.waitForTimeout(1000)
  await page.screenshot({
    path: path.join(OUT_DIR, '02_satellite_zoom_18.png'),
    fullPage: false,
  })

  // Zoom đến 19
  await zoomInBtn.click()
  await page.waitForTimeout(1000)
  await page.screenshot({
    path: path.join(OUT_DIR, '03_satellite_zoom_19.png'),
    fullPage: false,
  })

  // Zoom đến 20 (Cận cảnh mặt đất)
  await zoomInBtn.click()
  await page.waitForTimeout(1000)
  await page.screenshot({
    path: path.join(OUT_DIR, '04_satellite_zoom_20_close_up.png'),
    fullPage: false,
  })

  // Zoom đến 21 (Cận cảnh cực đại)
  await zoomInBtn.click()
  await page.waitForTimeout(1000)
  await page.screenshot({
    path: path.join(OUT_DIR, '05_satellite_zoom_21_max.png'),
    fullPage: false,
  })

  // Kiểm tra trạng thái tile
  const report = await page.evaluate(() => {
    const images = Array.from(document.querySelectorAll('.leaflet-tile-pane img')).map(img => ({
      src: img.src,
      complete: img.complete,
      naturalWidth: img.naturalWidth,
    }))
    const broken = images.filter(img => img.naturalWidth === 0)
    const hasOfflineBanner = document.body.innerText.includes('Bản đồ nền Internet không phản hồi')
    return {
      totalTiles: images.length,
      brokenTiles: broken.length,
      hasOfflineBanner,
    }
  })

  console.log('Báo cáo kiểm thử Zoom Fix:', JSON.stringify(report, null, 2))
  await browser.close()
}

runZoomVerification().catch(console.error)
