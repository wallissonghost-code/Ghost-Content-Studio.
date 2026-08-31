# Ghost Content Studio

MVP de um estúdio faceless para criação, organização e publicação de vídeos verticais para TikTok e, futuramente, Kwai.

## Objetivos do MVP

- Criar briefing de vídeo por nicho, tema, duração e estilo
- Gerar estrutura de roteiro localmente no painel
- Organizar cenas e textos de legenda
- Preparar pipeline de renderização 9:16 via FFmpeg
- Preparar integração OAuth + Content Posting API do TikTok
- Manter segredos fora do repositório

## Stack

- Next.js 15 / App Router
- TypeScript
- CSS puro
- API routes para integração futura
- FFmpeg planejado para o worker de renderização

## Desenvolvimento

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

## Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha quando o app do TikTok estiver aprovado.
