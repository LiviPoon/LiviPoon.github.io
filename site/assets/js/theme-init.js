// Applies the saved light/dark theme before first paint (default: dark).
(() => {
  (function() {
    const stored = localStorage.getItem("theme");
    const theme = stored ?? "dark";
    document.documentElement.setAttribute("saved-theme", theme);
  })();
})();
