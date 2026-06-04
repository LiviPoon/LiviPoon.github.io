// Only show on first page load per session, not SPA navigations
if (!sessionStorage.getItem("loader-shown")) {
  sessionStorage.setItem("loader-shown", "1")

  const overlay = document.createElement("div")
  overlay.id = "page-loader-overlay"

  const img = document.createElement("img")
  img.src = "/static/butterfly-loading.png"
  img.alt = ""
  img.draggable = false
  overlay.appendChild(img)

  document.body.prepend(overlay)

  function dismiss() {
    overlay.classList.add("page-loader-leaving")
    setTimeout(() => overlay.remove(), 700)
  }

  const minDisplayMs = 1400
  const start = Date.now()

  function dismissAfterMin() {
    const elapsed = Date.now() - start
    const remaining = minDisplayMs - elapsed
    setTimeout(dismiss, Math.max(0, remaining))
  }

  if (document.readyState === "complete") {
    dismissAfterMin()
  } else {
    window.addEventListener("load", dismissAfterMin, { once: true })
  }

  // Failsafe
  setTimeout(dismiss, 6000)
}
