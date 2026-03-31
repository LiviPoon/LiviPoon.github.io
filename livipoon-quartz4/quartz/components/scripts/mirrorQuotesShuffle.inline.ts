type MirrorQuotesShuffleWindow = Window &
  typeof globalThis & {
    __mirrorQuotesShuffleCleanup?: () => void
  }

const mirrorQuotesShuffleWindow = window as MirrorQuotesShuffleWindow

function shuffleInPlace<T>(array: T[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[array[i], array[j]] = [array[j], array[i]]
  }
}

function setupMirrorQuotesShuffle() {
  mirrorQuotesShuffleWindow.__mirrorQuotesShuffleCleanup?.()
  mirrorQuotesShuffleWindow.__mirrorQuotesShuffleCleanup = undefined

  const slug = document.body?.dataset.slug
  if (slug !== "mirror" && slug !== "mirror/index") return

  const row = document.querySelector<HTMLElement>(
    'article[data-mirror-quotes-layout] .pilcrow-testimonial-row',
  )
  if (!row) return

  const cards = Array.from(row.querySelectorAll<HTMLElement>("article.pilcrow-quote"))
  if (cards.length < 2) return

  const shuffledCards = [...cards]
  shuffleInPlace(shuffledCards)
  row.replaceChildren(...shuffledCards)

  mirrorQuotesShuffleWindow.__mirrorQuotesShuffleCleanup = () => {}

  if (typeof window.addCleanup === "function") {
    window.addCleanup(() => {
      mirrorQuotesShuffleWindow.__mirrorQuotesShuffleCleanup?.()
      mirrorQuotesShuffleWindow.__mirrorQuotesShuffleCleanup = undefined
    })
  }
}

document.addEventListener("nav", setupMirrorQuotesShuffle)
setupMirrorQuotesShuffle()
