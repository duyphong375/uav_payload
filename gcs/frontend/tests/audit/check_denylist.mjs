// Kiểm tra deny-list theo KVC-GCS-DESIGN-CONTRACT §6.
// Trả về exit code 1 nếu có vi phạm MỚI so với baseline đã ghi nhận.
//
// Baseline (đo trên working tree PLAN-KVC-SORTIX-001): 1 vi phạm DL-5 ở
// components/ui/sheet.tsx — file shadcn nằm ngoài allowed files của task,
// nên được phép tồn tại. Mọi vi phạm khác đều làm script fail.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const CHECKS = [
  {
    id: 'DL-1 emoji',
    re: /[▶●■◆★✓✗⚠→←↑↓]/g,
    files: /\.(tsx|ts)$/,
    allow: [/\.test\.tsx?$/, /lib\/connectionStatus\.ts$/],
  },
  {
    id: 'DL-2 hardcode palette',
    re: /\b(?:bg|text|border|ring|from|to)-(?:slate|cyan|rose|emerald|amber|red|purple|indigo|blue|green|yellow|orange)-[0-9]{2,3}\b/g,
    files: /\.(tsx|ts)$/,
    allow: [/components\/ui\//, /\.test\.tsx?$/],
  },
  {
    id: 'DL-5 backdrop-blur',
    re: /backdrop-blur/g,
    files: /\.tsx$/,
    allow: [/\.test\.tsx?$/],
  },
  {
    id: 'DL-7 arbitrary z',
    re: /z-\[\d+\]/g,
    files: /\.tsx$/,
    allow: [/\.test\.tsx?$/],
  },
  {
    id: 'DL-3 font < 11px',
    re: /text-\[(?:[0-9]|10)px\]/g,
    files: /\.tsx$/,
    allow: [/\.test\.tsx?$/],
  },
]

/** Vi phạm đã biết, được miễn trừ có ghi lý do. */
const BASELINE = [
  {
    id: 'DL-5 backdrop-blur',
    file: 'components/ui/sheet.tsx',
    reason: 'File shadcn ngoài allowed files của PLAN-KVC-SORTIX-001.',
  },
]

const hits = []
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      walk(p)
      continue
    }
    if (!/\.(tsx|ts)$/.test(entry.name)) continue
    const src = readFileSync(p, 'utf8')
    const lines = src.split(/\r?\n/)
    for (const check of CHECKS) {
      if (!check.files.test(entry.name)) continue
      if (check.allow.some((a) => a.test(p))) continue
      lines.forEach((line, i) => {
        const trimmed = line.trim()
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return
        check.re.lastIndex = 0
        const m = line.match(check.re)
        if (m) hits.push({ id: check.id, file: p, line: i + 1, text: trimmed.slice(0, 110), n: m.length })
      })
    }
  }
}

walk('src')

const normalized = (p) => p.replace(/\\/g, '/')
const isBaselined = (hit) =>
  BASELINE.some((b) => b.id === hit.id && normalized(hit.file).endsWith(b.file))

const allowed = hits.filter(isBaselined)
const fresh = hits.filter((h) => !isBaselined(h))

const byId = {}
for (const h of fresh) byId[h.id] = (byId[h.id] || 0) + 1

console.log('=== DENY-LIST ===')
if (hits.length === 0) console.log('  0 vi phạm')
for (const h of allowed) console.log(`  [BASELINE ${h.id}] ${h.file}:${h.line}`)
for (const h of fresh) console.log(`  [${h.id}] ${h.file}:${h.line}  ${h.text}`)
console.log(
  `TỔNG: ${hits.length} (baseline ${allowed.length}, mới ${fresh.length})`,
  byId
)
for (const b of BASELINE) console.log(`  baseline cho phép: ${b.id} @ ${b.file} — ${b.reason}`)

if (fresh.length > 0) {
  console.error(`\nDENY-LIST FAILED: ${fresh.length} vi phạm mới`)
  process.exitCode = 1
} else {
  console.log('\nDENY-LIST PASSED: không có vi phạm mới')
}
