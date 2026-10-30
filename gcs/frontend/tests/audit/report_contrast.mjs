import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const file = resolve(process.argv[2] || '../review/KVC-GCS-UI/00-baseline/contrast-before.json')
const rows = JSON.parse(readFileSync(file, 'utf8'))

for (const r of rows) {
  if (!r.contrastFailures) continue
  console.log(`=== ${r.theme}/${r.route}  fail=${r.contrastFailures}/${r.contrastChecked}`)
  for (const w of r.worst) {
    console.log(
      `  ${String(w.ratio).padEnd(6)} ${String(w.size).padStart(3)}px ${w.tag.padEnd(6)} ${w.color} on ${w.bg}  "${w.text}"  .${String(w.cls).slice(0, 60)}`
    )
  }
}
