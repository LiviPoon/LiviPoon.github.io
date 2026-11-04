// Quote journal (/quote-journal/): types out random quotes from /quote-journal/quote.html.
(() => {
  var canonicalRegex = /<link rel="canonical" href="([^"]*)">/;
  async function fetchCanonical(url) {
    const res = await fetch(`${url}`);
    if (!res.headers.get("content-type")?.startsWith("text/html")) {
      return res;
    }
    const text = await res.clone().text();
    const [_, redirect] = text.match(canonicalRegex) ?? [];
    return redirect ? fetch(`${new URL(redirect, url)}`) : res;
  }
  var parser = new DOMParser();
  var minChars = 24;
  var maxChars = 320;
  var minWords = 8;
  var maxWords = 50;
  var minScore = 1;
  var rejectedFragments = [
    "http://",
    "https://",
    "wikipedia",
    "retrieved",
    "doi",
    "journal",
    "references"
  ];
  var referenceSectionHeadings = [
    "reference",
    "references",
    "sources",
    "works cited",
    "bibliography",
    "citations",
    "further reading"
  ];
  var interestingTerms = [
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
    "collaborative"
  ];
  var sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  var defaultSpeechRate = 0.86;
  var audioMuteStorageKey = "siteAudioMuted";
  var muteEventName = "background-mute-changed";
  var recentQuoteWindowSize = 24;
  var fallbackQuotes = [
    "Curiosity often begins where comfort finally starts to end.",
    "Meaning grows when we choose challenge over familiar safety.",
    "Small risks taken consistently can open unexpectedly larger lives.",
    "Empathy makes difficult work feel more honest and deeply human."
  ];
  var minPostQuotePauseMs = 1e3;
  var maxPostQuotePauseMs = 3e3;
  var quoteSourcePostLimit = 3;
  function normalizeWhitespace(text) {
    return text.replace(/\s+/g, " ").trim();
  }
  function normalizeHeadingText(text) {
    return normalizeWhitespace(text.toLowerCase().replace(/[^a-z0-9\s]/g, " "));
  }
  function isReferenceSectionHeading(text) {
    const normalized = normalizeHeadingText(text);
    return normalized.length > 0 && referenceSectionHeadings.includes(normalized);
  }
  function getHeadingLevel(node) {
    const level = node.tagName.match(/^H([1-6])$/i)?.[1];
    return level ? Number(level) : 0;
  }
  function wordCount(text) {
    const normalized = normalizeWhitespace(text);
    if (normalized.length === 0) return 0;
    return normalized.split(/\s+/).length;
  }
  function isQuoteLongEnough(text) {
    return wordCount(text) > 7;
  }
  function isQuoteEligibleForSourceMode(text, sourceMode) {
    if (sourceMode === "source-page") {
      return wordCount(text) >= 3;
    }
    return isQuoteLongEnough(text);
  }
  function isSpeechMuted() {
    return localStorage.getItem(audioMuteStorageKey) === "true";
  }
  function shuffle(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  function pickRandom(list) {
    if (list.length === 0) return null;
    return list[Math.floor(Math.random() * list.length)] ?? null;
  }
  function isCompleteSentence(text) {
    const normalized = normalizeWhitespace(text);
    if (!normalized) return false;
    return /[.!?][)"'\]»”’]*$/.test(normalized);
  }
  function splitSentences(text) {
    const normalized = normalizeWhitespace(text);
    if (!normalized) return [];
    const intlWithSegmenter = Intl;
    if (intlWithSegmenter.Segmenter) {
      const segmenter = new intlWithSegmenter.Segmenter(void 0, { granularity: "sentence" });
      return [...segmenter.segment(normalized)].map((entry) => normalizeWhitespace(entry.segment)).filter((chunk) => chunk.length > 0);
    }
    const chunks = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
    return chunks.map((chunk) => normalizeWhitespace(chunk)).filter((chunk) => chunk.length > 0);
  }
  function scoreSentence(sentence) {
    const lower = sentence.toLowerCase();
    const words = wordCount(sentence);
    if (!isCompleteSentence(sentence)) return -1;
    if (sentence.length < minChars || sentence.length > maxChars) return -1;
    if (words < minWords || words > maxWords) return -1;
    if (rejectedFragments.some((fragment) => lower.includes(fragment))) return -1;
    const digitCount = (sentence.match(/\d/g) ?? []).length;
    if (digitCount > 4) return -1;
    let score = 0;
    if (/\b(i|we|you)\b/i.test(sentence)) score += 1;
    if (/[!?]/.test(sentence)) score += 1;
    if (/[,:;]/.test(sentence)) score += 1;
    for (const term of interestingTerms) {
      if (lower.includes(term)) {
        score += 1;
      }
    }
    return score;
  }
  function collectSentenceCandidates(text) {
    const sentences = splitSentences(text);
    const candidates = [];
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i] ?? "";
      const sentenceComplete = isCompleteSentence(sentence);
      const score = scoreSentence(sentence);
      if (score >= minScore) {
        candidates.push({ text: sentence, score });
      }
      const next = sentences[i + 1];
      if (sentenceComplete && next && isCompleteSentence(next)) {
        const combined = normalizeWhitespace(`${sentence} ${next}`);
        const combinedScore = scoreSentence(combined);
        if (combinedScore >= minScore + 1) {
          candidates.push({ text: combined, score: combinedScore + 1 });
        }
      }
    }
    return candidates;
  }
  function sanitizeSourceQuote(text) {
    return normalizeWhitespace(
      text.replace(/^[\s>"“"'`‘’\-*•\d().:]+/, "").replace(/[\s"”"'`’]+$/, "")
    );
  }
  function pickQuotesFromSourceDoc(doc) {
    const article = doc.querySelector(".center article") ?? doc.querySelector("article");
    if (!article) return [];
    const contentNodes = [...article.querySelectorAll("blockquote, li, p")];
    const picked = [];
    const seen = /* @__PURE__ */ new Set();
    for (const node of contentNodes) {
      const text = sanitizeSourceQuote(node.textContent ?? "");
      if (text.length < 10) continue;
      if (wordCount(text) < 3) continue;
      if (rejectedFragments.some((fragment) => text.toLowerCase().includes(fragment))) continue;
      if (seen.has(text)) continue;
      seen.add(text);
      picked.push(text);
    }
    return shuffle(picked);
  }
  function pickGoodQuotesFromDoc(doc, sourceMode) {
    if (sourceMode === "source-page") {
      return pickQuotesFromSourceDoc(doc);
    }
    const article = doc.querySelector(".center article") ?? doc.querySelector("article");
    if (!article) return [];
    const contentNodes = [...article.querySelectorAll("h1, h2, h3, h4, h5, h6, p, li, blockquote")];
    const candidates = [];
    let referenceSectionLevel = null;
    for (const node of contentNodes) {
      if (/^H[1-6]$/i.test(node.tagName)) {
        const headingText = normalizeWhitespace(node.textContent ?? "");
        const headingLevel = getHeadingLevel(node);
        if (referenceSectionLevel === null) {
          if (isReferenceSectionHeading(headingText)) {
            referenceSectionLevel = headingLevel;
          }
          continue;
        }
        if (headingLevel <= referenceSectionLevel) {
          referenceSectionLevel = isReferenceSectionHeading(headingText) ? headingLevel : null;
        }
        continue;
      }
      if (referenceSectionLevel !== null) continue;
      const blockText = normalizeWhitespace(node.textContent ?? "");
      if (blockText.length === 0) continue;
      candidates.push(...collectSentenceCandidates(blockText));
    }
    if (candidates.length === 0) {
      return [];
    }
    const byText = /* @__PURE__ */ new Map();
    for (const candidate of candidates) {
      const current = byText.get(candidate.text) ?? Number.NEGATIVE_INFINITY;
      if (candidate.score > current) {
        byText.set(candidate.text, candidate.score);
      }
    }
    const ranked = [...byText.entries()].map(([text, score]) => ({ text, score })).sort((a, b) => b.score - a.score).slice(0, 40);
    const selected = shuffle(ranked).slice(0, 24).map((candidate) => candidate.text);
    return selected.length > 0 ? selected : candidates.sort((a, b) => b.score - a.score).slice(0, 1).map((candidate) => candidate.text);
  }
  async function collectQuotes(postLinks, cancelled, sourceMode) {
    const quotes = [];
    for (const postLink of shuffle(postLinks)) {
      if (cancelled()) return [];
      try {
        const url = new URL(postLink, window.location.href);
        const response = await fetchCanonical(url);
        if (cancelled()) return [];
        if (!response.headers.get("content-type")?.startsWith("text/html")) {
          continue;
        }
        const html = await response.text();
        if (cancelled()) return [];
        const doc = parser.parseFromString(html, "text/html");
        const picked = pickGoodQuotesFromDoc(doc, sourceMode);
        quotes.push(...picked);
      } catch {
      }
    }
    const deduped = [];
    const seenQuotes = /* @__PURE__ */ new Set();
    for (const quote of shuffle(quotes)) {
      if (isQuoteEligibleForSourceMode(quote, sourceMode) && !seenQuotes.has(quote)) {
        seenQuotes.add(quote);
        deduped.push(quote);
      }
    }
    return deduped;
  }
  async function pickFreshQuote(postLinks, recentQuotes, cancelled, sourceMode) {
    const eligibleFallbackQuotes = fallbackQuotes.filter(isQuoteLongEnough);
    if (postLinks.length === 0) {
      return pickRandom(eligibleFallbackQuotes) ?? eligibleFallbackQuotes[0] ?? "";
    }
    const fetched = await collectQuotes(postLinks, cancelled, sourceMode);
    if (cancelled()) return "";
    const recentQuoteSet = new Set(recentQuotes);
    const unseenPool = fetched.filter(
      (quote) => isQuoteEligibleForSourceMode(quote, sourceMode) && !recentQuoteSet.has(quote)
    );
    const pool = unseenPool.length > 0 ? unseenPool : fetched;
    return pickRandom(pool) ?? pickRandom(eligibleFallbackQuotes) ?? eligibleFallbackQuotes[0] ?? "";
  }
  function scoreVoice(voice) {
    const joined = `${voice.name} ${voice.voiceURI}`.toLowerCase();
    const lang = voice.lang.toLowerCase();
    let score = 0;
    if (lang.startsWith("en")) score += 12;
    if (/\b(perfect paul|dectalk)\b/.test(joined)) score += 120;
    if (/\b(fred|zarvox)\b/.test(joined)) score += 95;
    if (/\b(robot|synth|synthetic)\b/.test(joined)) score += 42;
    if (/\b(espeak|festival|desktop)\b/.test(joined)) score += 34;
    if (/\bmicrosoft david desktop\b/.test(joined)) score += 48;
    if (/\b(david|daniel|alex|tom)\b/.test(joined)) score += 12;
    if (/\bneural\b/.test(joined)) score -= 28;
    if (/\bnatural\b/.test(joined)) score -= 18;
    if (/\bpremium\b/.test(joined)) score -= 10;
    if (/\benhanced\b/.test(joined)) score -= 8;
    if (/\b(siri|google|cortana|wavenet)\b/.test(joined)) score -= 8;
    if (voice.default) score += 2;
    return score;
  }
  function selectHawkingLikeVoice(allVoices) {
    if (allVoices.length === 0) return null;
    const unique = allVoices.filter(
      (voice, idx, arr) => arr.findIndex((other) => other.voiceURI === voice.voiceURI) === idx
    );
    const english = unique.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
    const pool = english.length > 0 ? english : unique;
    return [...pool].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] ?? null;
  }
  function estimateSpeechDurationMs(text, rate) {
    const normalized = normalizeWhitespace(text);
    const words = Math.max(1, normalized.split(/\s+/).length);
    const punctuationCount = (normalized.match(/[.,!?;:]/g) ?? []).length;
    const wordsPerMinute = Math.max(90, 165 * rate);
    const baseMs = words / wordsPerMinute * 6e4;
    const punctuationPauseMs = punctuationCount * 110;
    return Math.max(900, baseMs + punctuationPauseMs + 140);
  }
  function postQuotePauseMs(quoteText, sourceMode) {
    const length = normalizeWhitespace(quoteText).length;
    const clampedLength = Math.min(maxChars, Math.max(minChars, length));
    const lengthRange = Math.max(1, maxChars - minChars);
    const normalized = (clampedLength - minChars) / lengthRange;
    const inverse = 1 - normalized;
    const basePause = Math.round(
      minPostQuotePauseMs + inverse * (maxPostQuotePauseMs - minPostQuotePauseMs)
    );
    if (sourceMode === "source-page") {
      return Math.max(320, Math.round(basePause * 0.42));
    }
    return basePause;
  }
  function createSpeechRuntime() {
    const unsupported = {
      enabled: false,
      selectedVoice: null,
      speechRate: defaultSpeechRate,
      activeUtteranceId: 0,
      refreshVoices: () => {
      },
      dispose: () => {
      }
    };
    if (typeof window.speechSynthesis === "undefined" || typeof SpeechSynthesisUtterance === "undefined") {
      return unsupported;
    }
    const synth = window.speechSynthesis;
    const onMuteChanged = (event) => {
      const muted = event.detail?.muted;
      if (muted) {
        synth.cancel();
      }
    };
    const onStorageChanged = (event) => {
      if (event.key === audioMuteStorageKey && event.newValue === "true") {
        synth.cancel();
      }
    };
    const runtime = {
      enabled: true,
      selectedVoice: null,
      speechRate: defaultSpeechRate,
      activeUtteranceId: 0,
      refreshVoices: () => {
        const allVoices = synth.getVoices();
        runtime.selectedVoice = selectHawkingLikeVoice(allVoices);
      },
      dispose: () => {
      }
    };
    const onVoicesChanged = () => {
      runtime.refreshVoices();
    };
    runtime.dispose = () => {
      synth.removeEventListener?.("voiceschanged", onVoicesChanged);
      document.removeEventListener(muteEventName, onMuteChanged);
      window.removeEventListener("storage", onStorageChanged);
      synth.cancel();
    };
    runtime.refreshVoices();
    synth.addEventListener?.("voiceschanged", onVoicesChanged);
    document.addEventListener(muteEventName, onMuteChanged);
    window.addEventListener("storage", onStorageChanged);
    return runtime;
  }
  function stripQuotePunctuation(text) {
    return normalizeWhitespace(text.replace(/[“”]/g, ""));
  }
  function speakQuote(runtime, quote, cancelled) {
    const text = stripQuotePunctuation(quote);
    const expectedDurationMs = estimateSpeechDurationMs(text, runtime.speechRate);
    if (!text || !runtime.enabled || cancelled() || document.visibilityState === "hidden" || isSpeechMuted()) {
      return { expectedDurationMs, completion: Promise.resolve() };
    }
    const synth = window.speechSynthesis;
    if (!runtime.selectedVoice) {
      runtime.refreshVoices();
    }
    const utterance = new SpeechSynthesisUtterance(text);
    const utteranceId = ++runtime.activeUtteranceId;
    const voice = runtime.selectedVoice;
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    utterance.rate = runtime.speechRate;
    utterance.pitch = 0.72;
    utterance.volume = 0.9;
    let settleCompletion = () => {
    };
    const completion = new Promise((resolve) => {
      settleCompletion = resolve;
      utterance.onend = () => {
        if (runtime.activeUtteranceId === utteranceId) {
        }
        resolve();
      };
      utterance.onerror = () => {
        if (runtime.activeUtteranceId === utteranceId) {
        }
        resolve();
      };
    });
    try {
      synth.cancel();
      synth.speak(utterance);
    } catch {
      if (runtime.activeUtteranceId === utteranceId) {
      }
      settleCompletion();
    }
    return { expectedDurationMs, completion };
  }
  async function typeText(el, text, cancelled, targetDurationMs, fastMode = false) {
    const minimumCharDelay = fastMode ? 5 : 14;
    const maximumCharDelay = fastMode ? 40 : 90;
    const fallbackDelay = fastMode ? 12 : 32;
    const charDelay = targetDurationMs && text.length > 0 ? Math.max(minimumCharDelay, Math.min(maximumCharDelay, targetDurationMs / text.length)) : fallbackDelay;
    el.textContent = "";
    for (const char of text) {
      if (cancelled()) return false;
      el.textContent += char;
      await sleep(charDelay);
    }
    return !cancelled();
  }
  async function eraseText(el, cancelled) {
    while ((el.textContent?.length ?? 0) > 0) {
      if (cancelled()) return false;
      el.textContent = el.textContent.slice(0, -1);
      await sleep(4 + Math.random() * 7);
    }
    return !cancelled();
  }
  async function runTypewriter(textEl, postLinks, sourceMode, speech, cancelled) {
    const recentQuotes = [];
    while (!cancelled()) {
      const quoteText = await pickFreshQuote(postLinks, recentQuotes, cancelled, sourceMode);
      if (cancelled()) return;
      if (!quoteText) {
        await sleep(500);
        continue;
      }
      recentQuotes.push(quoteText);
      if (recentQuotes.length > recentQuoteWindowSize) {
        recentQuotes.shift();
      }
      const quote = `\u201C${quoteText}\u201D`;
      const useSpeech = sourceMode === "blog-posts";
      const speechPlayback = useSpeech ? speakQuote(speech, quoteText, cancelled) : {
        expectedDurationMs: 0,
        completion: Promise.resolve()
      };
      const typed = await typeText(
        textEl,
        quote,
        cancelled,
        useSpeech ? speechPlayback.expectedDurationMs : void 0,
        !useSpeech
      );
      if (!typed) return;
      if (useSpeech) {
        await Promise.race([
          speechPlayback.completion,
          sleep(speechPlayback.expectedDurationMs + 240)
        ]);
        if (cancelled()) return;
      }
      const quoteHoldDelayMs = sourceMode === "source-page" ? Math.max(3e3, postQuotePauseMs(quoteText, sourceMode)) : postQuotePauseMs(quoteText, sourceMode);
      await sleep(quoteHoldDelayMs);
      if (cancelled()) return;
      const erased = await eraseText(textEl, cancelled);
      if (!erased) return;
      const interQuoteDelayMs = sourceMode === "source-page" ? 250 : 250 + Math.random() * 300;
      await sleep(interQuoteDelayMs);
    }
  }
  (() => {
    const typewriterRoot = document.querySelector("[data-blog-typewriter]");
    if (!typewriterRoot) return;
    const textEl = typewriterRoot.querySelector("[data-blog-typewriter-text]");
    if (!textEl) return;
    let cancelled = false;
    const speech = createSpeechRuntime();
    const explicitQuoteSource = typewriterRoot.dataset.blogTypewriterSource?.trim() ?? "";
    let quoteLinks = [];
    let sourceMode = "blog-posts";
    if (explicitQuoteSource.length > 0) {
      try {
        quoteLinks = [new URL(explicitQuoteSource, window.location.href).href];
        sourceMode = "source-page";
      } catch {
        quoteLinks = [];
      }
    }
    if (quoteLinks.length === 0) {
      sourceMode = "blog-posts";
      quoteLinks = [...document.querySelectorAll(".page-listing .section")].map((section, index) => {
        const link = section.querySelector(".desc a.internal");
        if (!link?.href) return null;
        const time = section.querySelector(".meta time[datetime]");
        const rawDateTime = time?.dateTime?.trim() ?? "";
        const parsedDateTime = rawDateTime.length > 0 ? Date.parse(rawDateTime) : Number.NaN;
        const dateMs = Number.isFinite(parsedDateTime) ? parsedDateTime : null;
        return {
          href: link.href,
          dateMs,
          index
        };
      }).filter(
        (source) => source !== null
      ).sort((left, right) => {
        if (left.dateMs !== null && right.dateMs !== null) {
          return right.dateMs - left.dateMs;
        }
        if (left.dateMs !== null) return -1;
        if (right.dateMs !== null) return 1;
        return left.index - right.index;
      }).slice(0, quoteSourcePostLimit).map((source) => source.href);
    }
    void (async () => {
      await runTypewriter(textEl, quoteLinks, sourceMode, speech, () => cancelled);
    })();
  })();
})();
