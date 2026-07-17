import * as pdfjs from "/static/pdfjs/pdf.min.mjs"

pdfjs.GlobalWorkerOptions.workerSrc = "/static/pdfjs/pdf.worker.min.mjs"

const pages = document.querySelector("[data-cv-pages]")
const status = document.querySelector("[data-cv-status]")
const back = document.querySelector("[data-cv-back]")

back?.addEventListener("click", (event) => {
  if (document.referrer && new URL(document.referrer).origin === window.location.origin) {
    event.preventDefault()
    window.history.back()
  }
})

async function renderCv() {
  if (!pages) return

  const source = pages.dataset.pdfSrc
  if (!source) return

  try {
    const pdf = await pdfjs.getDocument(source).promise
    const pageWidth = Math.max(document.documentElement.clientWidth, 320)
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    const fragment = document.createDocumentFragment()

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const naturalViewport = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: pageWidth / naturalViewport.width })
      const canvas = document.createElement("canvas")
      const context = canvas.getContext("2d")
      if (!context) continue

      canvas.className = "cv-page"
      canvas.width = Math.ceil(viewport.width * pixelRatio)
      canvas.height = Math.ceil(viewport.height * pixelRatio)
      canvas.setAttribute("aria-label", `CV page ${pageNumber} of ${pdf.numPages}`)

      await page.render({
        canvasContext: context,
        viewport,
        transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
      }).promise

      fragment.append(canvas)
    }

    pages.replaceChildren(fragment)
  } catch (error) {
    console.error("Unable to render CV", error)
    if (status) {
      status.innerHTML = '<a href="/cv/cv.pdf">Open the CV</a>'
    }
  }
}

void renderCv()
