import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const OUT_DIR = path.resolve(import.meta.dirname, '../../../review/KVC-GCS-UI-003')
const BASE_URL = 'http://localhost:4173'

async function runVerification() {
  console.log('=== BẮT ĐẦU KIỂM CHỨNG TỰ ĐỘNG KVC-GCS-UI-003 (SORTIX STYLE) ===')
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true })
  }

  const browser = await chromium.launch({ headless: true })
  const consoleErrors = []

  // Khởi tạo page 1920x1080
  const page1920 = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  page1920.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(`[1920 Console Error]: ${msg.text()}`)
    }
  })

  // 1. Mở trang Giám sát trực tiếp (Mặc định) - 1920x1080 Dark Mode
  console.log('[1/10] Kiểm tra Giám sát trực tiếp 1920x1080 Dark...')
  await page1920.goto(`${BASE_URL}/#/mission`, { waitUntil: 'networkidle' })
  await page1920.waitForTimeout(2000)
  await page1920.screenshot({
    path: path.join(OUT_DIR, '01_mission_1920_dark.png'),
    fullPage: false,
  })
  console.log('-> Đã lưu: 01_mission_1920_dark.png')

  // 2. Chuyển sang Light Mode trên trang Giám sát trực tiếp
  console.log('[2/10] Kiểm tra chuyển đổi sang Light Mode...')
  const themeBtn = await page1920.locator('button[aria-label*="Chọn giao diện"]').first()
  if (await themeBtn.isVisible()) {
    await themeBtn.click()
    await page1920.waitForTimeout(400)
    const lightOpt = await page1920.locator('text=Sáng (Light)').first()
    if (await lightOpt.isVisible()) {
      await lightOpt.click()
      await page1920.waitForTimeout(1000)
    }
  }
  await page1920.screenshot({
    path: path.join(OUT_DIR, '02_mission_1920_light.png'),
    fullPage: false,
  })
  console.log('-> Đã lưu: 02_mission_1920_light.png')

  // 3. Mở trang Tổng quan (#/overview)
  console.log('[3/10] Kiểm tra Trang Tổng quan (#/overview)...')
  await page1920.goto(`${BASE_URL}/#/overview`, { waitUntil: 'networkidle' })
  await page1920.waitForTimeout(1000)
  await page1920.screenshot({
    path: path.join(OUT_DIR, '03_overview_1920_light.png'),
    fullPage: false,
  })
  console.log('-> Đã lưu: 03_overview_1920_light.png')

  // 4. Mở Trung tâm Cảnh báo (#/alerts)
  console.log('[4/10] Kiểm tra Trung tâm Cảnh báo (#/alerts)...')
  await page1920.goto(`${BASE_URL}/#/alerts`, { waitUntil: 'networkidle' })
  await page1920.waitForTimeout(1000)
  await page1920.screenshot({
    path: path.join(OUT_DIR, '04_alerts_1920_light.png'),
    fullPage: false,
  })
  console.log('-> Đã lưu: 04_alerts_1920_light.png')

  // 5. Mở Nhật ký phiên (#/history)
  console.log('[5/10] Kiểm tra Nhật ký phiên (#/history)...')
  await page1920.goto(`${BASE_URL}/#/history`, { waitUntil: 'networkidle' })
  await page1920.waitForTimeout(1000)
  await page1920.screenshot({
    path: path.join(OUT_DIR, '05_history_1920_light.png'),
    fullPage: false,
  })
  console.log('-> Đã lưu: 05_history_1920_light.png')

  // 6. Mở Thiết bị & kết nối (#/devices)
  console.log('[6/10] Kiểm tra Thiết bị & kết nối (#/devices)...')
  await page1920.goto(`${BASE_URL}/#/devices`, { waitUntil: 'networkidle' })
  await page1920.waitForTimeout(1000)
  await page1920.screenshot({
    path: path.join(OUT_DIR, '06_devices_1920_light.png'),
    fullPage: false,
  })
  console.log('-> Đã lưu: 06_devices_1920_light.png')

  // 7. Chuyển lại Dark Mode và kiểm tra Viewport 1366x768
  console.log('[7/10] Kiểm tra Viewport 1366x768 (Laptop HD)...')
  const page1366 = await browser.newPage({ viewport: { width: 1366, height: 768 } })
  await page1366.goto(`${BASE_URL}/#/mission`, { waitUntil: 'networkidle' })
  await page1366.waitForTimeout(1500)
  await page1366.screenshot({
    path: path.join(OUT_DIR, '07_mission_1366_dark.png'),
    fullPage: false,
  })
  console.log('-> Đã lưu: 07_mission_1366_dark.png')

  // 8. Kiểm tra Thu gọn Sidebar (64px) trên 1366x768
  console.log('[8/10] Kiểm tra Sidebar thu gọn...')
  const collapseBtn = await page1366.locator('button[title*="Thu gọn thanh điều hướng"]').first()
  if (await collapseBtn.isVisible()) {
    await collapseBtn.click()
    await page1366.waitForTimeout(800)
  }
  await page1366.screenshot({
    path: path.join(OUT_DIR, '08_mission_1366_collapsed_sidebar.png'),
    fullPage: false,
  })
  console.log('-> Đã lưu: 08_mission_1366_collapsed_sidebar.png')

  // 9. Kiểm tra Bố cục Ưu tiên Video trên 1366x768
  console.log('[9/10] Kiểm tra Bố cục Ưu tiên Video...')
  const videoTab = await page1366.locator('[role="tab"]:has-text("Ưu tiên Video")').first()
  if (await videoTab.isVisible()) {
    await videoTab.click()
    await page1366.waitForTimeout(800)
  }
  await page1366.screenshot({
    path: path.join(OUT_DIR, '09_mission_video_priority.png'),
    fullPage: false,
  })
  console.log('-> Đã lưu: 09_mission_video_priority.png')

  // 10. Kiểm tra Mobile Viewport 390x844 (iPhone 12/13/14)
  console.log('[10/10] Kiểm tra Mobile Viewport 390x844...')
  const pageMobile = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await pageMobile.goto(`${BASE_URL}/#/mission`, { waitUntil: 'networkidle' })
  await pageMobile.waitForTimeout(1000)
  await pageMobile.screenshot({
    path: path.join(OUT_DIR, '10_mobile_mission.png'),
    fullPage: false,
  })
  console.log('-> Đã lưu: 10_mobile_mission.png')

  await browser.close()
  console.log('=== HOÀN TẤT KIỂM CHỨNG TRÌNH DUYỆT ===')
  if (consoleErrors.length > 0) {
    console.error('Phát hiện các lỗi console:', consoleErrors)
  } else {
    console.log('Không phát hiện lỗi console nào trong luồng kiểm chứng!')
  }
}

runVerification().catch((err) => {
  console.error('Lỗi khi chạy kiểm chứng:', err)
  process.exit(1)
})
