// CV page: [data-cv-open] buttons show the PDF in #cv-overlay (rendered by cv-pdf.js on first open).
;(() => {
  const overlay = document.getElementById("cv-overlay")
  if (!overlay) return
  const pages = overlay.querySelector(".cv-pdf-pages")
  const closeBtn = overlay.querySelector("[data-cv-close]")
  let opener = null

  function open(e) {
    opener = e && e.currentTarget
    overlay.hidden = false
    document.documentElement.classList.add("cv-open")
    requestAnimationFrame(() => overlay.classList.add("is-on"))
    if (window.__soundscape) window.__soundscape.duck(true)
    closeBtn.focus({ preventScroll: true })
    if (window.__renderCvPdf) window.__renderCvPdf(pages)
    if (location.hash !== "#pdf") history.replaceState(null, "", "#pdf")
  }

  function close() {
    if (overlay.hidden) return
    overlay.classList.remove("is-on")
    document.documentElement.classList.remove("cv-open")
    if (window.__soundscape) window.__soundscape.duck(false)
    setTimeout(() => (overlay.hidden = true), 300)
    if (location.hash === "#pdf") history.replaceState(null, "", location.pathname + location.search)
    if (opener) opener.focus({ preventScroll: true })
  }

  document.querySelectorAll("[data-cv-open]").forEach((b) => b.addEventListener("click", open))
  closeBtn.addEventListener("click", close)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close()
  })
  // /cv/#pdf opens straight to the PDF (handy for sharing the plain CV)
  if (location.hash === "#pdf") addEventListener("load", () => open())
})()
