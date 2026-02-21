type GoatcounterWindow = Window &
  typeof globalThis & {
    goatcounter?: {
      endpoint?: string
      visit_count?: (options: {
        append: string
        path: string
        no_branding?: boolean
      }) => void
    }
  }

const counterWindow = window as GoatcounterWindow
const counterId = "site-visit-counter"
const counterValueId = "site-visit-counter-value"
const visibleClass = "is-visible"
const maxAttempts = 50
const retryDelayMs = 220
let renderAttempts = 0
let renderTimer: number | null = null

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

function hasVisitCounterApi(): boolean {
  return (
    typeof counterWindow.goatcounter?.visit_count === "function" &&
    typeof resolveGoatcounterEndpoint() === "string"
  )
}

function resolveGoatcounterEndpoint(): string | null {
  const fromWindow = counterWindow.goatcounter?.endpoint
  if (typeof fromWindow === "string" && fromWindow.length > 0) {
    return fromWindow
  }

  const script = document.querySelector("script[data-goatcounter]") as HTMLScriptElement | null
  const fromScript = script?.getAttribute("data-goatcounter")
  if (fromScript && fromScript.length > 0) {
    if (counterWindow.goatcounter) {
      counterWindow.goatcounter.endpoint = fromScript
    }
    return fromScript
  }

  return null
}

function renderLocalPreviewCounter(): boolean {
  if (!isLocalPreviewHost()) return false

  const root = ensureCounterElement()
  const value = document.getElementById(counterValueId)
  if (!value) return false

  value.textContent = "12,345 (preview)"
  root.classList.add(visibleClass)
  return true
}

function renderCounter(): boolean {
  if (!hasVisitCounterApi()) return false

  const root = ensureCounterElement()
  const value = document.getElementById(counterValueId)
  if (!value) return false

  value.textContent = ""
  counterWindow.goatcounter!.visit_count!({
    append: `#${counterValueId}`,
    path: "TOTAL",
    no_branding: true,
  })

  // If GoatCounter responds with text errors (for example 403),
  // avoid showing raw status text in the UI.
  window.setTimeout(() => {
    const currentText = value.textContent?.trim().toLowerCase() ?? ""
    if (currentText.includes("403") || currentText.includes("forbidden")) {
      value.textContent = "counter unavailable"
    }
  }, 500)

  root.classList.add(visibleClass)
  return true
}

function queueRetry() {
  if (renderTimer !== null) {
    window.clearTimeout(renderTimer)
    renderTimer = null
  }

  if (renderAttempts >= maxAttempts) return
  renderAttempts += 1
  renderTimer = window.setTimeout(() => {
    renderTimer = null
    if (!renderCounter()) {
      queueRetry()
    }
  }, retryDelayMs)
}

function syncVisitCounter() {
  renderAttempts = 0
  if (renderCounter()) return
  if (renderLocalPreviewCounter()) return
  queueRetry()
}

document.addEventListener("nav", syncVisitCounter)
syncVisitCounter()
