import { DrawPad } from '../draw/drawPad';

// The pad saves to the same localStorage key the game reads, so whatever you
// doodle here is the enemy when you hit "fight this doodle".
const host = document.getElementById('pad');
if (host) {
  const pad = new DrawPad(host);
  if (pad.isEmpty('enemy')) pad.example();
  document.getElementById('pad-undo')!.onclick = () => pad.undo();
  document.getElementById('pad-clear')!.onclick = () => pad.clear();
  document.getElementById('pad-example')!.onclick = () => pad.example();
}

// Reveal-on-scroll for notes and photos. Elements already on screen are shown
// immediately; nothing is hidden unless the observer is running.
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    }
  },
  { threshold: 0.15 },
);
const revealables = Array.from(document.querySelectorAll('.note, .photo'));
for (const el of revealables) {
  const r = el.getBoundingClientRect();
  if (r.top < innerHeight && r.bottom > 0) el.classList.add('in');
  io.observe(el);
}
document.documentElement.classList.add('reveal');
