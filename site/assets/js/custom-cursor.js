// Custom cursor on desktop pointers.
(() => {
  var cursorWindow = window;
  var cursorId = "dot-heart-cursor";
  var cursorEnabledClass = "dot-heart-cursor-enabled";
  var hoverSelector = "button, [role='button'], a, .hover-heart";
  function supportsCustomCursor() {
    return window.matchMedia("(pointer: fine)").matches && window.matchMedia("(hover: hover)").matches;
  }
  function ensureCursorElement() {
    let root = document.getElementById(cursorId);
    if (root) return root;
    root = document.createElement("div");
    root.id = cursorId;
    root.className = "dot-heart-cursor";
    root.setAttribute("aria-hidden", "true");
    document.body.appendChild(root);
    return root;
  }
  function resolveHoverTarget(target) {
    if (!(target instanceof Element)) return null;
    return target.closest(hoverSelector);
  }
  function setHeartState(state, active) {
    if (state.active === active) return;
    state.active = active;
    state.root.classList.toggle("is-heart", active);
  }
  function updatePosition(state) {
    state.root.style.translate = `${state.x}px ${state.y}px`;
  }
  function initCustomCursor() {
    const root = document.documentElement;
    if (!supportsCustomCursor()) {
      root.classList.remove(cursorEnabledClass);
      return;
    }
    root.classList.add(cursorEnabledClass);
    const existingState = cursorWindow.__dotHeartCursorState;
    if (existingState) {
      if (!document.body.contains(existingState.root)) {
        document.body.appendChild(existingState.root);
      }
      if (!existingState.visible) {
        existingState.root.classList.remove("is-visible");
        setHeartState(existingState, false);
      }
      return;
    }
    const state = {
      root: ensureCursorElement(),
      x: -999,
      y: -999,
      rafId: null,
      active: false,
      initialized: false,
      visible: false
    };
    cursorWindow.__dotHeartCursorState = state;
    if (state.initialized) return;
    state.initialized = true;
    const handleMove = (clientX, clientY) => {
      state.x = clientX;
      state.y = clientY;
      if (!state.visible) {
        state.visible = true;
        state.root.classList.add("is-visible");
      }
      updatePosition(state);
    };
    const onPointer = (event) => {
      if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") {
        return;
      }
      let x = event.clientX;
      let y = event.clientY;
      const predicted = event.getPredictedEvents?.();
      if (predicted && predicted.length > 0) {
        const last = predicted[0];
        x = last.clientX;
        y = last.clientY;
      }
      handleMove(x, y);
    };
    const moveEvent = "onpointerrawupdate" in window ? "pointerrawupdate" : "pointermove";
    document.addEventListener(moveEvent, onPointer, { passive: true });
    document.addEventListener("mouseover", (event) => {
      const hoverTarget = resolveHoverTarget(event.target);
      if (!hoverTarget) return;
      const from = event.relatedTarget;
      if (from instanceof Node && hoverTarget.contains(from)) return;
      setHeartState(state, true);
    });
    document.addEventListener("mouseout", (event) => {
      const leftTarget = resolveHoverTarget(event.target);
      if (!leftTarget) return;
      const to = event.relatedTarget;
      if (to instanceof Node && leftTarget.contains(to)) return;
      setHeartState(state, Boolean(resolveHoverTarget(to)));
    });
    document.addEventListener("mouseout", (event) => {
      if (event.relatedTarget !== null) return;
      state.visible = false;
      state.root.classList.remove("is-visible");
      setHeartState(state, false);
    });
    document.addEventListener("click", () => {
      setHeartState(state, false);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        state.visible = false;
        state.root.classList.remove("is-visible");
        setHeartState(state, false);
      }
    });
    window.addEventListener("blur", () => {
      state.visible = false;
      state.root.classList.remove("is-visible");
      setHeartState(state, false);
    });
  }
  initCustomCursor();
})();
