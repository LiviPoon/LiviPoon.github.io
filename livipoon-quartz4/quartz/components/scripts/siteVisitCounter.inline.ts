type GoatcounterWindow = Window &
  typeof globalThis & {
    goatcounter?: {
      endpoint?: string
    }
  }

const counterWindow = window as GoatcounterWindow
const counterId = "site-visit-counter"
const counterValueId = "site-visit-counter-value"
const visibleClass = "is-visible"
const initPollIntervalMs = 250
const refreshIntervalMs = 5000
const maxInitPollChecks = 40
const localPreviewValue = "2"
let initPollTimer: number | null = null
let refreshTimer: number | null = null
let initPollChecks = 0

function isLocalPreviewHost(): boolean {
  const host = location.hostname.toLowerCase()
  return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1"
}

function ensureCounterElement(): HTMLDivElement {
  let root = document.getElementById(counterId) as HTMLDivElement | null
  if (root) return root

  root = document.createElement("div")
  root.id = counterId
  root.className = "site-visit-counter"

  const label = document.createElement("span")
  label.className = "site-visit-counter-label"
  label.textContent = "site visits:"

  const value = document.createElement("span")
  value.id = counterValueId
  value.className = "site-visit-counter-value"

  root.append(label, value)
  document.body.appendChild(root)
  return root
}

function setCounterValue(valueText: string) {
  const root = ensureCounterElement()
  const value = document.getElementById(counterValueId)
  if (!value) return

  value.textContent = valueText
  root.classList.add(visibleClass)
}

function renderLocalPreviewCounter(): boolean {
  if (!isLocalPreviewHost()) return false
  setCounterValue(localPreviewValue)
  return true
}

function resolveGoatcounterEndpoint(): string | null {
  const fromWindow = counterWindow.goatcounter?.endpoint
  if (typeof fromWindow === "string" && fromWindow.length > 0) {
    return fromWindow
  }

  const script = document.querySelector("script[data-goatcounter]") as HTMLScriptElement | null
  const fromScript = script?.getAttribute("data-goatcounter")
  if (fromScript && fromScript.length > 0) {
    return fromScript
  }

  return null
}

function resolveTotalCounterJsonUrl(): string | null {
  const endpoint = resolveGoatcounterEndpoint()
  if (!endpoint) return null

  try {
    const endpointUrl = new URL(endpoint, location.href)
    return `${endpointUrl.origin}/counter/${encodeURIComponent("TOTAL")}.json`
  } catch {
    return null
  }
}

async function fetchTotalCount(): Promise<string | null> {
  const jsonUrl = resolveTotalCounterJsonUrl()
  if (!jsonUrl) return null

  try {
    // GoatCounter visitor counter JSON endpoint:
    // https://www.goatcounter.com/help/visitor-counter
    const response = await fetch(jsonUrl, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
    })

    if (response.status === 403) {
      return "counter unavailable"
    }
    if (!response.ok) {
      return null
    }

    const payload = (await response.json()) as { count?: string | number }
    const count = payload.count
    if (typeof count === "number") return count.toLocaleString()
    if (typeof count === "string" && count.trim().length > 0) return count.trim()
    return null
  } catch {
    return null
  }
}

async function updateCounterFromJson(): Promise<boolean> {
  const value = await fetchTotalCount()
  if (!value) return false
  setCounterValue(value)
  return true
}

function stopInitPoll() {
  if (initPollTimer === null) return
  window.clearInterval(initPollTimer)
  initPollTimer = null
}

function stopRefreshLoop() {
  if (refreshTimer === null) return
  window.clearInterval(refreshTimer)
  refreshTimer = null
}

function startRefreshLoop() {
  stopRefreshLoop()
  refreshTimer = window.setInterval(() => {
    void updateCounterFromJson()
  }, refreshIntervalMs)
}

function syncVisitCounter() {
  stopInitPoll()
  stopRefreshLoop()
  initPollChecks = 0

  if (renderLocalPreviewCounter()) return

  void (async () => {
    if (await updateCounterFromJson()) {
      startRefreshLoop()
    }
  })()

  // Wait for GoatCounter endpoint script to be present on initial load.
  initPollTimer = window.setInterval(() => {
    initPollChecks += 1
    void (async () => {
      if (await updateCounterFromJson()) {
        stopInitPoll()
        startRefreshLoop()
      } else if (initPollChecks >= maxInitPollChecks) {
        stopInitPoll()
      }
    })()
  }, initPollIntervalMs)
}

window.addEventListener("beforeunload", () => {
  stopInitPoll()
  stopRefreshLoop()
})

document.addEventListener("nav", () => {
  // For SPA navigations, restart polling and refresh loop.
  syncVisitCounter()
})

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    void updateCounterFromJson()
    if (!isLocalPreviewHost()) {
      startRefreshLoop()
    }
  } else {
    stopRefreshLoop()
    if (!isLocalPreviewHost()) {
      stopInitPoll()
    }
  }
})

syncVisitCounter()
