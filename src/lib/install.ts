import { useSyncExternalStore } from 'react';

/** Evento que o Chrome manda quando o site pode virar app instalado. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function standalone(): boolean {
  return (
    installed ||
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function listenInstall(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    emit();
  });
}

let snap = { can: false, installed: false };
function read() {
  const next = { can: !!deferred, installed: standalone() };
  if (next.can !== snap.can || next.installed !== snap.installed) snap = next;
  return snap;
}

export function useInstall(): { can: boolean; installed: boolean } {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    read,
    read,
  );
}

export async function promptInstall(): Promise<'aceito' | 'recusado' | 'indisponivel'> {
  const e = deferred;
  if (!e) return 'indisponivel';
  deferred = null;
  emit();
  await e.prompt();
  const choice = await e.userChoice;
  return choice.outcome === 'accepted' ? 'aceito' : 'recusado';
}
