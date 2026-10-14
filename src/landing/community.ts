import { PAD_H, PAD_W, paintStrokes, type DrawPad } from '../draw/drawPad';
import { decodeShare, encodeShare } from '../game/share';
import { initAccount, mountAccountChip, requireAccount } from '../net/accountUi';
import { getLeaderboard, getStats, publishMonster, recentMonsters, reportMonster, type MonsterRow } from '../net/backend';

const THUMB_W = 150;
const THUMB_H = (THUMB_W * PAD_H) / PAD_W;

export function initCommunity(pad: DrawPad | null): void {
  initAccount();
  const chip = document.getElementById('acct');
  if (chip) mountAccountChip(chip);
  if (pad) wirePublish(pad);
  void loadGallery();
  void loadBoard();
}

function wirePublish(pad: DrawPad): void {
  const btn = document.getElementById('pad-publish');
  const msg = document.getElementById('pad-publish-msg')!;
  if (!btn) return;
  btn.onclick = () => {
    if (pad.isEmpty('enemy')) {
      msg.textContent = 'draw something first!';
      return;
    }
    requireAccount(async () => {
      msg.textContent = 'publishing…';
      try {
        const token = await encodeShare({ enemy: pad.getStrokes('enemy'), boss: [] });
        const name = (document.getElementById('pad-name') as HTMLInputElement).value;
        await publishMonster('enemy', token, name);
        msg.textContent = '✓ published! it is in the gallery below';
        void loadGallery();
      } catch (err) {
        msg.textContent = `couldn't publish: ${(err as Error).message}`;
      }
    }, 'to publish your monster');
  };
}

async function loadGallery(): Promise<void> {
  const grid = document.getElementById('monster-grid');
  if (!grid) return;
  let rows: MonsterRow[];
  try {
    rows = await recentMonsters(12);
  } catch {
    grid.innerHTML = '<p class="empty">the gallery is taking a nap. try again in a bit.</p>';
    return;
  }
  if (!rows.length) {
    grid.innerHTML = '<p class="empty">no monsters yet. draw one above and hit <b>publish to gallery</b> to be the first!</p>';
    return;
  }
  grid.innerHTML = '';
  for (const r of rows) grid.append(await monsterCard(r));
}

async function monsterCard(r: MonsterRow): Promise<HTMLElement> {
  const card = document.createElement('figure');
  card.className = 'monster-card';
  const canvas = document.createElement('canvas');
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.round(THUMB_W * dpr);
  canvas.height = Math.round(THUMB_H * dpr);
  canvas.style.width = `${THUMB_W}px`;
  canvas.style.height = `${THUMB_H}px`;
  try {
    const p = await decodeShare(r.token);
    const strokes = r.kind === 'boss' ? p.boss : p.enemy;
    paintStrokes(canvas.getContext('2d')!, strokes, (THUMB_W * dpr) / PAD_W, r.kind === 'boss' ? '#7a1d2a' : '#23287e');
  } catch {
    /* unreadable drawing: leave the card blank */
  }
  const link = document.createElement('a');
  link.href = `/play/#d=${r.token}`;
  link.className = 'monster-link';
  link.title = 'fight this monster';
  link.append(canvas);

  const cap = document.createElement('figcaption');
  const name = document.createElement('span');
  name.className = 'm-name';
  name.textContent = r.name || (r.kind === 'boss' ? 'untitled boss' : 'untitled');
  const by = document.createElement('span');
  by.className = 'm-by';
  by.textContent = `by ${r.username}`;
  const actions = document.createElement('span');
  actions.className = 'm-actions';
  const fight = document.createElement('a');
  fight.href = link.href;
  fight.textContent = 'fight it →';
  const report = document.createElement('button');
  report.className = 'm-report';
  report.title = 'report this drawing';
  report.setAttribute('aria-label', 'report this drawing');
  report.textContent = '⚑';
  report.onclick = () =>
    requireAccount(async () => {
      try {
        await reportMonster(r.id);
        report.textContent = 'reported';
        report.disabled = true;
      } catch (err) {
        report.title = (err as Error).message;
      }
    }, 'to report drawings');
  actions.append(fight, report);
  cap.append(name, by, actions);
  if (r.kind === 'boss') card.classList.add('boss');
  card.append(link, cap);
  return card;
}

async function loadBoard(): Promise<void> {
  const list = document.getElementById('board-list');
  const stats = document.getElementById('stats-line');
  if (!list) return;
  try {
    const [rows, s] = await Promise.all([getLeaderboard(10), getStats()]);
    if (stats) stats.textContent = `${s.players} ${s.players === 1 ? 'player' : 'players'} · ${s.runs} runs · ${s.monsters} monsters drawn`;
    if (!rows.length) {
      list.innerHTML = '<li class="empty">no scores yet. the #1 spot is wide open.</li>';
      return;
    }
    list.innerHTML = '';
    rows.forEach((r, i) => {
      const li = document.createElement('li');
      if (i < 3) li.className = `top top${i + 1}`;
      const rank = document.createElement('span');
      rank.className = 'rank';
      rank.textContent = String(i + 1);
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = r.username;
      const score = document.createElement('span');
      score.className = 'score';
      score.textContent = r.score.toLocaleString();
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = `wave ${r.wave} · ×${r.best_combo}`;
      li.append(rank, who, score, meta);
      list.append(li);
    });
  } catch {
    list.innerHTML = '<li class="empty">scores are taking a nap. try again in a bit.</li>';
  }
}
