// Shuffles the testimonial cards on /mirror/.
(() => {
  function shuffleInPlace(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
  const row = document.querySelector("article[data-mirror-quotes-layout] .pilcrow-testimonial-row");
  if (!row) return;
  const cards = Array.from(row.querySelectorAll("article.pilcrow-quote"));
  if (cards.length < 2) return;
  shuffleInPlace(cards);
  row.replaceChildren(...cards);
})();
