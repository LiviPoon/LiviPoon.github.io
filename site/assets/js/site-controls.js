// Bottom bar on subpages: license link (left) and light/dark toggle (right).
(() => {
  var LICENSE_URL = "https://creativecommons.org/licenses/by-nc-nd/4.0/";
  var LICENSE_LABEL = "CC BY-NC-ND 4.0";
  function applyVideoTheme() {
    const video = document.querySelector(".pilcrow-bg-video--themed");
    if (!video) return;
    const isDark = document.documentElement.getAttribute("saved-theme") === "dark";
    const src = isDark ? video.dataset.darkSrc : video.dataset.lightSrc;
    if (!src || video.getAttribute("src") === src) return;
    video.setAttribute("src", src);
    video.load();
    void video.play();
  }
  var controls = null;
  var licenseCluster = null;
  function createControls() {
    controls = document.createElement("div");
    controls.className = "site-controls";
    const themeBtn = document.createElement("button");
    themeBtn.type = "button";
    themeBtn.className = "site-theme-toggle";
    themeBtn.setAttribute("aria-label", "Toggle dark mode");
    themeBtn.addEventListener("click", () => {
      const newTheme = document.documentElement.getAttribute("saved-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("saved-theme", newTheme);
      localStorage.setItem("theme", newTheme);
      document.dispatchEvent(new CustomEvent("themechange", { detail: { theme: newTheme } }));
    });
    themeBtn.innerHTML = `<svg class="icon-sun" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M11.9982 3.29083V1.76758M5.83985 18.1586L4.76275 19.2357M11.9982 22.2327V20.7094M19.2334 4.76468L18.1562 5.84179M20.707 12.0001H22.2303M18.1562 18.1586L19.2334 19.2357M1.76562 12.0001H3.28888M4.76267 4.76462L5.83977 5.84173M15.7104 8.28781C17.7606 10.3381 17.7606 13.6622 15.7104 15.7124C13.6601 17.7627 10.336 17.7627 8.28574 15.7124C6.23548 13.6622 6.23548 10.3381 8.28574 8.28781C10.336 6.23756 13.6601 6.23756 15.7104 8.28781Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg><svg class="icon-moon" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M21.2481 11.8112C20.1889 12.56 18.8958 13 17.5 13C13.9101 13 11 10.0899 11 6.5C11 5.10416 11.44 3.81108 12.1888 2.75189C12.126 2.75063 12.0631 2.75 12 2.75C6.89137 2.75 2.75 6.89137 2.75 12C2.75 17.1086 6.89137 21.25 12 21.25C17.1086 21.25 21.25 17.1086 21.25 12C21.25 11.9369 21.2494 11.874 21.2481 11.8112Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    controls.append(themeBtn);
    licenseCluster = document.createElement("div");
    licenseCluster.className = "site-license-cluster";
    const licenseLink = document.createElement("a");
    licenseLink.className = "site-license";
    licenseLink.href = LICENSE_URL;
    licenseLink.target = "_blank";
    licenseLink.rel = "noopener noreferrer";
    licenseLink.textContent = LICENSE_LABEL;
    licenseLink.setAttribute("aria-label", "Creative Commons BY-NC-ND 4.0 license");
    licenseCluster.append(licenseLink);
    document.addEventListener("themechange", applyVideoTheme);
  }
  function syncSiteControls() {
    if (!controls) createControls();
    if (controls && !document.body.contains(controls)) document.body.appendChild(controls);
    if (licenseCluster && !document.body.contains(licenseCluster))
      document.body.appendChild(licenseCluster);
    applyVideoTheme();
  }
  syncSiteControls();
})();
