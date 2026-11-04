// Animated number counters ([data-roll-counter]); habit totals come from data/site-data.js.
(() => {
  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }
  var audioCtx = null;
  function getCtx() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        return null;
      }
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  }
  function unlock() {
    const c = getCtx();
    if (!c || c.state === "running") {
      unlockEvents.forEach((e) => document.removeEventListener(e, unlock));
      return;
    }
    c.resume().then(() => {
      try {
        const b = c.createBuffer(1, 1, c.sampleRate);
        const s = c.createBufferSource();
        s.buffer = b;
        s.connect(c.destination);
        s.start();
      } catch {
      }
      unlockEvents.forEach((e) => document.removeEventListener(e, unlock));
    }).catch(() => {
    });
  }
  var unlockEvents = ["pointerdown", "touchstart", "keydown", "click"];
  unlockEvents.forEach((e) => document.addEventListener(e, unlock));
  function splitFlapFlip(vol = 1) {
    try {
      const c = getCtx();
      if (!c || c.state !== "running") return;
      const t = c.currentTime;
      const attack = 5e-3;
      const clackLen = Math.ceil(c.sampleRate * 5e-3);
      const clackBuf = c.createBuffer(1, clackLen, c.sampleRate);
      const cd = clackBuf.getChannelData(0);
      cd[0] = 1;
      cd[1] = -0.85;
      cd[2] = 0.45;
      for (let i = 3; i < clackLen; i++) {
        cd[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / clackLen * 2.5);
      }
      const clackSrc = c.createBufferSource();
      clackSrc.buffer = clackBuf;
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2600 + Math.random() * 1e3;
      bp.Q.value = 2.8;
      const clackGain = c.createGain();
      clackGain.gain.setValueAtTime(0, t);
      clackGain.gain.linearRampToValueAtTime(0.24 * vol, t + attack);
      clackGain.gain.exponentialRampToValueAtTime(1e-3, t + 0.022);
      clackSrc.connect(bp);
      bp.connect(clackGain);
      clackGain.connect(c.destination);
      clackSrc.start(t);
      clackSrc.stop(t + 0.025);
      const thump = c.createOscillator();
      thump.type = "sine";
      thump.frequency.setValueAtTime(85 + Math.random() * 35, t);
      thump.frequency.exponentialRampToValueAtTime(38, t + 0.03);
      const thumpG = c.createGain();
      thumpG.gain.setValueAtTime(0, t);
      thumpG.gain.linearRampToValueAtTime(0.09 * vol, t + attack);
      thumpG.gain.exponentialRampToValueAtTime(1e-3, t + 0.035);
      thump.connect(thumpG);
      thumpG.connect(c.destination);
      thump.start(t);
      thump.stop(t + 0.035);
    } catch {
    }
  }
  function tickInterval(progress, slow, fast) {
    const t = 1 - Math.pow(1 - progress, 5);
    return fast + (slow - fast) * t;
  }
  function getHabitTotal(habitName) {
    const body = document.getElementById("quartz-body");
    if (!body) return null;
    const raw = body.dataset.habitWeeklySeries;
    if (!raw) return null;
    try {
      const series = JSON.parse(raw);
      const match = series.find((s) => s.habit === habitName);
      if (!match) return null;
      return match.weekly.reduce((sum, w) => sum + w.count, 0);
    } catch {
      return null;
    }
  }
  function animateCounter(el) {
    let endValue;
    if (el.dataset.habit) {
      const total = getHabitTotal(el.dataset.habit);
      if (total === null || total <= 0) return;
      endValue = total;
    } else if (el.dataset.baseDate && el.dataset.dailyRate) {
      const baseValue = parseFloat(el.dataset.baseValue ?? "0");
      const baseDate = /* @__PURE__ */ new Date(el.dataset.baseDate + "T00:00:00Z");
      const dailyRate = parseFloat(el.dataset.dailyRate);
      const daysSince = Math.max(0, Math.floor((Date.now() - baseDate.getTime()) / 864e5));
      endValue = Math.round(baseValue + daysSince * dailyRate);
    } else {
      endValue = parseInt(el.dataset.end ?? "100", 10);
      if (isNaN(endValue) || endValue <= 0) return;
    }
    const intEl = el.querySelector(".roll-counter-int");
    if (!intEl) return;
    const digits = Math.max(1, Math.floor(Math.log10(endValue)) + 1);
    const DURATION = digits * 1e3;
    const tickScale = 1 + Math.log2(digits) * 0.7;
    const tickSlow = Math.round(190 / tickScale);
    const tickFast = Math.round(22 / tickScale);
    let startTime = null;
    let lastTickAt = 0;
    let lastDisplayed = -1;
    function frame(now) {
      if (startTime === null) startTime = now;
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / DURATION, 1);
      const eased = easeOutCubic(progress);
      const current = Math.round(eased * endValue);
      if (current !== lastDisplayed) {
        intEl.textContent = current.toLocaleString();
        lastDisplayed = current;
        if (now - lastTickAt >= tickInterval(progress, tickSlow, tickFast)) {
          splitFlapFlip();
          lastTickAt = now;
        }
      }
      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        intEl.textContent = endValue.toLocaleString();
      }
    }
    requestAnimationFrame(frame);
  }
  function initRollCounters() {
    const counters = document.querySelectorAll("[data-roll-counter]");
    if (counters.length === 0) return;
    const seen = /* @__PURE__ */ new WeakSet();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const el = entry.target;
            if (!seen.has(el)) {
              seen.add(el);
              observer.unobserve(el);
              animateCounter(el);
            }
          }
        }
      },
      { threshold: 0.35 }
    );
    counters.forEach((el) => observer.observe(el));
  }
  initRollCounters();
})();
