import { fetchCanonical } from "./util"

type QuoteCandidate = {
  text: string
  score: number
}

type TypewriterSpeechRuntime = {
  enabled: boolean
  selectedVoice: SpeechSynthesisVoice | null
  speechRate: number
  activeUtteranceId: number
  isMusicDucked: boolean
  refreshVoices: () => void
  dispose: () => void
}

type QuoteSpeechPlayback = {
  expectedDurationMs: number
  completion: Promise<void>
}

type BlogTypewriterWindow = Window &
  typeof globalThis & {
    __backgroundMusicDucked?: boolean
  }

const blogTypewriterWindow = window as BlogTypewriterWindow

const parser = new DOMParser()
const minChars = 24
const maxChars = 320
const minWords = 8
const maxWords = 50
const minScore = 1

const rejectedFragments = [
  "http://",
  "https://",
  "wikipedia",
  "retrieved",
  "doi",
  "journal",
  "references",
]

const referenceSectionHeadings = [
  "reference",
  "references",
  "sources",
  "works cited",
  "bibliography",
  "citations",
  "further reading",
]

const interestingTerms = [
  "comfort zone",
  "success",
  "meaningful",
  "identity",
  "values",
  "fear",
  "challenge",
  "empathy",
  "goal",
  "life",
  "human",
  "change",
  "learn",
  "research",
  "curiosity",
  "purpose",
  "growth",
  "resilient",
  "collaborative",
]

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))
const defaultSpeechRate = 0.86
const musicMuteStorageKey = "backgroundMusicMuted"
const muteEventName = "background-mute-changed"
const musicDuckEventName = "background-music-duck-changed"
const recentQuoteWindowSize = 24
const fallbackQuotes = [
  "Curiosity often begins where comfort finally starts to end.",
  "Meaning grows when we choose challenge over familiar safety.",
  "Small risks taken consistently can open unexpectedly larger lives.",
  "Empathy makes difficult work feel more honest and deeply human.",
]
const minPostQuotePauseMs = 1000
const maxPostQuotePauseMs = 3000

function emitMusicDuckChange(ducked: boolean) {
  blogTypewriterWindow.__backgroundMusicDucked = ducked
  document.dispatchEvent(
    new CustomEvent(musicDuckEventName, {
      detail: { ducked },
    }),
  )
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function normalizeHeadingText(text: string): string {
  return normalizeWhitespace(text.toLowerCase().replace(/[^a-z0-9\s]/g, " "))
}

function isReferenceSectionHeading(text: string): boolean {
  const normalized = normalizeHeadingText(text)
  return normalized.length > 0 && referenceSectionHeadings.includes(normalized)
}

function getHeadingLevel(node: Element): number {
  const level = node.tagName.match(/^H([1-6])$/i)?.[1]
  return level ? Number(level) : 0
}

function wordCount(text: string): number {
  const normalized = normalizeWhitespace(text)
  if (normalized.length === 0) return 0
  return normalized.split(/\s+/).length
}

function isQuoteLongEnough(text: string): boolean {
  return wordCount(text) > 7
}

function isSpeechMuted(): boolean {
  return localStorage.getItem(musicMuteStorageKey) === "true"
}

function setMusicDucked(runtime: TypewriterSpeechRuntime, ducked: boolean) {
  if (runtime.isMusicDucked === ducked) return
  runtime.isMusicDucked = ducked
  emitMusicDuckChange(ducked)
}

function shuffle<T>(list: T[]): T[] {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function pickRandom<T>(list: T[]): T | null {
  if (list.length === 0) return null
  return list[Math.floor(Math.random() * list.length)] ?? null
}

function isCompleteSentence(text: string): boolean {
  const normalized = normalizeWhitespace(text)
  if (!normalized) return false
  return /[.!?][)"'\]»”’]*$/.test(normalized)
}

function splitSentences(text: string): string[] {
  const normalized = normalizeWhitespace(text)
  if (!normalized) return []

  const intlWithSegmenter = Intl as typeof Intl & {
    Segmenter?: new (
      locales?: string | string[],
      options?: { granularity?: "grapheme" | "word" | "sentence" },
    ) => {
      segment: (input: string) => Iterable<{ segment: string }>
    }
  }

  if (intlWithSegmenter.Segmenter) {
    const segmenter = new intlWithSegmenter.Segmenter(undefined, { granularity: "sentence" })
    return [...segmenter.segment(normalized)]
      .map((entry) => normalizeWhitespace(entry.segment))
      .filter((chunk) => chunk.length > 0)
  }

  const chunks = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? []
  return chunks.map((chunk) => normalizeWhitespace(chunk)).filter((chunk) => chunk.length > 0)
}

function scoreSentence(sentence: string): number {
  const lower = sentence.toLowerCase()
  const words = wordCount(sentence)

  if (!isCompleteSentence(sentence)) return -1
  if (sentence.length < minChars || sentence.length > maxChars) return -1
  if (words < minWords || words > maxWords) return -1
  if (rejectedFragments.some((fragment) => lower.includes(fragment))) return -1

  const digitCount = (sentence.match(/\d/g) ?? []).length
  if (digitCount > 4) return -1

  let score = 0
  if (/\b(i|we|you)\b/i.test(sentence)) score += 1
  if (/[!?]/.test(sentence)) score += 1
  if (/[,:;]/.test(sentence)) score += 1

  for (const term of interestingTerms) {
    if (lower.includes(term)) {
      score += 1
    }
  }

  return score
}

function collectSentenceCandidates(text: string): QuoteCandidate[] {
  const sentences = splitSentences(text)
  const candidates: QuoteCandidate[] = []

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i] ?? ""
    const sentenceComplete = isCompleteSentence(sentence)
    const score = scoreSentence(sentence)
    if (score >= minScore) {
      candidates.push({ text: sentence, score })
    }

    const next = sentences[i + 1]
    if (sentenceComplete && next && isCompleteSentence(next)) {
      const combined = normalizeWhitespace(`${sentence} ${next}`)
      const combinedScore = scoreSentence(combined)
      if (combinedScore >= minScore + 1) {
        candidates.push({ text: combined, score: combinedScore + 1 })
      }
    }
  }

  return candidates
}

function pickGoodQuotesFromDoc(doc: Document): string[] {
  const article = doc.querySelector(".center article") ?? doc.querySelector("article")
  if (!article) return []

  const contentNodes = [...article.querySelectorAll("h1, h2, h3, h4, h5, h6, p, li, blockquote")]
  const candidates: QuoteCandidate[] = []
  let referenceSectionLevel: number | null = null

  for (const node of contentNodes) {
    if (/^H[1-6]$/i.test(node.tagName)) {
      const headingText = normalizeWhitespace(node.textContent ?? "")
      const headingLevel = getHeadingLevel(node)

      if (referenceSectionLevel === null) {
        if (isReferenceSectionHeading(headingText)) {
          referenceSectionLevel = headingLevel
        }
        continue
      }

      if (headingLevel <= referenceSectionLevel) {
        referenceSectionLevel = isReferenceSectionHeading(headingText) ? headingLevel : null
      }
      continue
    }

    if (referenceSectionLevel !== null) continue

    const blockText = normalizeWhitespace(node.textContent ?? "")
    if (blockText.length === 0) continue
    candidates.push(...collectSentenceCandidates(blockText))
  }

  if (candidates.length === 0) {
    return []
  }

  const byText = new Map<string, number>()
  for (const candidate of candidates) {
    const current = byText.get(candidate.text) ?? Number.NEGATIVE_INFINITY
    if (candidate.score > current) {
      byText.set(candidate.text, candidate.score)
    }
  }

  const ranked = [...byText.entries()]
    .map(([text, score]) => ({ text, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 40)

  const selected = shuffle(ranked)
    .slice(0, 24)
    .map((candidate) => candidate.text)

  return selected.length > 0
    ? selected
    : candidates
        .sort((a, b) => b.score - a.score)
        .slice(0, 1)
        .map((candidate) => candidate.text)
}

async function collectQuotes(postLinks: string[], cancelled: () => boolean): Promise<string[]> {
  const quotes: string[] = []

  for (const postLink of shuffle(postLinks)) {
    if (cancelled()) return []

    try {
      const url = new URL(postLink, window.location.href)
      const response = await fetchCanonical(url)
      if (cancelled()) return []

      if (!response.headers.get("content-type")?.startsWith("text/html")) {
        continue
      }

      const html = await response.text()
      if (cancelled()) return []

      const doc = parser.parseFromString(html, "text/html")
      const picked = pickGoodQuotesFromDoc(doc)
      quotes.push(...picked)
    } catch {
      // ignore individual post failures and continue with the rest
    }
  }

  const deduped: string[] = []
  const seenQuotes = new Set<string>()
  for (const quote of shuffle(quotes)) {
    if (isQuoteLongEnough(quote) && !seenQuotes.has(quote)) {
      seenQuotes.add(quote)
      deduped.push(quote)
    }
  }

  return deduped
}

async function pickFreshQuote(
  postLinks: string[],
  recentQuotes: string[],
  cancelled: () => boolean,
): Promise<string> {
  const eligibleFallbackQuotes = fallbackQuotes.filter(isQuoteLongEnough)

  if (postLinks.length === 0) {
    return pickRandom(eligibleFallbackQuotes) ?? eligibleFallbackQuotes[0] ?? ""
  }

  const fetched = await collectQuotes(postLinks, cancelled)
  if (cancelled()) return ""

  const recentQuoteSet = new Set(recentQuotes)
  const unseenPool = fetched.filter(
    (quote) => isQuoteLongEnough(quote) && !recentQuoteSet.has(quote),
  )
  const pool = unseenPool.length > 0 ? unseenPool : fetched
  return pickRandom(pool) ?? pickRandom(eligibleFallbackQuotes) ?? eligibleFallbackQuotes[0] ?? ""
}

function scoreVoice(voice: SpeechSynthesisVoice): number {
  const joined = `${voice.name} ${voice.voiceURI}`.toLowerCase()
  const lang = voice.lang.toLowerCase()
  let score = 0

  if (lang.startsWith("en")) score += 12

  // Favor older/robotic synthetic timbres that are closest to Hawking-like TTS.
  if (/\b(perfect paul|dectalk)\b/.test(joined)) score += 120
  if (/\b(fred|zarvox)\b/.test(joined)) score += 95
  if (/\b(robot|synth|synthetic)\b/.test(joined)) score += 42
  if (/\b(espeak|festival|desktop)\b/.test(joined)) score += 34
  if (/\bmicrosoft david desktop\b/.test(joined)) score += 48
  if (/\b(david|daniel|alex|tom)\b/.test(joined)) score += 12

  // De-prioritize modern natural/neural assistants for this mode.
  if (/\bneural\b/.test(joined)) score -= 28
  if (/\bnatural\b/.test(joined)) score -= 18
  if (/\bpremium\b/.test(joined)) score -= 10
  if (/\benhanced\b/.test(joined)) score -= 8
  if (/\b(siri|google|cortana|wavenet)\b/.test(joined)) score -= 8

  if (voice.default) score += 2

  return score
}

function selectHawkingLikeVoice(allVoices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (allVoices.length === 0) return null

  const unique = allVoices.filter(
    (voice, idx, arr) => arr.findIndex((other) => other.voiceURI === voice.voiceURI) === idx,
  )
  const english = unique.filter((voice) => voice.lang.toLowerCase().startsWith("en"))
  const pool = english.length > 0 ? english : unique

  return [...pool].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] ?? null
}

function estimateSpeechDurationMs(text: string, rate: number): number {
  const normalized = normalizeWhitespace(text)
  const words = Math.max(1, normalized.split(/\s+/).length)
  const punctuationCount = (normalized.match(/[.,!?;:]/g) ?? []).length
  const wordsPerMinute = Math.max(90, 165 * rate)
  const baseMs = (words / wordsPerMinute) * 60000
  const punctuationPauseMs = punctuationCount * 110
  return Math.max(900, baseMs + punctuationPauseMs + 140)
}

function postQuotePauseMs(quoteText: string): number {
  const length = normalizeWhitespace(quoteText).length
  const clampedLength = Math.min(maxChars, Math.max(minChars, length))
  const lengthRange = Math.max(1, maxChars - minChars)
  const normalized = (clampedLength - minChars) / lengthRange
  const inverse = 1 - normalized
  return Math.round(minPostQuotePauseMs + inverse * (maxPostQuotePauseMs - minPostQuotePauseMs))
}

function createSpeechRuntime(): TypewriterSpeechRuntime {
  const unsupported: TypewriterSpeechRuntime = {
    enabled: false,
    selectedVoice: null,
    speechRate: defaultSpeechRate,
    activeUtteranceId: 0,
    isMusicDucked: false,
    refreshVoices: () => {},
    dispose: () => {},
  }

  if (
    typeof window.speechSynthesis === "undefined" ||
    typeof SpeechSynthesisUtterance === "undefined"
  ) {
    return unsupported
  }

  const synth = window.speechSynthesis
  const onMuteChanged = (event: Event) => {
    const muted = (event as CustomEvent<{ muted?: boolean }>).detail?.muted
    if (muted) {
      synth.cancel()
      setMusicDucked(runtime, false)
    }
  }

  const onStorageChanged = (event: StorageEvent) => {
    if (event.key === musicMuteStorageKey && event.newValue === "true") {
      synth.cancel()
      setMusicDucked(runtime, false)
    }
  }

  const runtime: TypewriterSpeechRuntime = {
    enabled: true,
    selectedVoice: null,
    speechRate: defaultSpeechRate,
    activeUtteranceId: 0,
    isMusicDucked: false,
    refreshVoices: () => {
      const allVoices = synth.getVoices()
      runtime.selectedVoice = selectHawkingLikeVoice(allVoices)
    },
    dispose: () => {},
  }

  const onVoicesChanged = () => {
    runtime.refreshVoices()
  }

  runtime.dispose = () => {
    setMusicDucked(runtime, false)
    synth.removeEventListener?.("voiceschanged", onVoicesChanged)
    document.removeEventListener(muteEventName, onMuteChanged as EventListener)
    window.removeEventListener("storage", onStorageChanged)
    synth.cancel()
  }

  runtime.refreshVoices()
  synth.addEventListener?.("voiceschanged", onVoicesChanged)
  document.addEventListener(muteEventName, onMuteChanged as EventListener)
  window.addEventListener("storage", onStorageChanged)
  return runtime
}

function stripQuotePunctuation(text: string): string {
  return normalizeWhitespace(text.replace(/[“”]/g, ""))
}

function speakQuote(
  runtime: TypewriterSpeechRuntime,
  quote: string,
  cancelled: () => boolean,
): QuoteSpeechPlayback {
  const text = stripQuotePunctuation(quote)
  const expectedDurationMs = estimateSpeechDurationMs(text, runtime.speechRate)
  if (
    !text ||
    !runtime.enabled ||
    cancelled() ||
    document.visibilityState === "hidden" ||
    isSpeechMuted()
  ) {
    setMusicDucked(runtime, false)
    return { expectedDurationMs, completion: Promise.resolve() }
  }

  const synth = window.speechSynthesis
  if (!runtime.selectedVoice) {
    runtime.refreshVoices()
  }
  const utterance = new SpeechSynthesisUtterance(text)
  const utteranceId = ++runtime.activeUtteranceId
  setMusicDucked(runtime, true)
  const voice = runtime.selectedVoice

  if (voice) {
    utterance.voice = voice
    utterance.lang = voice.lang
  }

  utterance.rate = runtime.speechRate
  utterance.pitch = 0.72
  utterance.volume = 0.9

  let settleCompletion = () => {}
  const completion = new Promise<void>((resolve) => {
    settleCompletion = resolve
    utterance.onend = () => {
      if (runtime.activeUtteranceId === utteranceId) {
        setMusicDucked(runtime, false)
      }
      resolve()
    }
    utterance.onerror = () => {
      if (runtime.activeUtteranceId === utteranceId) {
        setMusicDucked(runtime, false)
      }
      resolve()
    }
  })

  try {
    synth.cancel()
    synth.speak(utterance)
  } catch {
    if (runtime.activeUtteranceId === utteranceId) {
      setMusicDucked(runtime, false)
    }
    settleCompletion()
  }

  return { expectedDurationMs, completion }
}

async function typeText(
  el: HTMLElement,
  text: string,
  cancelled: () => boolean,
  targetDurationMs?: number,
): Promise<boolean> {
  const minimumCharDelay = 14
  const maximumCharDelay = 90
  const fallbackDelay = 32
  const charDelay =
    targetDurationMs && text.length > 0
      ? Math.max(minimumCharDelay, Math.min(maximumCharDelay, targetDurationMs / text.length))
      : fallbackDelay

  el.textContent = ""
  for (const char of text) {
    if (cancelled()) return false
    el.textContent += char
    await sleep(charDelay)
  }
  return !cancelled()
}

async function eraseText(el: HTMLElement, cancelled: () => boolean): Promise<boolean> {
  while ((el.textContent?.length ?? 0) > 0) {
    if (cancelled()) return false
    el.textContent = el.textContent!.slice(0, -1)
    await sleep(4 + Math.random() * 7)
  }
  return !cancelled()
}

async function runTypewriter(
  textEl: HTMLElement,
  postLinks: string[],
  speech: TypewriterSpeechRuntime,
  cancelled: () => boolean,
): Promise<void> {
  const recentQuotes: string[] = []

  while (!cancelled()) {
    const quoteText = await pickFreshQuote(postLinks, recentQuotes, cancelled)
    if (cancelled()) return
    if (!quoteText) {
      await sleep(500)
      continue
    }

    recentQuotes.push(quoteText)
    if (recentQuotes.length > recentQuoteWindowSize) {
      recentQuotes.shift()
    }

    const quote = `“${quoteText}”`
    const speechPlayback = speakQuote(speech, quoteText, cancelled)
    const typed = await typeText(textEl, quote, cancelled, speechPlayback.expectedDurationMs)
    if (!typed) return
    await Promise.race([speechPlayback.completion, sleep(speechPlayback.expectedDurationMs + 240)])
    if (cancelled()) return

    await sleep(postQuotePauseMs(quoteText))
    if (cancelled()) return

    const erased = await eraseText(textEl, cancelled)
    if (!erased) return

    await sleep(250 + Math.random() * 300)
  }
}

document.addEventListener("nav", () => {
  const textEl = document.querySelector("[data-blog-typewriter-text]") as HTMLElement | null
  if (!textEl) return

  let cancelled = false
  const speech = createSpeechRuntime()
  window.addCleanup(() => {
    cancelled = true
    speech.dispose()
  })

  const quoteLinks = [...document.querySelectorAll(".page-listing .section .desc a.internal")]
    .map((link) => (link as HTMLAnchorElement).href)
    .filter((href) => href.length > 0)

  void (async () => {
    await runTypewriter(textEl, quoteLinks, speech, () => cancelled)
  })()
})
