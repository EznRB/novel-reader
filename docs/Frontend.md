# Frontend

## Stack
- React 19
- Vite
- Tailwind v4
- shadcn/ui
- React‑Query (generated hooks)

## Estrutura de diretórios
src/
 ├─ pages/
 │   ├─ reader.tsx      // página principal de leitura
 │   ├─ import.tsx      // fluxo de importação de livro
 │   ├─ library.tsx     // lista de livros
 │   ├─ profile.tsx
 │   └─ …
 ├─ components/
 │   ├─ audio-player.tsx // gerencia reprodução de áudio
 │   └─ …
 └─ hooks/                // hooks customizados gerados por Orval

## Principais componentes
- **AudioPlayer** – gerencia `HTMLAudioElement`, fila, prefetch, retries.
- **ReaderPage** – carrega livro, capítulos, progresso; divide texto em sentenças, controla modo cinematográfico.
- **ImportPage** – aceita texto, .txt ou .epub; envia para `/api/books`.
- **LibraryPage** – pesquisa, filtros, favoritos.

## Atalhos de teclado
Space → play/pause, ←/→ → sentença, Shift+←/→ → capítulo, T → TOC, C → cinematic, A → autoplay, Esc → fechar painéis.
