import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const OUT_DIR = path.resolve(import.meta.dirname, '../../../review/KVC-GCS-FE-002')

async function runVerification() {
  console.log('--- BẮT ĐẦU KIỂM CHỨNG TRÌNH DUYỆT TỰ ĐỘNG BẰNG PLAYWRIGHT ---')
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true })
  }

  const browser = await chromium.launch({ headless: true })
  const consoleErrors = []

  // Test 1: Viewport 1920x1080 - Dark Mode
  console.log('[1/6] Kiểm tra Viewport 1920x1080 (Dark Mode)...')
  const page1920 = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  page1920.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text())
    }
  })

  await page1920.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
  await page1920.waitForTimeout(2000)

  await page1920.screenshot({
    path: path.join(OUT_DIR, 'screenshot_1920_dark.png'),
    fullPage: false,
  })
  console.log('-> Đã lưu ảnh: screenshot_1920_dark.png')

  // Test 2: Chuyển sang Light Mode
  console.log('[2/6] Kiểm tra chuyển đổi sang Light Mode...')
  const themeBtn = await page1920.locator('button[aria-label*="Chọn giao diện"]').first()
  if (await themeBtn.isVisible()) {
    await themeBtn.click()
    await page1920.waitForTimeout(500)
    const lightOption = await page1920.locator('text=Sáng (Light)').first()
    if (await lightOption.isVisible()) {
      await lightOption.click()
      await page1920.waitForTimeout(1000)
    }
  }
  await page1920.screenshot({
    path: path.join(OUT_DIR, 'screenshot_1920_light.png'),
    fullPage: false,
  })
  console.log('-> Đã lưu ảnh: screenshot_1920_light.png')

  // Test 3: Viewport 1366x768 (Dark Mode)
  console.log('[3/6] Kiểm tra Viewport 1366x768...')
  const page1366 = await browser.newPage({ viewport: { width: 1366, height: 768 } })
  await page1366.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
  await page1366.waitForTimeout(1500)
  await page1366.screenshot({
    path: path.join(OUT_DIR, 'screenshot_1366_dark.png'),
    fullPage: false,
  })
  console.log('-> Đã lưu ảnh: screenshot_1366_dark.png')

  // Test 4: Đổi bố cục màn hình (Ưu tiên Video / Cân bằng)
  console.log('[4/6] Kiểm tra chuyển đổi bố cục...')
  const videoPriorityBtn = await page1366.locator('button:has-text("Ưu tiên Video"), [role="tab"]:has-text("Ưu tiên Video")').first()
  if (await videoPriorityBtn.isVisible()) {
    await videoPriorityBtn.click()
    await page1366.waitForTimeout(1000)
  }
  await page1366.screenshot({
    path: path.join(OUT_DIR, 'screenshot_layout_video_priority.png'),
    fullPage: false,
  })
  console.log('-> Đã lưu ảnh: screenshot_layout_video_priority.png')

  // Test 5: Kịch bản MOCK Mất GPS (GNSS Lost Fix)
  console.log('[5/6] Kiểm tra Kịch bản MOCK: Mất GPS fix...')
  const settingsBtn = await page1920.locator('button[aria-label*="Mở bảng cài đặt"]').first()
  if (await settingsBtn.isVisible()) {
    await settingsBtn.click()
    await page1920.waitForTimeout(800)

    const selectTrigger = await page1920.locator('button[role="combobox"]').first()
    if (await selectTrigger.isVisible()) {
      await selectTrigger.click()
      await page1920.waitForTimeout(500)
      const lostGpsItem = await page1920.locator('[role="option"]:has-text("GNSS Mất Fix")').first()
      if (await lostGpsItem.isVisible()) {
        await lostGpsItem.click()
        await page1920.waitForTimeout(1500)
      }
    }
    await page1920.keyboard.press('Escape')
    await page1920.waitForTimeout(1000)
  }
  await page1920.screenshot({
    path: path.join(OUT_DIR, 'screenshot_mock_lost_gps.png'),
    fullPage: false,
  })
  console.log('-> Đã lưu ảnh: screenshot_mock_lost_gps.png')

  // Test 6: Kịch bản MOCK Hệ Local Cục Bộ (LOCAL_GRID XY cm)
  console.log('[6/6] Kiểm tra Kịch bản MOCK: Hệ Local LOCAL_GRID...')
  if (await settingsBtn.isVisible()) {
    await settingsBtn.click()
    await page1920.waitForTimeout(800)

    const selectTrigger = await page1920.locator('button[role="combobox"]').first()
    if (await selectTrigger.isVisible()) {
      await selectTrigger.click()
      await page1920.waitForTimeout(500)
      const localGridItem = await page1920.locator('[role="option"]:has-text("Hệ Local Cục Bộ")').first()
      if (await localGridItem.isVisible()) {
        await localGridItem.click()
        await page1920.waitForTimeout(1500)
      }
    }
    await page1920.keyboard.press('Escape')
    await page1920.waitForTimeout(1000)
  }
  await page1920.screenshot({
    path: path.join(OUT_DIR, 'screenshot_mock_local_grid.png'),
    fullPage: false,
  })
  console.log('-> Đã lưu ảnh: screenshot_mock_local_grid.png')

  await browser.close()

  console.log('\n--- KẾT QUẢ KIỂM CHỨNG TRÌNH DUYỆT ---')
  console.log(`Số lượng Console Errors: ${consoleErrors.length}`)
  if (consoleErrors.length > 0) {
    console.error('Console errors:', consoleErrors)
  } else {
    console.log('-> XÁC NHẬN: Không có lỗi console không giải thích được!')
  }
  console.log('Hoàn thành kiểm tra trình duyệt Playwright.')
}

runVerification().catch((err) => {
  console.error('Lỗi thực thi kiểm chứng:', err)
  process.exit(1)
})
