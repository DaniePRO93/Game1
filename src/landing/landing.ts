import { DrawPad } from '../draw/drawPad';
import { placeDoodles } from '../ui/marginDoodles';

// The pad saves to the same localStorage key the game reads, so whatever you
// doodle here is the enemy when you hit "fight this doodle".
const host = document.getElementById('pad');
let pad: DrawPad | null = null;
if (host) {
  pad = new DrawPad(host);
  if (pad.isEmpty('enemy')) pad.example();
  document.getElementById('pad-undo')!.onclick = () => pad!.undo();
  document.getElementById('pad-clear')!.onclick = () => pad!.clear();
  const ex = document.getElementById('pad-example')!;
  ex.onclick = () => {
    pad!.example();
    ex.textContent = `example: ${pad!.exampleName}`;
  };
}

// Margin sketches, like a notebook someone doodled in during class.
// 'gutter' ones sit outside the content column (wide screens only).
const sec = (sel: string) => document.querySelector<HTMLElement>(sel);
const margins: [string, Parameters<typeof placeDoodles>[1]][] = [
  ['#draw', [
    { id: 'cat', pos: { top: '20px', left: '-165px' }, size: 150, rot: -7, cls: 'gutter', label: true },
    { id: 'cactus', pos: { top: '640px', right: '-165px' }, size: 150, rot: 6, cls: 'gutter', label: true },
  ]],
  ['#leaderboard', [{ id: 'wizard', pos: { top: '30px', left: '-165px' }, size: 150, rot: -5, cls: 'gutter', label: true }]],
  ['#features', [
    { id: 'octopus', pos: { top: '0px', left: '-165px' }, size: 150, rot: 6, cls: 'gutter', label: true },
    { id: 'alien', pos: { bottom: '40px', right: '-165px' }, size: 150, rot: -6, cls: 'gutter', label: true },
  ]],
  ['#how', [{ id: 'dino', pos: { top: '0px', right: '-165px' }, size: 150, rot: 4, cls: 'gutter', label: true }]],
  ['.final', [
    { id: 'ghost', pos: { top: '10px', left: '-165px' }, size: 150, rot: -6, cls: 'gutter', label: true },
    { id: 'robot', pos: { bottom: '0px', right: '-165px' }, size: 150, rot: 7, cls: 'gutter', label: true },
  ]],
];
for (const [sel, items] of margins) {
  const el = sec(sel);
  if (el) placeDoodles(el, items);
}

// Accounts, gallery and leaderboard load separately so the hero isn't delayed.
void import('./community').then((m) => m.initCommunity(pad));

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
