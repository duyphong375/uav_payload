# KVC — Danh mục gói tài liệu/SDK hãng (vendor packages)

**Trạng thái:** SOURCE-VERIFIED theo file đang có trong workspace ngày 25/10/2026.
Danh mục này **không** chứa nội dung nhị phân và **không** cấp quyền phân phối.

Các gói dưới đây nằm trong `docs/hardware/` nhưng **bị Git ignore** (`.gitignore`
mục "Vendor SDKs"): `.exe`, `.dll`, `*.pdf`/`*.png` của OneKiwi và các thư mục
`*_SDK_*`/`*_Package_*` của SONiX. Vì vậy **clone mới sẽ không có các file này**.
Dùng bảng dưới để tải lại và đối chiếu checksum trước khi build/nạp.

Quy ước: `SHA-256` tính trên file đang có trong workspace; nếu file tải lại có hash
khác thì **không** dùng để build/flash cho tới khi xác minh lại nguồn.

## 1. SONiX SN34F780 Starter-Kit (MCU tải UAV)

Đường dẫn gốc: `docs/hardware/sonix_sn34f788/`

| Gói / file | Phiên bản | Dung lượng | SHA-256 | Vai trò |
| --- | --- | ---: | --- | --- |
| `SN34F780_SDK_V2.1.4/SN34F780_SDK_V2.1.4.exe` | SDK V2.1.4 | 14.348.852 B | `BD6D9393F4C7B1742DF9E728DA3AC9B44FCF0CDFFA73B899F03AA0C448DAB9D6` | SDK/driver ngoại vi cho SN34F780 |
| `SN34F780_StartKit_Package_V1.10R/` (cây) | Package V1.10R | 51,0 MB / 138 file | checksum từng file thiết yếu ở các dòng dưới | Bộ Starter-Kit chính thức |
| `SN34F780_StartKit_Package_V1.10R/Document/SN34F780_V1.7.pdf` | User Manual V1.7 | 10.374.743 B | `164004C609E9E8DFBE10595B1FD8D955D86129CEEF98A5D10590E7FC3178635C` | Nguồn tham chiếu chính cho `CHIP_SONIX_SN34F788_MCU.md` |
| `SN34F780_StartKit_Package_V1.10R/Pack/SONiX.SN34F7_DFP.2.0.4.pack` | DFP 2.0.4 | 1.874.504 B | `C82F086C2EE29F6F63D12578A8649AC90C7812A2E91F4ABD586181A0B4112EA5` | Device Family Pack cho Keil MDK |
| `SN34F780_StartKit_Package_V1.10R/SN34F780_Readme.pdf` | V1.10R | 61.439 B | `B75AE913BA105F0363CD29572DBDFDEF0EFD127119B3010A951DBC42EAEA464B` | Ghi chú phát hành gói kit |
| `SN-Link ICP_V3.12.exe` | ICP V3.12 | 22.105.593 B | `2DD0D031DBC248041B1D536E2F6DD3A4D5FB3458F440C7958C5667404AA2D1C1` | Công cụ nạp/flash SN-Link |
| `SN-Link_Driver for Keil Cortex-M_V2.00.324.exe` | Driver V2.00.324 | 6.582.019 B | `E2DD75728C0F5113C2F80DF6C312F6C4EF1997A0DE627190FDB4FB6855BBF439` | Driver SN-Link cho Keil MDK |

Ghi chú:
- `SN34F780_StartKit_Package_V1.10R/Tools/` và `Reference Circuit/` là một phần của
  gói V1.10R; checksum từng file công cụ **chưa** ghi ở đây vì không cần cho build.
- Project Keil của KVC (`firmware/mcu_payload/project_keil/mcu_uav.uvprojx`) build được
  khi đã cài DFP 2.0.4 và driver SN-Link ở trên.

## 2. OneKiwi Primer 20K (FPGA)

Đường dẫn gốc: `docs/hardware/onekiwi20k/`

| File | Nội dung | Dung lượng | SHA-256 |
| --- | --- | ---: | --- |
| `KIWIPRIMER20K_USERGUIDE.pdf` | User Guide chính thức OneKiwi (25 trang) | 1.330.845 B | `F0310F04CCFA451FE8683C47A72C5717959003D075EC7933DA891D4B37FC8AA0` |
| `fpga-kiwi-primer-20k.pdf` | Sơ đồ nguyên lý KiCad, rev v1.0 (13 trang) | 3.237.535 B | `45DC8D13D25CE2BEE571AFEE2D82856633327A65BA420474BD50D2D6723C3EDA` |
| `Block_diagram.png` | Sơ đồ khối phần cứng bo | 85.495 B | `B3A24D961C58F2E0D71C888235A572625A45A23D2786FD78D898BF17D064F0F0` |

Ghi chú: chưa có datasheet Gowin GW2A riêng trong workspace; xem mục 9 của
[CHIP_ONEKIWI_20K_GOWIN_GW2A.md](../fpga/CHIP_ONEKIWI_20K_GOWIN_GW2A.md) để biết phần
thông số còn thiếu.

## 3. Khôi phục trên máy mới

1. Tải đúng phiên bản ở cột "Phiên bản" từ nguồn nhà sản xuất (OneKiwi Technology,
   SONiX) — workspace này không lưu URL tải và không tự động tải.
2. Đặt vào đúng đường dẫn ghi ở trên; giữ nguyên tên file.
3. Đối chiếu checksum:
   ```powershell
   Get-FileHash -Algorithm SHA256 -LiteralPath 'docs/hardware/sonix_sn34f788/SN-Link ICP_V3.12.exe'
   ```
4. Nếu hash khác: dừng, không cài, ghi lại phiên bản thực nhận và cập nhật bảng này.

## 4. Quyền phân phối

Chưa xác minh quyền phân phối lại các gói nhị phân này. Vì vậy chúng bị Git ignore
và **không** được đưa vào zip/gói tài liệu chia sẻ. Xem thêm ghi chú về quyền phân
phối trong [README — phần "Dữ liệu, model và file cục bộ"](../../../README.md#dữ-liệu-model-và-file-cục-bộ).
