# Ghost Content Studio

MVP de um estúdio faceless para criação, organização e publicação de vídeos verticais para TikTok e, futuramente, Kwai.

## Uso direto pelo GitHub

Agora também dá para gerar o vídeo sem rodar o app localmente.

1. Abra `Settings > Secrets and variables > Actions` no repositório.
2. Crie um secret chamado `PEXELS_API_KEY` e cole sua chave do Pexels.
3. Abra a aba `Actions`.
4. Escolha o workflow **Gerar video faceless**.
5. Clique em **Run workflow**.
6. Informe o tema e a duração.
7. Quando finalizar, abra a execução e baixe o artifact `ghost-content-video`.

A chave fica protegida nos GitHub Secrets e não aparece no código nem nos logs.

## O que o workflow faz

- recebe tema e duração;
- busca imagens verticais automaticamente no Pexels;
- monta cenas;
- aplica texto e movimento;
- renderiza em 1080x1920 com FFmpeg;
- disponibiliza o MP4 como artifact do GitHub Actions.

## Painel web

O projeto também mantém o painel Next.js para evolução futura:

- briefing por nicho, tema, duração e estilo;
- cenas e legendas;
- narração opcional;
- mídia automática;
- integração TikTok preparada.

## Desenvolvimento local

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

## Segurança

Nunca coloque chaves reais em arquivos do repositório. Use `.env.local` localmente ou GitHub Secrets / variáveis do provedor de hospedagem.
