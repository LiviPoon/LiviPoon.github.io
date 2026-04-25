;(function () {
  let ctx: AudioContext | null = null

  function getCtx(): AudioContext | null {
    if (!ctx) {
      try {
        ctx = new AudioContext()
      } catch {
        return null
      }
    }
    if (ctx.state === "suspended") void ctx.resume()
    return ctx
  }

  // Unlock AudioContext on first user gesture — pointerdown fires before click
  // so the context is running by the time the click handler plays a sound
  const unlock = () => {
    getCtx()
    document.removeEventListener("pointerdown", unlock)
    document.removeEventListener("keydown", unlock)
  }
  document.addEventListener("pointerdown", unlock, { once: true })
  document.addEventListener("keydown", unlock, { once: true })

  function tone(freq: number, dur: number, vol: number, type: OscillatorType) {
    const c = getCtx()
    if (!c || c.state !== "running") return
    try {
      const osc = c.createOscillator()
      const gain = c.createGain()
      const t = c.currentTime
      osc.type = type
      osc.frequency.setValueAtTime(freq, t)
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(vol, t + 0.005)
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
      osc.connect(gain)
      gain.connect(c.destination)
      osc.start(t)
      osc.stop(t + dur)
    } catch {
      // silently ignore if AudioContext is unavailable
    }
  }

  // Exact click sound from dialed.gg
  function playClick() {
    tone(640, 0.14, 0.05, "triangle")
    setTimeout(() => tone(960, 0.10, 0.08, "sine"), 30)
  }

  function isInteractive(el: Element | null): boolean {
    while (el && el !== document.body) {
      const tag = el.tagName
      if (tag === "BUTTON" || tag === "A" || (el as HTMLElement).getAttribute("role") === "button") {
        return true
      }
      el = el.parentElement
    }
    return false
  }

  function setup() {
    function onClick(e: MouseEvent) {
      if (isInteractive(e.target as Element)) playClick()
    }

    document.addEventListener("click", onClick)

    if (typeof window.addCleanup === "function") {
      window.addCleanup(() => document.removeEventListener("click", onClick))
    }
  }

  document.addEventListener("nav", setup)
  setup()
})()
