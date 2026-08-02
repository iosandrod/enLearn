import { mkdir, copyFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'

await mkdir('dist', { recursive: true })

if (existsSync('src/style/index.css')) {
  await copyFile('src/style/index.css', 'dist/style.css')
} else {
  await writeFile('dist/style.css', '/* vxe-table-plugin-extend-cell-area */\n')
}
