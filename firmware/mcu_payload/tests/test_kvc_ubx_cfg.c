/**
 * @file test_kvc_ubx_cfg.c
 * @brief Host test cho khung UBX CFG-PRT (đổi baud module GNSS NEO-M10-0-10).
 *
 * Điểm quan trọng: so từng byte với **lệnh mẫu in trong datasheet module**
 * (YXT-100-M10 §10.3). Nếu test này PASS nghĩa là khung firmware gửi đi trùng
 * khít lệnh hãng khuyến nghị.
 *
 * Biên dịch (từ thư mục gốc repo):
 *   gcc -Wall -Wextra -O2 -std=c99 -DKVC_HOST_TEST=1 -Ifirmware/mcu_payload/inc `
 *       firmware/mcu_payload/tests/test_kvc_ubx_cfg.c `
 *       firmware/mcu_payload/src/kvc_ubx_cfg.c -o test_kvc_ubx_cfg.exe
 */

#include "kvc_ubx_cfg.h"

#include <stdio.h>
#include <string.h>

static int s_run = 0;
static int s_pass = 0;

#define TEST_ASSERT(cond, msg) do { \
    s_run++; \
    if (!(cond)) { \
        printf("  [FAIL] Line %d: %s\n", __LINE__, msg); \
    } else { \
        s_pass++; \
    } \
} while (0)

/* Lệnh mẫu nguyên văn từ datasheet module §10.3. */
static const uint8_t kRef9600[28] = {
    0xB5, 0x62, 0x06, 0x00, 0x14, 0x00, 0x01, 0x00,
    0x00, 0x00, 0xD0, 0x08, 0x00, 0x00, 0x80, 0x25,
    0x00, 0x00, 0x07, 0x00, 0x07, 0x00, 0x00, 0x00,
    0x00, 0x00, 0xA6, 0xCD};

static const uint8_t kRef38400[28] = {
    0xB5, 0x62, 0x06, 0x00, 0x14, 0x00, 0x01, 0x00,
    0x00, 0x00, 0xD0, 0x08, 0x00, 0x00, 0x00, 0x96,
    0x00, 0x00, 0x07, 0x00, 0x07, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x97, 0xA8};

static const uint8_t kRef115200[28] = {
    0xB5, 0x62, 0x06, 0x00, 0x14, 0x00, 0x01, 0x00,
    0x00, 0x00, 0xD0, 0x08, 0x00, 0x00, 0x00, 0xC2,
    0x01, 0x00, 0x07, 0x00, 0x07, 0x00, 0x00, 0x00,
    0x00, 0x00, 0xC4, 0x96};

static void test_matches_datasheet(void) {
    printf("[1] Khop tung byte voi lenh mau trong datasheet\n");
    uint8_t f[28];

    TEST_ASSERT(kvc_ubx_build_cfg_prt_baud(9600U, f), "dung duoc 9600");
    TEST_ASSERT(memcmp(f, kRef9600, 28) == 0, "9600 phai trung datasheet");

    TEST_ASSERT(kvc_ubx_build_cfg_prt_baud(38400U, f), "dung duoc 38400");
    TEST_ASSERT(memcmp(f, kRef38400, 28) == 0, "38400 phai trung datasheet");

    TEST_ASSERT(kvc_ubx_build_cfg_prt_baud(115200U, f), "dung duoc 115200");
    TEST_ASSERT(memcmp(f, kRef115200, 28) == 0, "115200 phai trung datasheet");
}

static void test_structure(void) {
    printf("[2] Cau truc khung\n");
    uint8_t f[28];

    TEST_ASSERT(kvc_ubx_build_cfg_prt_baud(9600U, f), "dung khung");
    TEST_ASSERT(f[0] == 0xB5 && f[1] == 0x62, "sync B5 62");
    TEST_ASSERT(f[2] == 0x06, "class CFG = 0x06");
    TEST_ASSERT(f[3] == 0x00, "id PRT = 0x00");
    TEST_ASSERT(f[4] == 20 && f[5] == 0, "payload len = 20");
    TEST_ASSERT(f[6] == 1, "portID = 1 (UART1)");
    TEST_ASSERT(kvc_ubx_validate_cfg_prt(f, 28), "khung phai hop le");
    TEST_ASSERT(kvc_ubx_get_baud(f) == 9600U, "doc lai duoc 9600");
}

static void test_validate_rejects(void) {
    printf("[3] Tu choi khung hong\n");
    uint8_t f[28];
    (void)kvc_ubx_build_cfg_prt_baud(9600U, f);

    TEST_ASSERT(!kvc_ubx_validate_cfg_prt(NULL, 28), "NULL phai bi tu choi");
    TEST_ASSERT(!kvc_ubx_validate_cfg_prt(f, 27), "sai do dai phai bi tu choi");
    TEST_ASSERT(!kvc_ubx_validate_cfg_prt(f, 29), "sai do dai phai bi tu choi");

    uint8_t bad[28];
    memcpy(bad, f, 28);
    bad[0] = 0xB6;
    TEST_ASSERT(!kvc_ubx_validate_cfg_prt(bad, 28), "sai sync phai bi tu choi");

    memcpy(bad, f, 28);
    bad[3] = 0x01; /* id khac */
    TEST_ASSERT(!kvc_ubx_validate_cfg_prt(bad, 28), "sai id phai bi tu choi");

    memcpy(bad, f, 28);
    bad[4] = 21;
    TEST_ASSERT(!kvc_ubx_validate_cfg_prt(bad, 28), "sai payload len phai bi tu choi");

    memcpy(bad, f, 28);
    bad[10] ^= 0x01; /* doi baud trong payload */
    TEST_ASSERT(!kvc_ubx_validate_cfg_prt(bad, 28), "sua payload phai hong checksum");

    memcpy(bad, f, 28);
    bad[27] ^= 0xFF;
    TEST_ASSERT(!kvc_ubx_validate_cfg_prt(bad, 28), "sua checksum phai bi tu choi");
}

static void test_baud_bounds(void) {
    printf("[4] Gioi han baud\n");
    uint8_t f[28];

    TEST_ASSERT(!kvc_ubx_build_cfg_prt_baud(0U, f), "0 phai bi tu choi");
    TEST_ASSERT(!kvc_ubx_build_cfg_prt_baud(4799U, f), "duoi 4800 phai bi tu choi");
    TEST_ASSERT(!kvc_ubx_build_cfg_prt_baud(921601U, f), "tren 921600 phai bi tu choi");
    TEST_ASSERT(!kvc_ubx_build_cfg_prt_baud(9600U, NULL), "NULL phai bi tu choi");

    TEST_ASSERT(kvc_ubx_build_cfg_prt_baud(4800U, f), "4800 la bien duoi hop le");
    TEST_ASSERT(kvc_ubx_get_baud(f) == 4800U, "doc lai 4800");

    TEST_ASSERT(kvc_ubx_build_cfg_prt_baud(921600U, f), "921600 la bien tren hop le");
    TEST_ASSERT(kvc_ubx_get_baud(f) == 921600U, "doc lai 921600");
    TEST_ASSERT(kvc_ubx_validate_cfg_prt(f, 28), "khung 921600 phai hop le");

    TEST_ASSERT(kvc_ubx_get_baud(NULL) == 0U, "NULL tra ve 0");
}

/* ---------- 5. CFG-GNSS 4 chom sao ---------- */
static void test_cfg_gnss_4const(void) {
    printf("[5] CFG-GNSS bat 4 chom (GPS+GAL+BDS+GLO)\n");

    uint8_t f[KVC_UBX_CFG_GNSS_LEN];
    TEST_ASSERT(kvc_ubx_get_cfg_gnss_4const(f), "lay duoc khung");
    TEST_ASSERT(kvc_ubx_validate_cfg_gnss(f, KVC_UBX_CFG_GNSS_LEN),
                "khung phai hop le (sync + class/id + len + checksum)");

    /* Header: sync B5 62, class 06, id 3E, payload len 52. */
    TEST_ASSERT(f[0] == 0xB5 && f[1] == 0x62, "sync B5 62");
    TEST_ASSERT(f[2] == 0x06, "class CFG = 0x06");
    TEST_ASSERT(f[3] == 0x3E, "id GNSS = 0x3E");
    TEST_ASSERT(f[4] == 0x34 && f[5] == 0x00, "payload len = 52");

    /* Sub-header: msgVer 0, numTrkChHw 0, numTrkChUse 32, numBlocks 6. */
    TEST_ASSERT(f[6] == 0x00, "msgVer = 0");
    TEST_ASSERT(f[7] == 0x00, "numTrkChHw = 0");
    TEST_ASSERT(f[8] == 32, "numTrkChUse = 32");
    TEST_ASSERT(f[9] == 6, "numBlocks = 6");

    /* Giai ma 6 block, kiem gnssId + co enable + tong resTrkCh. */
    static const uint8_t kExpectId[6] = {0U, 1U, 2U, 3U, 5U, 6U}; /* GPS,SBAS,GAL,BDS,QZSS,GLO */
    static const uint8_t kExpectEn[6] = {1U, 0U, 1U, 1U, 0U, 1U}; /* ON,off,ON,ON,off,ON */

    uint32_t sum_res = 0U;
    for (uint32_t i = 0U; i < 6U; i++) {
        const uint32_t o = 10U + i * 8U;
        const uint8_t gid = f[o];
        const uint8_t res = f[o + 1U];
        const uint32_t flags = (uint32_t)f[o + 4U] |
                               ((uint32_t)f[o + 5U] << 8) |
                               ((uint32_t)f[o + 6U] << 16) |
                               ((uint32_t)f[o + 7U] << 24);
        const uint32_t enable = flags & 1U;
        const uint32_t sig = (flags >> 16) & 0xFFU;

        TEST_ASSERT(gid == kExpectId[i], "thu tu gnssId dung khuon datasheet");
        TEST_ASSERT(enable == kExpectEn[i], "co enable dung ky vong");
        TEST_ASSERT(sig == 0x01U, "sigCfgMask = 0x01");
        sum_res += res;
    }

    /* Dieu kien u-blox: tong resTrkCh khong duoc vuot numTrkChUse. */
    TEST_ASSERT(sum_res == 29U, "tong resTrkCh phai la 29");
    TEST_ASSERT(sum_res <= f[8], "tong resTrkCh <= numTrkChUse");

    /* Bien doi mot byte phai hong checksum. */
    uint8_t bad[KVC_UBX_CFG_GNSS_LEN];
    for (uint32_t i = 0U; i < KVC_UBX_CFG_GNSS_LEN; i++) bad[i] = f[i];
    bad[20] ^= 0x01U;
    TEST_ASSERT(!kvc_ubx_validate_cfg_gnss(bad, KVC_UBX_CFG_GNSS_LEN),
                "sua payload phai hong checksum");

    TEST_ASSERT(!kvc_ubx_validate_cfg_gnss(NULL, KVC_UBX_CFG_GNSS_LEN),
                "NULL phai bi tu choi");
    TEST_ASSERT(!kvc_ubx_validate_cfg_gnss(f, KVC_UBX_CFG_GNSS_LEN - 1U),
                "sai do dai phai bi tu choi");
    TEST_ASSERT(!kvc_ubx_get_cfg_gnss_4const(NULL), "NULL phai bi tu choi");
}

int main(void) {
    printf("================================================================\n");
    printf("  KVC UBX CFG-PRT - Host Tests (NEO-M10-0-10 / YXT-100-M10)\n");
    printf("================================================================\n");

    test_matches_datasheet();
    test_structure();
    test_validate_rejects();
    test_baud_bounds();
    test_cfg_gnss_4const();

    printf("================================================================\n");
    printf("  Results: %d/%d assertions PASSED\n", s_pass, s_run);
    printf("================================================================\n");

    if (s_pass != s_run) {
        printf(">>> CO %d ASSERT THAT BAI!\n", s_run - s_pass);
        return 1;
    }
    printf(">>> ALL TESTS PASSED SUCCESSFULLY! <<<\n");
    return 0;
}
