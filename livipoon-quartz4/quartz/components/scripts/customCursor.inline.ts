type DotHeartCursorState = {
  root: HTMLDivElement
  x: number
  y: number
  rafId: number | null
  active: boolean
  initialized: boolean
  visible: boolean
}

type DotHeartCursorWindow = Window &
  typeof globalThis & {
    __dotHeartCursorState?: DotHeartCursorState
  }

const cursorWindow = window as DotHeartCursorWindow
const cursorId = "dot-heart-cursor"
const cursorEnabledClass = "dot-heart-cursor-enabled"
const hoverSelector = "button, [role='button'], a, .hover-heart"

function supportsCustomCursor(): boolean {
  return window.matchMedia("(pointer: fine)").matches && window.matchMedia("(hover: hover)").matches
}

function ensureCursorElement(): HTMLDivElement {
  let root = document.getElementById(cursorId) as HTMLDivElement | null
  if (root) return root

  root = document.createElement("div")
  root.id = cursorId
  root.className = "dot-heart-cursor"
  root.setAttribute("aria-hidden", "true")
  document.body.appendChild(root)
  return root
}

function resolveHoverTarget(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null
  return target.closest(hoverSelector)
}

function setHeartState(state: DotHeartCursorState, active: boolean) {
  if (state.active === active) return
  state.active = active
  state.root.classList.toggle("is-heart", active)
}

function schedulePositionUpdate(state: DotHeartCursorState) {
  if (state.rafId !== null) return

  state.rafId = window.requestAnimationFrame(() => {
    state.root.style.left = `${state.x}px`
    state.root.style.top = `${state.y}px`
    state.rafId = null
  })
}

function initCustomCursor() {
  const root = document.documentElement
  if (!supportsCustomCursor()) {
    root.classList.remove(cursorEnabledClass)
    return
  }

  root.classList.add(cursorEnabledClass)

  const existingState = cursorWindow.__dotHeartCursorState
  if (existingState) {
    if (!document.body.contains(existingState.root)) {
      document.body.appendChild(existingState.root)
    }
    if (!existingState.visible) {
      existingState.root.classList.remove("is-visible")
      setHeartState(existingState, false)
    }
    return
  }

  const state: DotHeartCursorState = {
    root: ensureCursorElement(),
    x: -999,
    y: -999,
    rafId: null,
    active: false,
    initialized: false,
    visible: false,
  }
  cursorWindow.__dotHeartCursorState = state

  if (state.initialized) return
  state.initialized = true

  const handleMove = (clientX: number, clientY: number) => {
    state.x = clientX
    state.y = clientY
    if (!state.visible) {
      state.visible = true
      state.root.classList.add("is-visible")
    }
    schedulePositionUpdate(state)
  }

  document.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") {
        return
      }

      handleMove(event.clientX, event.clientY)
    },
    { passive: true },
  )

  document.addEventListener("mouseover", (event) => {
    const hoverTarget = resolveHoverTarget(event.target)
    if (!hoverTarget) return

    const from = event.relatedTarget
    if (from instanceof Node && hoverTarget.contains(from)) return
    setHeartState(state, true)
  })

  document.addEventListener("mouseout", (event) => {
    const leftTarget = resolveHoverTarget(event.target)
    if (!leftTarget) return

    const to = event.relatedTarget
    if (to instanceof Node && leftTarget.contains(to)) return

    setHeartState(state, Boolean(resolveHoverTarget(to)))
  })

  document.addEventListener("mouseout", (event) => {
    if (event.relatedTarget !== null) return
    state.visible = false
    state.root.classList.remove("is-visible")
    setHeartState(state, false)
  })

  document.addEventListener("click", () => {
    setHeartState(state, false)
  })

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      state.visible = false
      state.root.classList.remove("is-visible")
      setHeartState(state, false)
    }
  })

  window.addEventListener("blur", () => {
    state.visible = false
    state.root.classList.remove("is-visible")
    setHeartState(state, false)
  })
}

document.addEventListener("nav", initCustomCursor)
initCustomCursor()
