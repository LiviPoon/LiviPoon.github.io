import { createReadStream, existsSync, statSync } from "node:fs"
import { createServer } from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"
import chokidar from "chokidar"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const outputRoot = path.join(root, "public")
const port = Number.parseInt(process.env.PORT ?? "8080", 10)
let building = false
let rebuildQueued = false

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".m4a", "audio/mp4"],
  [".mp3", "audio/mpeg"],
  [".mp4", "video/mp4"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".xml", "application/xml; charset=utf-8"],
])

function build() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "scripts", "build-hybrid.mjs")], {
      cwd: root,
      stdio: "inherit",
    })
    child.once("error", reject)
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Hybrid build exited with status ${code}`)),
    )
  })
}

async function rebuild() {
  if (building) {
    rebuildQueued = true
    return
  }
  building = true
  try {
    await build()
  } catch (error) {
    console.error(error)
  } finally {
    building = false
    if (rebuildQueued) {
      rebuildQueued = false
      void rebuild()
    }
  }
}

function resolveRequest(url) {
  const pathname = decodeURIComponent(new URL(url, `http://localhost:${port}`).pathname)
  const candidate = path.resolve(outputRoot, `.${pathname}`)
  if (candidate !== outputRoot && !candidate.startsWith(`${outputRoot}${path.sep}`)) return null

  const possibilities = [candidate]
  if (!path.extname(candidate))
    possibilities.push(`${candidate}.html`, path.join(candidate, "index.html"))
  return possibilities.find((file) => existsSync(file) && statSync(file).isFile()) ?? null
}

await build()

const server = createServer((request, response) => {
  const file = resolveRequest(request.url ?? "/")
  if (!file) {
    const fallback = path.join(outputRoot, "404.html")
    response.writeHead(404, { "content-type": "text/html; charset=utf-8" })
    createReadStream(fallback).pipe(response)
    return
  }

  const size = statSync(file).size
  const contentType = mimeTypes.get(path.extname(file).toLowerCase()) ?? "application/octet-stream"
  const range = request.headers.range?.match(/^bytes=(\d*)-(\d*)$/)
  let start = 0
  let end = size - 1

  if (range) {
    start = range[1] ? Number.parseInt(range[1], 10) : 0
    end = range[2] ? Number.parseInt(range[2], 10) : end
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
      response.writeHead(416, { "content-range": `bytes */${size}` })
      response.end()
      return
    }
    end = Math.min(end, size - 1)
  }

  response.writeHead(range ? 206 : 200, {
    "accept-ranges": "bytes",
    "cache-control": "no-store",
    "content-length": String(end - start + 1),
    "content-type": contentType,
    ...(range ? { "content-range": `bytes ${start}-${end}/${size}` } : {}),
  })
  if (request.method === "HEAD") {
    response.end()
    return
  }
  createReadStream(file, { start, end }).pipe(response)
})

server.listen(port, () => console.log(`Hybrid site available at http://localhost:${port}`))

const watcher = chokidar.watch(
  ["content", "native-site", "portfolio-src", "quartz", "quartz.config.ts", "quartz.layout.ts"],
  { cwd: root, ignoreInitial: true },
)

let debounce
watcher.on("all", () => {
  clearTimeout(debounce)
  debounce = setTimeout(() => void rebuild(), 150)
})

async function shutdown() {
  await watcher.close()
  server.close(() => process.exit(0))
}

process.once("SIGINT", shutdown)
process.once("SIGTERM", shutdown)
