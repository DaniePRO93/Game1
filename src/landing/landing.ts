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

// Respect reduced motion: keep the poster frame instead of looping video.
const video = document.getElementById('hero-video') as HTMLVideoElement | null;
if (video && matchMedia('(prefers-reduced-motion: reduce)').matches) {
  video.removeAttribute('autoplay');
  video.pause();
  video.controls = true;
}

// Reveal-on-scroll. Elements already on screen are shown immediately; nothing
// is hidden unless the observer is running (html.reveal).
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    }
  },
  { threshold: 0.12 },
);
for (const el of Array.from(document.querySelectorAll('.note, .photo, .step-text, .challenge-card'))) {
  const r = el.getBoundingClientRect();
  if (r.top < innerHeight && r.bottom > 0) el.classList.add('in');
  io.observe(el);
}
document.documentElement.classList.add('reveal');
