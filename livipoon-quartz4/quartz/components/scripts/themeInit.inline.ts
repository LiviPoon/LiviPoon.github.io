;(function () {
  const stored = localStorage.getItem("theme")
  const theme = stored ?? "dark"
  document.documentElement.setAttribute("saved-theme", theme)
})()
