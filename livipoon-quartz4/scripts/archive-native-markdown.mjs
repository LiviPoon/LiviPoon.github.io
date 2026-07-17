import { access, mkdir, readFile, rename } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const contentRoot = path.join(root, "content")
const nativeRoot = path.join(root, "native-site")
const backupRoot = path.join(contentRoot, "private", "standalone-markdown-backup")
const manifest = JSON.parse(await readFile(path.join(nativeRoot, ".native-manifest.json"), "utf8"))

for (const route of manifest.captured) {
  const html = await readFile(path.join(nativeRoot, route), "utf8")
  const source = html.match(/<meta name="native-source" content="([^"]+)"/u)?.[1]
  const expectedHash = html.match(/<meta name="native-source-sha256" content="([^"]+)"/u)?.[1]
  if (!source || !expectedHash) throw new Error(`Missing source verification metadata in ${route}`)

  const active = path.join(contentRoot, source)
  const backup = path.join(backupRoot, source)
  try {
    await access(active)
  } catch {
    await access(backup)
    continue
  }

  const raw = await readFile(active)
  const actualHash = createHash("sha256").update(raw).digest("hex")
  if (actualHash !== expectedHash) {
    throw new Error(`Refusing to archive ${source}: its verified HTML is out of date`)
  }

  try {
    await access(backup)
    throw new Error(`Refusing to overwrite existing backup ${backup}`)
  } catch (error) {
    if (error.code !== "ENOENT") throw error
  }

  await mkdir(path.dirname(backup), { recursive: true })
  await rename(active, backup)
  console.log(`Archived ${source}`)
}

