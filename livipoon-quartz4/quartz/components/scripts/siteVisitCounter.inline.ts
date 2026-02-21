type GoatcounterWindow = Window &
  typeof globalThis & {
    goatcounter?: {
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
const pollIntervalMs = 110
const maxPollChecks = 80
let pollTimer: number | null = null
let pollChecks = 0

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

function renderLocalPreviewCounter(): boolean {
  if (!isLocalPreviewHost()) return false

  const root = ensureCounterElement()
  const value = document.getElementById(counterValueId)
  if (!value) return false

  value.textContent = "12,345 (preview)"
  root.classList.add(visibleClass)
  return true
}

function stopPolling() {
  if (pollTimer === null) return
  window.clearInterval(pollTimer)
  pollTimer = null
}

function sanitizeCounterValue(value: HTMLElement) {
  const currentText = value.textContent?.trim().toLowerCase() ?? ""
  if (currentText.includes("403") || currentText.includes("forbidden")) {
    value.textContent = "counter unavailable"
  }
}

function renderCounter(): boolean {
  if (typeof counterWindow.goatcounter?.visit_count !== "function") return false

  const root = ensureCounterElement()
  const value = document.getElementById(counterValueId)
  if (!value) return false

  // GoatCounter visitor counter reference:
  // https://www.goatcounter.com/help/visitor-counter
  value.textContent = ""
  counterWindow.goatcounter!.visit_count!({
    append: `#${counterValueId}`,
    path: "TOTAL",
    no_branding: true,
  })

  window.setTimeout(() => {
    sanitizeCounterValue(value)
  }, 550)

  root.classList.add(visibleClass)
  return true
}

function syncVisitCounter() {
  stopPolling()
  pollChecks = 0

  if (renderCounter()) return
  if (renderLocalPreviewCounter()) return

  // Keep checking until GoatCounter script has initialized.
  pollTimer = window.setInterval(() => {
    pollChecks += 1

    if (renderCounter()) {
      stopPolling()
      return
    }

    if (pollChecks >= maxPollChecks) {
      stopPolling()
    }
  }, pollIntervalMs)
}

document.addEventListener("nav", syncVisitCounter)
syncVisitCounter()
