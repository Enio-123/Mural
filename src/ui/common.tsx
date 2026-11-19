import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { Icon } from './icons';
import { useNav } from '../lib/nav';

export function TopBar({ title, right, lined = true }: { title: ReactNode; right?: ReactNode; lined?: boolean }) {
  const nav = useNav();
  return (
    <header className={'topbar' + (lined ? ' lined' : '')}>
      <div className="page-inner">
        <button className="icon-btn" onClick={nav.back} aria-label="Voltar">
          <Icon name="back" />
        </button>
        <h1>{title}</h1>
        {right}
      </div>
    </header>
  );
}

export function Spinner({ label = 'Carregando' }: { label?: string }) {
  return (
    <div className="center" role="status" aria-live="polite">
      <div className="spinner" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ErrorBox({ message, onRetry, children }: { message: string; onRetry?: () => void; children?: ReactNode }) {
  return (
    <div className="error-box" role="alert">
      <span>{message}</span>
      <div className="btn-row">
        {onRetry && (
          <button className="btn ghost" onClick={onRetry}>
            <Icon name="refresh" /> Tentar de novo
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

export function Sheet({ title, onClose, children }: { title?: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        {title && <h2>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button className="switch" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />;
}

/* -------------------------------------------------------------- aviso */

let toastMsg: { id: number; text: string } | null = null;
const toastSubs = new Set<() => void>();
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(text: string, ms = 2600): void {
  toastMsg = { id: Date.now(), text };
  toastSubs.forEach((f) => f());
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMsg = null;
    toastSubs.forEach((f) => f());
  }, ms);
}

export function ToastHost() {
  const msg = useSyncExternalStore(
    (f) => {
      toastSubs.add(f);
      return () => toastSubs.delete(f);
    },
    () => toastMsg,
  );
  if (!msg) return null;
  return (
    <div className="toast" role="status" key={msg.id}>
      {msg.text}
    </div>
  );
}

/* ------------------------------------------------------- foto grande */

let lightbox: { src: string; alt?: string } | null = null;
const lbSubs = new Set<() => void>();

export function openImage(src: string, alt?: string): void {
  lightbox = { src, alt };
  lbSubs.forEach((f) => f());
}

export function LightboxHost() {
  const cur = useSyncExternalStore(
    (f) => {
      lbSubs.add(f);
      return () => lbSubs.delete(f);
    },
    () => lightbox,
  );
  if (!cur) return null;
  const close = () => {
    lightbox = null;
    lbSubs.forEach((f) => f());
  };
  return (
    <div className="lightbox" onClick={close} role="dialog" aria-label="Imagem">
      <img src={cur.src} alt={cur.alt ?? ''} />
      <button className="icon-btn" aria-label="Fechar" onClick={close}>
        <Icon name="close" />
      </button>
    </div>
  );
}

/* --------------------------------------------- carrega quando aparece */

export function useVisible<T extends Element>(rootMargin = '200px'): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    if (!('IntersectionObserver' in window)) {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible, rootMargin]);
  return [ref, visible];
}

export function Img({ src, alt = '', className }: { src?: string | null; alt?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return <img className={className} src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}
