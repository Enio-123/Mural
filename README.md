# Mural

App de celular (PWA) com tudo numa tela só, do jeito do desenho do Enio:

- **Xadrez**: problema do dia do Lichess, jogar contra o computador do Lichess (níveis 1 a 8), partidas em andamento e as suas últimas partidas.
- **Livros**: estante no próprio celular, clássicos grátis em português do Projeto Gutenberg e leitor de ePub (abre também um ePub seu, sem DRM). Guarda a página onde você parou.
- **Notícias**: Google Notícias (destaques e os seus assuntos) mais os sites com RSS que você ligar. A matéria abre dentro do app, só o texto. O app aprende com o que você abre.
- **Bluesky**: Descobrir sem conta; com a sua conta (senha de app), o que as pessoas que você segue postam e os seus feeds fixados.
- Animação de abertura, tema escuro ou claro, instalar na tela inicial e funciona sem internet para o que já foi baixado.

Nada do que você lê ou escolhe sai do celular: gostos, livros, contas e o que o app aprendeu ficam guardados só no aparelho.

## Como funciona

- `src/`: o app (React + TypeScript + Vite).
- `api/ponte.ts`: a ponte, uma função da Vercel. Ela busca as notícias, abre as matérias para leitura, pega o catálogo e os livros do Gutenberg e repassa consultas públicas do Bluesky. Ela só aceita endereços públicos (bloqueia rede interna), tem limite de tamanho e de tempo, e não guarda nada.
- O Lichess e o Bluesky são chamados direto do celular. O login do Lichess é o oficial (OAuth com PKCE): a senha nunca passa pelo Mural.

## Colocar no ar (Vercel, grátis)

1. Crie uma conta em vercel.com entrando com o GitHub.
2. "Add New..." > "Project" > importe o repositório **Mural**.
3. Não precisa mudar nada: a Vercel lê o `vercel.json` (Vite, pasta `dist`, função `api/ponte.ts`). Clique em **Deploy**.
4. Abra o endereço que a Vercel der (algo como `mural-xxxx.vercel.app`) no Chrome do celular e toque em **Instalar** (ou menu de três pontos > Instalar app).

Cada envio novo para o GitHub atualiza o app sozinho.

## Desenvolver

```bash
npm install
npm run dev        # app + ponte em http://localhost:5173
npm test           # testes da ponte e do app
npm run build      # confere os tipos e gera a pasta dist
node tests/e2e/run.mjs   # telas num celular simulado, sem internet (precisa do Playwright)
```

## Fontes e licenças

- Notícias: Google Notícias e o RSS de cada site. O texto das matérias é buscado na hora, só para você ler, e não é guardado em servidor.
- Livros: Projeto Gutenberg (domínio público).
- Xadrez: Lichess. Tabuleiro: chessground (GPL-3.0).
- Bluesky: API pública do Bluesky e a sua conta.

Por usar o chessground, o Mural é distribuído sob a licença **GPL-3.0** (veja `LICENSE`).
