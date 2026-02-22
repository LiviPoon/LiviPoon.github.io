const changeTheme = (e: CustomEventMap["themechange"]) => {
  const theme = e.detail.theme
  const iframe = document.querySelector("iframe.giscus-frame") as HTMLIFrameElement
  if (!iframe) {
    return
  }

  if (!iframe.contentWindow) {
    return
  }

  iframe.contentWindow.postMessage(
    {
      giscus: {
        setConfig: {
          theme: getThemeUrl(getThemeName(theme)),
        },
      },
    },
    "https://giscus.app",
  )
}

const getThemeName = (theme: string) => {
  if (theme !== "dark" && theme !== "light") {
    return theme
  }
  const giscusContainer = document.querySelector(".giscus") as GiscusElement
  if (!giscusContainer) {
    return theme
  }
  const darkGiscus = giscusContainer.dataset.darkTheme ?? "dark"
  const lightGiscus = giscusContainer.dataset.lightTheme ?? "light"
  return theme === "dark" ? darkGiscus : lightGiscus
}

const getThemeUrl = (theme: string) => {
  const giscusContainer = document.querySelector(".giscus") as GiscusElement
  const version = "20260222-8"
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

    // Use local theme files in cross-host previews when possible.
    // On HTTP localhost, giscus (HTTPS iframe) may block HTTP theme URLs as mixed content.
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
  const giscusContainer = document.querySelector(".giscus") as GiscusElement
  if (!giscusContainer) {
    return
  }

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
  const theme = document.documentElement.getAttribute("saved-theme")
  if (theme) {
    giscusScript.setAttribute("data-theme", getThemeUrl(getThemeName(theme)))
  }

  giscusContainer.appendChild(giscusScript)

  document.addEventListener("themechange", changeTheme)
  window.addCleanup(() => document.removeEventListener("themechange", changeTheme))
})
