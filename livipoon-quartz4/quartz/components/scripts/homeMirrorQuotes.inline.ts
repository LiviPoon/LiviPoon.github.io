type HomeMirrorQuotesWindow = Window &
  typeof globalThis & {
    __homeMirrorQuotesCleanup?: () => void
  }

const homeMirrorQuotesWindow = window as HomeMirrorQuotesWindow

type MirrorQuote = {
  text: string
  speaker: string
  role: string
}

function shuffleInPlace<T>(array: T[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[array[i], array[j]] = [array[j], array[i]]
  }
}

function setupHomeMirrorQuotes() {
  homeMirrorQuotesWindow.__homeMirrorQuotesCleanup?.()
  homeMirrorQuotesWindow.__homeMirrorQuotesCleanup = undefined

  const slug = document.body?.dataset.slug
  if (slug !== "" && slug !== "index") return

  const body = document.getElementById("quartz-body")
  const raw = body?.dataset.mirrorBoldQuotes
  if (!raw) return

  let quotes: MirrorQuote[]
  try {
    quotes = JSON.parse(raw) as MirrorQuote[]
  } catch {
    return
  }

  if (quotes.length < 3) return

  const pool = [...quotes]
  shuffleInPlace(pool)
  const selected = pool.slice(0, 3)

  const row = document.querySelector<HTMLElement>(".pilcrow-testimonial-row")
  if (!row) return

  const articles = selected.map((q) => {
    const article = document.createElement("article")
    article.className = "pilcrow-quote"

    const p = document.createElement("p")
    p.textContent = `"${q.text}"`

    const span = document.createElement("span")
    span.textContent = q.role

    article.appendChild(p)
    article.appendChild(span)
    return article
  })

  row.replaceChildren(...articles)

  homeMirrorQuotesWindow.__homeMirrorQuotesCleanup = () => {}

  if (typeof window.addCleanup === "function") {
    window.addCleanup(() => {
      homeMirrorQuotesWindow.__homeMirrorQuotesCleanup?.()
      homeMirrorQuotesWindow.__homeMirrorQuotesCleanup = undefined
    })
  }
}

document.addEventListener("nav", setupHomeMirrorQuotes)
setupHomeMirrorQuotes()
