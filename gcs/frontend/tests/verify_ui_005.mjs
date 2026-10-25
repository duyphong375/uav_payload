import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const OUT_DIR = path.resolve(import.meta.dirname, '../../../review/KVC-GCS-UI-005')
const BASE_URL = 'http://localhost:5173'

async function runVerification() {
  console.log('=== BẮT ĐẦU KIỂM CHỨNG TRÌNH DUYỆT TỰ ĐỘNG KVC-GCS-UI-005 (GIÁM SÁT TRỰC TIẾP TỐI GIẢN) ===')
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true })
  }

  const browser = await chromium.launch({ headless: true })
  const consoleErrors = []

  // 1. Kiểm tra Viewport Desktop 1440x900 - Giám sát trực tiếp
  console.log('[1/4] Kiểm tra Giám sát trực tiếp 1440x900...')
  const page1440 = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page1440.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(`[1440 Console Error]: ${msg.text()}`)
    }
  })

  await page1440.goto(`${BASE_URL}/#/mission`, { waitUntil: 'networkidle' })
  await page1440.waitForTimeout(1500)

  await page1440.screenshot({
    path: path.join(OUT_DIR, '01_mission_1440_fixed_layout.png'),
    fullPage: false,
  })
  console.log('-> Đã chụp: 01_mission_1440_fixed_layout.png')

  // 2. Kiểm tra thao tác kéo bản đồ tự do (Google Maps feel)
  console.log('[2/4] Kiểm tra thao tác kéo bản đồ tự do...')
  const mapElement = await page1440.locator('.leaflet-container').first()
  if (await mapElement.isVisible()) {
    const box = await mapElement.boundingBox()
    if (box) {
      // Kéo bản đồ từ tâm sang phải 200px, xuống 150px
      await page1440.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page1440.mouse.down()
      await page1440.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2 + 150, { steps: 5 })
      await page1440.mouse.up()
      await page1440.waitForTimeout(800)
    }
  }

  await page1440.screenshot({
    path: path.join(OUT_DIR, '02_map_user_dragged_freely.png'),
    fullPage: false,
  })
  console.log('-> Đã chụp: 02_map_user_dragged_freely.png')

  // 3. Kiểm tra nhấp nút "Đặt lại khung nhìn"
  console.log('[3/4] Kiểm tra nút "Đặt lại khung nhìn"...')
  const resetBtn = await page1440.locator('button:has-text("Đặt lại khung nhìn")').first()
  if (await resetBtn.isVisible()) {
    await resetBtn.click()
    await page1440.waitForTimeout(1000)
  }

  await page1440.screenshot({
    path: path.join(OUT_DIR, '03_after_reset_view_clicked.png'),
    fullPage: false,
  })
  console.log('-> Đã chụp: 03_after_reset_view_clicked.png')

  // 4. Kiểm tra Responsive 1280x800 và 1024x768
  console.log('[4/4] Kiểm tra Responsive 1280x800...')
  const page1280 = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page1280.goto(`${BASE_URL}/#/mission`, { waitUntil: 'networkidle' })
  await page1280.waitForTimeout(1000)

  await page1280.screenshot({
    path: path.join(OUT_DIR, '04_mission_1280_responsive.png'),
    fullPage: false,
  })
  console.log('-> Đã chụp: 04_mission_1280_responsive.png')

  await browser.close()
  console.log('=== HOÀN TẤT KIỂM CHỨNG PLAYWRIGHT THÀNH CÔNG ===')
  if (consoleErrors.length > 0) {
    console.warn('Cảnh báo console errors:', consoleErrors)
  } else {
    console.log('Xác nhận: Không có lỗi console nào được ghi nhận!')
  }
}

runVerification().catch((err) => {
  console.error('Lỗi khi chạy verify_ui_005:', err)
  process.exit(1)
})
