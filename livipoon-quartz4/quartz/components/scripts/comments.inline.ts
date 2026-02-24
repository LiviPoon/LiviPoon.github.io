const isVisible = (element: HTMLElement) => {
  const style = window.getComputedStyle(element)
  return (
    style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0
  )
}

const getGiscusContainers = () =>
  Array.from(document.querySelectorAll(".giscus")) as GiscusElement[]

const getGiscusContainer = () => {
  const containers = getGiscusContainers()
  if (containers.length === 0) {
    return null
  }

  return containers.find((container) => isVisible(container)) ?? containers[0]
}

const changeTheme = (e: CustomEventMap["themechange"]) => {
  const theme = getThemeUrl(getThemeName(e.detail.theme))
  const iframes = document.querySelectorAll("iframe.giscus-frame")
  if (iframes.length === 0) {
    return
  }

  for (const frame of iframes) {
    const iframe = frame as HTMLIFrameElement
    if (!iframe.contentWindow) {
      continue
    }

    iframe.contentWindow.postMessage(
      {
        giscus: {
          setConfig: {
            theme,
          },
        },
      },
      "https://giscus.app",
    )
  }
}

const getThemeName = (theme: string) => {
  if (theme !== "dark" && theme !== "light") {
    return theme
  }
  const giscusContainer = getGiscusContainer()
  if (!giscusContainer) {
    return theme
  }
  const darkGiscus = giscusContainer.dataset.darkTheme ?? "dark"
  const lightGiscus = giscusContainer.dataset.lightTheme ?? "light"
  return theme === "dark" ? darkGiscus : lightGiscus
}

const getThemeUrl = (theme: string) => {
  const giscusContainer = getGiscusContainer()
  const version = "20260224-10"
  const localThemeBase = `${window.location.origin}/static/giscus`
  if (!giscusContainer) {
    return `${localThemeBase}/${theme}.css?v=${version}`
  }

  const configuredThemeBase = giscusContainer.dataset.themeUrl
  if (!configuredThemeBase) {
    return `${localThemeBase}/${theme}.css?v=${version}`
  }

  try {
    const configuredUrl = new URL(configuredThemeBase, window.location.origin)
    const configuredBase = configuredUrl.toString().replace(/\/+$/, "")
    const canUseLocalThemeBase = window.location.protocol === "https:"

    // In preview hosts, prefer local static themes when HTTPS is available.
    // On HTTP localhost, giscus (HTTPS iframe) blocks HTTP theme URLs as mixed content.
    const themeBase =
      configuredUrl.hostname === window.location.hostname || !canUseLocalThemeBase
        ? configuredBase
        : localThemeBase

    return `${themeBase}/${theme}.css?v=${version}`
  } catch {
    return `${localThemeBase}/${theme}.css?v=${version}`
  }
}

type GiscusElement = Omit<HTMLElement, "dataset"> & {
  dataset: DOMStringMap & {
    repo: `${string}/${string}`
    repoId: string
    category: string
    categoryId: string
    themeUrl: string
    lightTheme: string
    darkTheme: string
    mapping: "url" | "title" | "og:title" | "specific" | "number" | "pathname"
    strict: string
    reactionsEnabled: string
    inputPosition: "top" | "bottom"
    lang: string
  }
}

document.addEventListener("nav", () => {
  const giscusContainer = getGiscusContainer()
  if (!giscusContainer) {
    return
  }

  giscusContainer.innerHTML = ""

  const giscusScript = document.createElement("script")
  giscusScript.src = "https://giscus.app/client.js"
  giscusScript.async = true
  giscusScript.crossOrigin = "anonymous"
  giscusScript.setAttribute("data-loading", "lazy")
  giscusScript.setAttribute("data-emit-metadata", "0")
  giscusScript.setAttribute("data-repo", giscusContainer.dataset.repo)
  giscusScript.setAttribute("data-repo-id", giscusContainer.dataset.repoId)
  giscusScript.setAttribute("data-category", giscusContainer.dataset.category)
  giscusScript.setAttribute("data-category-id", giscusContainer.dataset.categoryId)
  giscusScript.setAttribute("data-mapping", giscusContainer.dataset.mapping)
  giscusScript.setAttribute("data-strict", giscusContainer.dataset.strict)
  giscusScript.setAttribute("data-reactions-enabled", giscusContainer.dataset.reactionsEnabled)
  giscusScript.setAttribute("data-input-position", giscusContainer.dataset.inputPosition)
  giscusScript.setAttribute("data-lang", giscusContainer.dataset.lang)
  // If Darkmode component is not mounted, saved-theme can be missing.
  // In that case, force light to avoid giscus auto-selecting dark on a light page.
  const theme = document.documentElement.getAttribute("saved-theme") ?? "light"
  giscusScript.setAttribute("data-theme", getThemeUrl(getThemeName(theme)))

  giscusContainer.appendChild(giscusScript)

  document.addEventListener("themechange", changeTheme)
  window.addCleanup(() => document.removeEventListener("themechange", changeTheme))
})
