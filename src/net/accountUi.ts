import './account.css';
import { Account, claimName, getAccount } from './backend';

/**
 * Shared name UI for the landing page and the game: a small "pick a name"
 * chip plus a notebook-style dialog. No email, no password: the name is tied
 * to this browser.
 */
let account: Account = getAccount();
const listeners = new Set<(a: Account) => void>();
let dialog: HTMLDivElement | null = null;
let afterReady: (() => void) | null = null;

export function currentAccount(): Account {
  return account;
}

export function onAccount(cb: (a: Account) => void): void {
  listeners.add(cb);
  cb(account);
}

function emit(): void {
  for (const cb of listeners) cb(account);
}

export function initAccount(): void {
  account = getAccount();
  emit();
}

/** Make sure the player has a name, then run `then`. */
export function requireAccount(then: () => void, reason: string): void {
  if (account.username) {
    then();
    return;
  }
  openDialog(reason);
  afterReady = then;
}

/** Render the name chip into `host`. */
export function mountAccountChip(host: HTMLElement): void {
  host.classList.add('acct-chip');
  onAccount((a) => {
    host.innerHTML = '';
    if (a.username) {
      const name = document.createElement('span');
      name.className = 'acct-name';
      name.textContent = `✎ ${a.username}`;
      const change = document.createElement('button');
      change.className = 'acct-link';
      change.textContent = 'change';
      change.onclick = () => openDialog();
      host.append(name, change);
    } else {
      const b = document.createElement('button');
      b.className = 'acct-btn';
      b.textContent = 'pick a name';
      b.onclick = () => openDialog('to post scores and publish monsters');
      host.append(b);
    }
  });
}

function openDialog(reason = ''): void {
  closeDialog();
  dialog = document.createElement('div');
  dialog.className = 'acct-overlay';
  dialog.innerHTML = `
    <div class="acct-sheet" role="dialog" aria-modal="true" aria-labelledby="acct-title">
      <button class="acct-close" aria-label="close">×</button>
      <h3 id="acct-title"></h3>
      <p class="acct-reason"></p>
      <form class="acct-form">
        <input class="acct-input" required type="text" maxlength="16" pattern="[A-Za-z0-9_]{3,16}"
          autocomplete="nickname" placeholder="doodle_master" spellcheck="false" />
        <button class="acct-submit" type="submit">save</button>
      </form>
      <p class="acct-msg" role="status"></p>
      <p class="acct-fine">3–16 letters, numbers or _. Your name stays on this browser, no sign-up.</p>
    </div>`;
  document.body.append(dialog);
  const $ = <T extends HTMLElement>(s: string) => dialog!.querySelector(s) as T;
  const input = $<HTMLInputElement>('.acct-input');
  const msg = $<HTMLElement>('.acct-msg');
  const submit = $<HTMLButtonElement>('.acct-submit');
  $('#acct-title').textContent = account.username ? 'change your name' : 'pick a name';
  $('.acct-reason').textContent = reason
    ? `pick a name ${reason}`
    : 'this is how you show up on the leaderboard and in the monster gallery';
  if (account.username) input.value = account.username;
  $<HTMLButtonElement>('.acct-close').onclick = closeDialog;
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeDialog();
  });
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDialog();
  });
  $<HTMLFormElement>('.acct-form').onsubmit = async (e) => {
    e.preventDefault();
    submit.disabled = true;
    msg.textContent = 'saving…';
    try {
      const name = await claimName(input.value.trim());
      account = { username: name };
      emit();
      const next = afterReady;
      closeDialog();
      next?.();
    } catch (err) {
      msg.textContent = (err as Error).message;
      submit.disabled = false;
    }
  };
  setTimeout(() => input.select(), 30);
}

function closeDialog(): void {
  afterReady = null;
  dialog?.remove();
  dialog = null;
}
