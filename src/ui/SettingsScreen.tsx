import { useEffect, useMemo, useState } from 'react';
import * as bsky from '../lib/bsky';
import * as lichess from '../lib/lichess';
import { ApiError, errorText, ponte } from '../lib/api';
import { findInterest } from '../lib/interests';
import { resetLearning, weights } from '../lib/learn';
import { refreshNews, useNews, type NewsItem } from '../lib/news';
import { setPrefs, usePrefs, type Theme } from '../lib/prefs';
import { allSources, type Source } from '../lib/sources';
import { promptInstall, useInstall } from '../lib/install';
import { APP_VERSION } from '../config';
import { BskyLoginSheet } from './BlueskyScreen';
import { InterestPicker } from './Interests';
import { TopBar, Sheet, Switch, toast } from './common';
import { Icon } from './icons';

function bytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0).replace('.', ',')} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1).replace('.', ',')} GB`;
}

function hashId(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

async function eraseEverything(): Promise<void> {
  bsky.logout();
  await lichess.logout().catch(() => undefined);
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('mural:')) localStorage.removeItem(k);
  } catch {
    /* sem armazenamento */
  }
  await new Promise<void>((resolve) => {
    try {
      const req = indexedDB.deleteDatabase('mural');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
  location.reload();
}

export function SettingsScreen() {
  const p = usePrefs();
  const news = useNews();
  const sess = bsky.session.use();
  const me = lichess.auth.use();
  const w = weights.use();
  const { can, installed } = useInstall();
  const [bskyLogin, setBskyLogin] = useState(false);
  const [erase, setErase] = useState(false);
  const [rss, setRss] = useState('');
  const [rssBusy, setRssBusy] = useState(false);
  const [usage, setUsage] = useState<string | null>(null);

  useEffect(() => {
    navigator.storage
      ?.estimate?.()
      .then((e) => setUsage(bytes(e.usage ?? 0)))
      .catch(() => undefined);
  }, []);

  const learned = useMemo(() => {
    const rows = Object.entries(w)
      .filter(([k, v]) => Math.abs(v - 1) >= 0.05 && (k.startsWith('i:') || k.startsWith('s:')))
      .map(([k, v]) => {
        const id = k.slice(2);
        const label = k.startsWith('i:') ? (findInterest(id, p.custom)?.label ?? id) : id;
        return { k, v, label, kind: k.startsWith('i:') ? 'Assunto' : 'Site' };
      })
      .sort((a, b) => b.v - a.v);
    return rows.length > 10 ? [...rows.slice(0, 7), ...rows.slice(-3)] : rows;
  }, [w, p.custom]);

  const addRss = async () => {
    let url = rss.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    let host = '';
    try {
      host = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      toast('Esse endereço não parece de um site.');
      return;
    }
    if (allSources(p.extraSources).some((s) => s.url === url)) {
      toast('Esse site já está na lista.');
      return;
    }
    setRssBusy(true);
    try {
      const r = await ponte<{ items: NewsItem[] }>('news', { src: 'rss', url });
      if (!r.items?.length) throw new ApiError('rss-vazio', 'Não achei notícias nesse endereço. Tente o link do RSS do site (geralmente termina em /feed ou /rss).');
      const name = (r.items[0]?.source || host).slice(0, 40);
      const src: Source = { id: 'x-' + hashId(url), name, url };
      setPrefs({ extraSources: [...p.extraSources, src], sources: [...p.sources.filter((x) => x !== src.id), src.id] });
      setRss('');
      toast(`${name} entrou nas suas notícias.`);
      void refreshNews(false);
    } catch (e) {
      toast(errorText(e), 4500);
    } finally {
      setRssBusy(false);
    }
  };

  const removeSource = (id: string) => setPrefs({ extraSources: p.extraSources.filter((s) => s.id !== id), sources: p.sources.filter((x) => x !== id) });

  return (
    <>
      <TopBar title="Ajustes" />
      <div className="page" style={{ paddingTop: 16 }}>
        <section className="set-group">
          <h2>Assuntos das notícias</h2>
          <InterestPicker selected={p.interests} custom={p.custom} onChange={(interests, custom) => setPrefs({ interests, custom })} />
        </section>

        <section className="set-group">
          <h2>Sites de notícias</h2>
          <div className="card" style={{ paddingTop: 2, paddingBottom: 2 }}>
            <div className="set-row">
              <div className="set-text">
                <b>Google Notícias</b>
                <span>{news.state?.status['gn-top'] === 'erro' ? 'Não respondeu na última busca' : 'Destaques e os seus assuntos'}</span>
              </div>
              <div className="set-value">
                <span className={'status-dot ' + (news.state?.status['gn-top'] ?? '')} />
              </div>
            </div>
            {allSources(p.extraSources).map((s) => {
              const on = p.sources.includes(s.id);
              const st = news.state?.status['f:' + s.id];
              const extra = p.extraSources.some((x) => x.id === s.id);
              return (
                <div className="set-row" key={s.id}>
                  <div className="set-text">
                    <b>{s.name}</b>
                    <span>{!on ? 'Desligado' : st === 'ok' ? 'Funcionando' : st === 'erro' ? 'Não respondeu na última busca' : 'Ligado'}</span>
                  </div>
                  <div className="set-value">
                    {on && st && <span className={'status-dot ' + st} />}
                    {extra && (
                      <button className="icon-btn" aria-label={`Remover ${s.name}`} onClick={() => removeSource(s.id)}>
                        <Icon name="trash" />
                      </button>
                    )}
                    <Switch
                      checked={on}
                      label={s.name}
                      onChange={(v) => setPrefs({ sources: v ? [...p.sources.filter((x) => x !== s.id), s.id] : p.sources.filter((x) => x !== s.id) })}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <form
            className="add-row"
            style={{ marginTop: 12 }}
            onSubmit={(e) => {
              e.preventDefault();
              void addRss();
            }}
          >
            <input
              className="input"
              value={rss}
              onChange={(e) => setRss(e.target.value)}
              placeholder="Endereço do RSS de outro site"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              aria-label="Endereço do RSS"
            />
            <button className="btn ghost" type="submit" disabled={rssBusy || !rss.trim()}>
              {rssBusy ? 'Testando…' : 'Adicionar'}
            </button>
          </form>
        </section>

        <section className="set-group">
          <h2>Contas</h2>
          <div className="card" style={{ paddingTop: 2, paddingBottom: 2 }}>
            <div className="set-row">
              <div className="set-text">
                <b>Bluesky</b>
                <span>{sess ? `@${sess.handle}` : 'Sem conta: mostra o Descobrir'}</span>
              </div>
              {sess ? (
                <button
                  className="btn ghost"
                  onClick={() => {
                    bsky.logout();
                    toast('Você saiu do Bluesky neste celular.');
                  }}
                >
                  Sair
                </button>
              ) : (
                <button className="btn ghost" onClick={() => setBskyLogin(true)}>
                  Entrar
                </button>
              )}
            </div>
            <div className="set-row">
              <div className="set-text">
                <b>Lichess</b>
                <span>{me ? me.username : 'Sem conta: só o problema do dia'}</span>
              </div>
              {me ? (
                <button
                  className="btn ghost"
                  onClick={() => {
                    void lichess.logout();
                    toast('Você saiu do Lichess neste celular.');
                  }}
                >
                  Sair
                </button>
              ) : (
                <button className="btn ghost" onClick={() => void lichess.startLogin().catch((e) => toast(errorText(e)))}>
                  Entrar
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="set-group">
          <h2>Aparência</h2>
          <div className="field">
            <label>Tema</label>
            <div className="seg">
              {(
                [
                  ['escuro', 'Escuro'],
                  ['claro', 'Claro'],
                  ['sistema', 'Do celular'],
                ] as [Theme, string][]
              ).map(([t, l]) => (
                <button key={t} aria-pressed={p.theme === t} onClick={() => setPrefs({ theme: t })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Tamanho do texto</label>
            <div className="seg">
              {(
                [
                  [1, 'Normal'],
                  [1.12, 'Grande'],
                  [1.25, 'Maior'],
                ] as const
              ).map(([v, l]) => (
                <button key={v} aria-pressed={Math.abs(p.textScale - v) < 0.01} onClick={() => setPrefs({ textScale: v })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="card" style={{ paddingTop: 2, paddingBottom: 2 }}>
            <div className="set-row">
              <div className="set-text">
                <b>Animação de abertura</b>
                <span>Aparece quando o Mural abre</span>
              </div>
              <Switch checked={p.splash} onChange={(v) => setPrefs({ splash: v })} label="Animação de abertura" />
            </div>
          </div>
        </section>

        <section className="set-group">
          <h2>O que o Mural aprendeu</h2>
          <div className="card">
            {learned.length === 0 ? (
              <p className="muted small" style={{ margin: 0 }}>
                Ainda nada. Conforme você abre e lê notícias, os assuntos e sites que você mais lê sobem. Também dá pra pedir menos de um assunto dentro da notícia.
              </p>
            ) : (
              learned.map((r) => (
                <div className="weight-row" key={r.k}>
                  <span>
                    {r.label} <span className="muted small">· {r.kind}</span>
                  </span>
                  <div className="bar" aria-label={r.v > 1 ? 'mais' : 'menos'}>
                    <i style={{ width: `${Math.round(((r.v - 0.2) / 2.8) * 100)}%`, background: r.v < 1 ? 'var(--bad)' : undefined }} />
                  </div>
                </div>
              ))
            )}
            {learned.length > 0 && (
              <button
                className="btn ghost block"
                style={{ marginTop: 12 }}
                onClick={() => {
                  resetLearning();
                  toast('Pronto, o Mural esqueceu o que aprendeu.');
                }}
              >
                <Icon name="rotate" /> Começar do zero
              </button>
            )}
          </div>
        </section>

        <section className="set-group">
          <h2>Aplicativo</h2>
          <div className="card" style={{ paddingTop: 2, paddingBottom: 2 }}>
            <div className="set-row">
              <div className="set-text">
                <b>Tela inicial do celular</b>
                <span>{installed ? 'O Mural já está instalado' : can ? 'Abre como app, sem a barra do navegador' : 'No Chrome: menu de três pontos, Instalar app'}</span>
              </div>
              {!installed && can && (
                <button
                  className="btn primary"
                  onClick={() =>
                    void promptInstall().then((r) => {
                      if (r === 'aceito') toast('Pronto, o Mural está na sua tela inicial.');
                    })
                  }
                >
                  Instalar
                </button>
              )}
            </div>
            <div className="set-row">
              <div className="set-text">
                <b>Espaço usado</b>
                <span>Livros, capas e notícias guardadas neste celular</span>
              </div>
              <div className="set-value">{usage ?? '…'}</div>
            </div>
            <div className="set-row">
              <div className="set-text">
                <b>Apagar tudo deste celular</b>
                <span>Livros, gostos, contas conectadas e o que o app aprendeu</span>
              </div>
              <button className="btn ghost danger" onClick={() => setErase(true)}>
                Apagar
              </button>
            </div>
          </div>
          <p className="note" style={{ marginTop: 14 }}>
            Mural {APP_VERSION}. Notícias do Google Notícias e dos sites ligados acima, abertas pela ponte do próprio Mural. Bluesky pela API pública e pela sua conta. Xadrez pelo Lichess. Livros do Projeto Gutenberg. Nada do que você lê
            ou escolhe sai do celular. Código aberto sob a licença GPL-3.0.
          </p>
        </section>
      </div>

      {bskyLogin && <BskyLoginSheet onClose={() => setBskyLogin(false)} />}
      {erase && (
        <Sheet title="Apagar tudo deste celular?" onClose={() => setErase(false)}>
          <p className="muted" style={{ marginTop: 0 }}>
            Some a estante de livros, os seus gostos, o que o Mural aprendeu e as contas conectadas neste celular. Suas contas no Bluesky e no Lichess continuam existindo.
          </p>
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setErase(false)}>
              Cancelar
            </button>
            <button className="btn primary" onClick={() => void eraseEverything()}>
              Apagar tudo
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
