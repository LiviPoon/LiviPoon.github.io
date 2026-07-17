import { readFile, writeFile, mkdir, unlink, access } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"
import matter from "gray-matter"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkRehype from "remark-rehype"
import rehypeRaw from "rehype-raw"
import { toHtml } from "hast-util-to-html"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const contentRoot = path.join(root, "content")
const backupRoot = path.join(contentRoot, "private", "standalone-markdown-backup")
const nativeRoot = path.join(root, "native-site")
const previousManifest = path.join(nativeRoot, ".native-manifest.json")
const sourcePath = async (source) => {
  const active = path.join(contentRoot, source)
  try {
    await access(active)
    return active
  } catch {
    return path.join(backupRoot, source)
  }
}

const sideQuestSource = await readFile(await sourcePath("habits/go outside of my comfort zone.md"), "utf8")
const sideQuestCount = [...sideQuestSource.matchAll(/^\s*-\s*\d{4}-\d{2}-\d{2}\s*$/gm)].length

const sources = [
  "research/index.md",
  "achievements/index.md",
  "cv/index.md",
  "mirror/index.md",
  "powerlifting/index.md",
  "publications/index.md",
  "quote-journal/index.md",
  "quote-journal/quote.md",
  "tracked-habits/index.md",
  "Habit Tracker.md",
  "easter eggs.md",
  "habits/download thoughts.md",
  "habits/draw without music or video distractions.md",
  "habits/draw.md",
  "habits/exercise.md",
  "habits/floss.md",
  "habits/go outside of my comfort zone.md",
  "habits/reading.md",
  "habits/think freely.md",
]

const routeFor = (source) => {
  const withoutExtension = source.replace(/\.md$/i, "")
  const segments = withoutExtension
    .split("/")
    .map((segment) => segment.replaceAll(" ", "-").replaceAll("?", ""))
  if (segments.at(-1) === "index") return `${segments.join("/")}.html`
  return `${segments.join("/")}/index.html`
}

function pageShell({ title, description, body, route, source, sourceHash }) {
  const safeDescription = (description || `${title} by Livi Poon`).replaceAll('"', "&quot;")
  return `<!doctype html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${safeDescription}" />
    <meta name="native-source" content="${source}" />
    <meta name="native-source-sha256" content="${sourceHash}" />
    <meta name="theme-color" content="#141413" />
    <title>${title} · Livi Poon</title>
    <link rel="icon" href="/static/logo.svg" type="image/svg+xml" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;500;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400;1,700&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="/native.css" />
    <script type="module" src="/native.js"></script>
  </head>
  <body data-native-route="/${route.replace(/index\.html$/, "")}">
    <nav class="native-nav" aria-label="Primary navigation">
      <a class="native-brand" href="/">Livi Poon</a>
      <div class="native-actions">
        <button class="native-button" type="button" data-theme-toggle>theme</button>
        <button class="native-button" type="button" data-menu-open aria-expanded="false">menu</button>
      </div>
    </nav>
    <aside class="native-menu" data-native-menu aria-hidden="true" aria-label="Site index">
      <div><p class="native-menu__label">( Index )</p><ul>
        <li><a href="/research/">Research</a></li><li><a href="/achievements/">Achievements</a></li>
        <li><a href="/art/">Art</a></li><li><a href="/blog/">Thoughts</a></li>
        <li><a href="/mirror/">Mirror</a></li><li><a href="/cv/">CV</a></li>
      </ul></div>
      <button class="native-menu__close" type="button" data-menu-close>Close</button>
      <p class="native-menu__foot">By Livi Poon · est. 2004</p>
    </aside>
    <main class="native-page">
      <header class="native-hero"><p class="native-eyebrow">Livi Poon · ${title}</p><h1>${title}</h1>${description ? `<p class="native-description">${description}</p>` : ""}</header>
      <article class="native-content">${normalizeBodyPaths(body, route)}</article>
      <footer class="native-footer"><a class="native-back" href="/">← return home</a><span>Keep building dreams, one step at a time.</span></footer>
    </main>
  </body>
</html>
`
}

function normalizeBodyPaths(html, route) {
  const pageUrl = new URL(`/${route}`, "https://www.livipoon.com")
  return html.replace(
    /\b(href|src|poster)=("([^"]*)"|'([^']*)')/gi,
    (match, name, quoted, double, single) => {
      const value = double ?? single
      if (!value || value.startsWith("#") || /^(?:[a-z]+:|\/\/|\/)/i.test(value)) return match
      const resolved = new URL(value, pageUrl)
      const quote = quoted[0]
      return `${name}=${quote}${resolved.pathname}${resolved.search}${resolved.hash}${quote}`
    },
  )
}

async function markdownToHtml(markdown) {
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .runSync(
      unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkRehype, { allowDangerousHtml: true })
        .parse(markdown),
    )
  return toHtml(tree)
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

async function specialBody(source, body) {
  if (source === "achievements/index.md")
    return body.replace(
      '<span class="roll-counter-int">0</span>',
      `<span class="roll-counter-int">${sideQuestCount}</span>`,
    )
  if (source === "cv/index.md")
    return `${body}<div class="cv-pdf-shell"><object data="/cv/cv.pdf" type="application/pdf"><p><a href="/cv/cv.pdf">Open the CV PDF</a></p></object></div>`
  if (source === "mirror/index.md") {
    const quotes = JSON.parse(await readFile(path.join(contentRoot, "mirror", "mirror-quotes.json"), "utf8"))
    const items = quotes
      .map((quote) => `<section class="mirror-card"><blockquote>${escapeHtml(quote.text ?? quote.quote ?? "")}</blockquote><p>${escapeHtml(quote.speaker ?? quote.author ?? "Anonymous")}${quote.role ? ` · ${escapeHtml(quote.role)}` : ""}</p></section>`)
      .join("")
    return `${body}<div class="mirror-grid" data-mirror-grid>${items}</div>`
  }
  if (source === "tracked-habits/index.md" || source === "Habit Tracker.md")
    return `${body}<p>This living record follows the habits I practice while becoming who I want to be.</p><div class="habit-grid"><a class="habit-card" href="/habits/exercise/"><strong>exercise</strong>body</a><a class="habit-card" href="/habits/reading/"><strong>reading</strong>mind</a><a class="habit-card" href="/habits/draw/"><strong>draw</strong>creativity</a><a class="habit-card" href="/habits/think-freely/"><strong>think freely</strong>spirit</a><a class="habit-card" href="/habits/floss/"><strong>floss</strong>health</a><a class="habit-card" href="/habits/go-outside-of-my-comfort-zone/"><strong>comfort zone</strong>growth</a></div>`
  if (source === "quote-journal/index.md")
    return body.replace("quote.md", "the full quote collection")
  return body
}

try {
  const old = JSON.parse(await readFile(previousManifest, "utf8"))
  for (const relative of old.captured ?? []) {
    if (relative === "README.md") continue
    await unlink(path.join(nativeRoot, relative)).catch(() => {})
  }
} catch {}

const captured = []
for (const source of sources) {
  const raw = await readFile(await sourcePath(source), "utf8")
  const parsed = matter(raw)
  const route = routeFor(source)
  const title = parsed.data.title ?? path.basename(source, ".md").replaceAll("-", " ")
  const rendered = await markdownToHtml(parsed.content)
  const html = pageShell({
    title,
    description: parsed.data.description,
    body: await specialBody(source, rendered),
    route,
    source,
    sourceHash: createHash("sha256").update(raw).digest("hex"),
  })
  const destination = path.join(nativeRoot, route)
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(destination, html, "utf8")
  captured.push(route)
}

await writeFile(
  previousManifest,
  `${JSON.stringify({ captured: captured.sort() }, null, 2)}\n`,
  "utf8",
)
console.log(`Created ${captured.length} standalone HTML pages.`)
