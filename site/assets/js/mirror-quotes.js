// Shuffles the testimonial cards on /mirror/ across its chapters (each keeps its card count).
(() => {
  function shuffleInPlace(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
  const grids = Array.from(document.querySelectorAll("[data-mirror-quotes-layout]"));
  if (!grids.length) return;
  const sizes = grids.map((g) => g.children.length);
  const cards = grids.flatMap((g) => Array.from(g.children));
  if (cards.length < 2) return;
  shuffleInPlace(cards);
  let at = 0;
  grids.forEach((g, i) => {
    g.replaceChildren(...cards.slice(at, at + sizes[i]));
    at += sizes[i];
  });
})();
