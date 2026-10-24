// 构建期生成 brotli 预压缩文件（xxx.js.br）。
// 服务端检测到客户端支持 br 时直接回源该文件，省掉运行时压缩开销。
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, constants as zlibConstants } from 'node:zlib'

const distDir = fileURLToPath(new URL('../dist/', import.meta.url))
const TARGET_EXTENSIONS = new Set([
  '.js',
  '.css',
  '.html',
  '.svg',
  '.json',
  '.xml',
  '.txt',
  '.webmanifest',
])
// 太小的文件压缩收益有限，跳过
const MIN_SIZE = 1024
const QUALITY = 9

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walk(full)
      continue
    }
    yield full
  }
}

let compressed = 0
let savedBytes = 0

for await (const file of walk(distDir)) {
  if (file.endsWith('.br')) continue
  if (!TARGET_EXTENSIONS.has(extname(file))) continue

  const info = await stat(file)
  if (info.size < MIN_SIZE) continue

  const source = await readFile(file)
  const output = brotliCompressSync(source, {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: QUALITY,
      [zlibConstants.BROTLI_PARAM_SIZE_HINT]: source.length,
    },
  })
  if (output.length >= source.length) continue

  await writeFile(`${file}.br`, output)
  compressed += 1
  savedBytes += source.length - output.length
}

console.log(
  `brotli: ${compressed} files, saved ${(savedBytes / 1024 / 1024).toFixed(2)} MiB`
)
