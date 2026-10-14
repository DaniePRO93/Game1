import './account.css';
import { Account, claimUsername, getAccount, onAuthChange, sendMagicLink, signOut } from './backend';

/**
 * Shared account UI for the landing page and the game: a small "sign in /
 * username" chip plus a notebook-style dialog for the magic link and for
 * picking a username.
 */
let account: Account = { session: null, username: null };
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

async function refresh(): Promise<void> {
  try {
    account = await getAccount();
  } catch {
    account = { session: null, username: null };
  }
  for (const cb of listeners) cb(account);
  // Just came back from the magic link without a username: ask for one.
  if (account.session && !account.username) openDialog('username');
}

let started = false;
export function initAccount(): void {
  if (started) return;
  started = true;
  onAuthChange(() => void refresh());
  void refresh();
}

/** Make sure the player is signed in with a username, then run `then`. */
export function requireAccount(then: () => void, reason: string): void {
  if (account.session && account.username) {
    then();
    return;
  }
  afterReady = then;
  openDialog(account.session ? 'username' : 'email', reason);
}

/** Render a sign-in chip into `host`. */
export function mountAccountChip(host: HTMLElement): void {
  host.classList.add('acct-chip');
  onAccount((a) => {
    host.innerHTML = '';
    if (a.session && a.username) {
      const name = document.createElement('span');
      name.className = 'acct-name';
      name.textContent = `✎ ${a.username}`;
      const out = document.createElement('button');
      out.className = 'acct-link';
      out.textContent = 'sign out';
      out.onclick = () => void signOut();
      host.append(name, out);
    } else {
      const b = document.createElement('button');
      b.className = 'acct-btn';
      b.textContent = a.session ? 'pick a username' : 'sign in';
      b.onclick = () => openDialog(a.session ? 'username' : 'email', 'to post scores and publish monsters');
      host.append(b);
    }
  });
}

function openDialog(step: 'email' | 'username', reason = ''): void {
  closeDialog();
  dialog = document.createElement('div');
  dialog.className = 'acct-overlay';
  dialog.innerHTML = `
    <div class="acct-sheet" role="dialog" aria-modal="true" aria-labelledby="acct-title">
      <button class="acct-close" aria-label="close">×</button>
      <h3 id="acct-title"></h3>
      <p class="acct-reason"></p>
      <form class="acct-form">
        <input class="acct-input" required />
        <button class="acct-submit" type="submit"></button>
      </form>
      <p class="acct-msg" role="status"></p>
      <p class="acct-fine"></p>
    </div>`;
  document.body.append(dialog);
  const $ = <T extends HTMLElement>(s: string) => dialog!.querySelector(s) as T;
  const input = $<HTMLInputElement>('.acct-input');
  const msg = $<HTMLElement>('.acct-msg');
  const submit = $<HTMLButtonElement>('.acct-submit');
  $<HTMLButtonElement>('.acct-close').onclick = closeDialog;
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeDialog();
  });
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDialog();
  });

  if (step === 'email') {
    $('#acct-title').textContent = 'sign in';
    $('.acct-reason').textContent = reason ? `sign in ${reason}` : '';
    input.type = 'email';
    input.placeholder = 'you@example.com';
    input.autocomplete = 'email';
    submit.textContent = 'email me a link';
    $('.acct-fine').textContent = 'No password. We email you a one-time link. You can always play without an account.';
    $<HTMLFormElement>('.acct-form').onsubmit = async (e) => {
      e.preventDefault();
      submit.disabled = true;
      msg.textContent = 'sending…';
      try {
        await sendMagicLink(input.value.trim());
        msg.innerHTML = '';
        const strong = document.createElement('b');
        strong.textContent = `check ${input.value.trim()}`;
        msg.append(strong, document.createTextNode(' and click the link. It brings you right back here.'));
        input.disabled = true;
      } catch (err) {
        msg.textContent = (err as Error).message;
        submit.disabled = false;
      }
    };
  } else {
    $('#acct-title').textContent = 'pick a username';
    $('.acct-reason').textContent = 'this is how you show up on the leaderboard and the monster gallery';
    input.type = 'text';
    input.placeholder = 'doodle_master';
    input.maxLength = 16;
    input.pattern = '[A-Za-z0-9_]{3,16}';
    input.autocomplete = 'username';
    submit.textContent = 'save';
    $('.acct-fine').textContent = '3–16 letters, numbers or _';
    $<HTMLFormElement>('.acct-form').onsubmit = async (e) => {
      e.preventDefault();
      submit.disabled = true;
      msg.textContent = 'saving…';
      try {
        const name = await claimUsername(input.value.trim());
        account = { ...account, username: name };
        for (const cb of listeners) cb(account);
        closeDialog();
        const next = afterReady;
        afterReady = null;
        next?.();
      } catch (err) {
        msg.textContent = (err as Error).message;
        submit.disabled = false;
      }
    };
  }
  setTimeout(() => input.focus(), 30);
}

function closeDialog(): void {
  dialog?.remove();
  dialog = null;
}
