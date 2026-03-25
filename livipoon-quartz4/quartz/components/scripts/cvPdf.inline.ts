interface PdfJsLike {
  GlobalWorkerOptions: {
    workerSrc: string
  }
  getDocument: (src: string) => {
    promise: Promise<{
      numPages: number
      getPage: (pageNumber: number) => Promise<{
        getViewport: (params: { scale: number }) => { width: number; height: number }
        render: (params: {
          canvasContext: CanvasRenderingContext2D
          viewport: { width: number; height: number }
        }) => { promise: Promise<void> }
      }>
    }>
  }
}

const pdfJsBundleUrl = "/static/pdfjs/pdf.min.mjs"
const pdfJsWorkerUrl = "/static/pdfjs/pdf.worker.min.mjs"

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: number | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`Timed out while ${label}`))
    }, timeoutMs)
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId)
    }
  }
}

function clearNode(node: HTMLElement) {
  while (node.firstChild) {
    node.removeChild(node.firstChild)
  }
}

function renderFallback(container: HTMLElement, pdfSrc: string) {
  clearNode(container)

  const message = document.createElement("p")
  message.className = "cv-pdf-loading"
  message.textContent = "Unable to render CV inline right now."

  const link = document.createElement("a")
  link.className = "cv-pdf-open-link"
  link.href = pdfSrc
  link.target = "_blank"
  link.rel = "noreferrer"
  link.textContent = "Open CV PDF"

  container.append(message, link)
}

async function loadPdfJs(): Promise<PdfJsLike | null> {
  try {
    const module = (await withTimeout(import(pdfJsBundleUrl), 10000, "loading PDF.js")) as PdfJsLike
    module.GlobalWorkerOptions.workerSrc = pdfJsWorkerUrl
    return module
  } catch (error) {
    console.error("Unable to load pdf.js bundle for CV rendering", error)
    return null
  }
}

async function renderCvContainer(container: HTMLElement, pdfjs: PdfJsLike) {
  const pdfSrc = container.dataset.pdfSrc
  if (!pdfSrc) return

  const task = pdfjs.getDocument(pdfSrc)
  const pdf = await withTimeout(task.promise, 15000, "opening the CV PDF")

  clearNode(container)

  const targetWidth = Math.max(Math.min(container.clientWidth || 980, 1080), 320)
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const baseViewport = page.getViewport({ scale: 1 })
    const scale = targetWidth / baseViewport.width
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement("canvas")
    const context = canvas.getContext("2d")
    if (!context) continue

    canvas.width = Math.floor(viewport.width * pixelRatio)
    canvas.height = Math.floor(viewport.height * pixelRatio)
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    canvas.className = "cv-pdf-page"

    context.scale(pixelRatio, pixelRatio)
    await page.render({ canvasContext: context, viewport }).promise

    container.appendChild(canvas)
  }
}

async function initCvPdfRenderer() {
  const containers = Array.from(document.querySelectorAll<HTMLElement>(".cv-pdf-pages"))
  if (containers.length === 0) return

  const pdfjs = await loadPdfJs()
  if (!pdfjs) {
    for (const container of containers) {
      const pdfSrc = container.dataset.pdfSrc
      if (!pdfSrc) continue
      renderFallback(container, pdfSrc)
    }
    return
  }

  for (const container of containers) {
    try {
      await renderCvContainer(container, pdfjs)
    } catch (error) {
      console.error("Failed to render CV pages", error)
      const pdfSrc = container.dataset.pdfSrc
      if (!pdfSrc) continue
      renderFallback(container, pdfSrc)
    }
  }
}

document.addEventListener("nav", () => {
  void initCvPdfRenderer()
})

void initCvPdfRenderer()
