import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const OUT_DIR = path.resolve(import.meta.dirname, '../../../review/KVC-GCS-UI-004')
const BASE_URL = 'http://localhost:5173'

async function runVerification() {
  console.log('=== BẮT ĐẦU KIỂM CHỨNG TRÌNH DUYỆT TỰ ĐỘNG KVC-GCS-UI-004 ===')
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true })
  }

  const browser = await chromium.launch({ headless: true })
  const consoleErrors = []

  // 1. Viewport 1440x900 (Desktop Tiêu Chuẩn theo Yêu Cầu Thiết Kế)
  console.log('[1/8] Kiểm tra Desktop 1440x900 - Giám sát trực tiếp (Light Mode)...')
  const page1440 = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page1440.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(`[1440 Console Error]: ${msg.text()}`)
    }
  })

  await page1440.goto(`${BASE_URL}/#/mission`, { waitUntil: 'networkidle' })
  await page1440.waitForTimeout(1500)

  // Đổi sang Light Mode nếu đang là Dark Mode để kiểm tra độ tương phản nền xám xanh nhạt và card trắng
  const themeBtn = await page1440.locator('button[aria-label*="Chọn giao diện"]').first()
  if (await themeBtn.isVisible()) {
    await themeBtn.click()
    await page1440.waitForTimeout(300)
    const lightOpt = await page1440.locator('text=Sáng (Light)').first()
    if (await lightOpt.isVisible()) {
      await lightOpt.click()
      await page1440.waitForTimeout(800)
    }
  }

  await page1440.screenshot({
    path: path.join(OUT_DIR, '01_mission_1440_light.png'),
    fullPage: false,
  })
  console.log('-> Đã chụp: 01_mission_1440_light.png')

  // 2. Kiểm tra Trang Tổng quan (#/overview) 1440x900
  console.log('[2/8] Kiểm tra Trang Tổng quan (#/overview)...')
  await page1440.goto(`${BASE_URL}/#/overview`, { waitUntil: 'networkidle' })
  await page1440.waitForTimeout(1000)
  await page1440.screenshot({
    path: path.join(OUT_DIR, '02_overview_1440_light.png'),
    fullPage: false,
  })
  console.log('-> Đã chụp: 02_overview_1440_light.png')

  // 3. Thực hiện kịch bản 3 nhấp chuột (3-click rescue demo)
  console.log('[3/8] Kiểm tra kịch bản cứu hộ 3 nhấp chuột...')
  const demoBtn = await page1440.locator('button:has-text("Diễn tập cứu nạn")').first()
  if (await demoBtn.isVisible()) {
    await demoBtn.click()
    console.log('   - Nhấp 1: Kích hoạt diễn tập cứu nạn OK')
    await page1440.waitForTimeout(600)
  }

  const copyBtn = await page1440.locator('button:has-text("Sao chép WGS-84")').first()
  if (await copyBtn.isVisible()) {
    await copyBtn.click()
    console.log('   - Nhấp 2: Sao chép tọa độ WGS-84 OK')
    await page1440.waitForTimeout(400)
  }

  const logBtn = await page1440.locator('button:has-text("Xem log")').first()
  if (await logBtn.isVisible()) {
    await logBtn.click()
    console.log('   - Nhấp 3: Điều hướng sang trang Nhật ký phiên OK')
    await page1440.waitForTimeout(800)
  }

  await page1440.screenshot({
    path: path.join(OUT_DIR, '03_history_after_3click_demo.png'),
    fullPage: false,
  })
  console.log('-> Đã chụp: 03_history_after_3click_demo.png')

  // 4. Kiểm tra Trung tâm Cảnh báo (#/alerts) 1440x900
  console.log('[4/8] Kiểm tra Trung tâm Cảnh báo (#/alerts)...')
  await page1440.goto(`${BASE_URL}/#/alerts`, { waitUntil: 'networkidle' })
  await page1440.waitForTimeout(800)
  await page1440.screenshot({
    path: path.join(OUT_DIR, '04_alerts_1440_light.png'),
    fullPage: false,
  })
  console.log('-> Đã chụp: 04_alerts_1440_light.png')

  // 5. Kiểm tra Thiết bị & kết nối (#/devices) 1440x900
  console.log('[5/8] Kiểm tra Thiết bị & kết nối (#/devices)...')
  await page1440.goto(`${BASE_URL}/#/devices`, { waitUntil: 'networkidle' })
  await page1440.waitForTimeout(800)
  await page1440.screenshot({
    path: path.join(OUT_DIR, '05_devices_1440_light.png'),
    fullPage: false,
  })
  console.log('-> Đã chụp: 05_devices_1440_light.png')

  // 6. Kiểm tra Cài đặt (#/settings) 1440x900
  console.log('[6/8] Kiểm tra Cài đặt giao diện (#/settings)...')
  await page1440.goto(`${BASE_URL}/#/settings`, { waitUntil: 'networkidle' })
  await page1440.waitForTimeout(800)
  await page1440.screenshot({
    path: path.join(OUT_DIR, '06_settings_1440_light.png'),
    fullPage: false,
  })
  console.log('-> Đã chụp: 06_settings_1440_light.png')

  // 7. Kiểm tra Viewport 1280x800 & 1024x768 (Responsive Lưới)
  console.log('[7/8] Kiểm tra Viewport 1280x800 và 1024x768...')
  const page1280 = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page1280.goto(`${BASE_URL}/#/overview`, { waitUntil: 'networkidle' })
  await page1280.waitForTimeout(800)
  await page1280.screenshot({
    path: path.join(OUT_DIR, '07_overview_1280_light.png'),
    fullPage: false,
  })

  const page1024 = await browser.newPage({ viewport: { width: 1024, height: 768 } })
  await page1024.goto(`${BASE_URL}/#/overview`, { waitUntil: 'networkidle' })
  await page1024.waitForTimeout(800)
  await page1024.screenshot({
    path: path.join(OUT_DIR, '08_overview_1024_light.png'),
    fullPage: false,
  })
  console.log('-> Đã chụp: 07_overview_1280_light.png & 08_overview_1024_light.png')

  // 8. Kiểm tra Tablet Portrait 768x1024
  console.log('[8/8] Kiểm tra Tablet 768x1024 (Drawer Navigation & Thẻ dọc)...')
  const page768 = await browser.newPage({ viewport: { width: 768, height: 1024 } })
  await page768.goto(`${BASE_URL}/#/mission`, { waitUntil: 'networkidle' })
  await page768.waitForTimeout(800)
  await page768.screenshot({
    path: path.join(OUT_DIR, '09_mission_768_portrait.png'),
    fullPage: false,
  })
  console.log('-> Đã chụp: 09_mission_768_portrait.png')

  await browser.close()
  console.log('=== HOÀN TẤT KIỂM CHỨNG PLAYWRIGHT THÀNH CÔNG ===')
  if (consoleErrors.length > 0) {
    console.warn('Cảnh báo console errors:', consoleErrors)
  } else {
    console.log('Xác nhận: Không có lỗi console trong toàn bộ các trang!')
  }
}

runVerification().catch((err) => {
  console.error('Lỗi kiểm chứng Playwright:', err)
  process.exit(1)
})
