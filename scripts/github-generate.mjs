import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';

const topic = process.env.TOPIC || 'Mistério sem explicação';
const requestedDuration = Math.max(15, Math.min(90, Number(process.env.DURATION || 45)));
const niche = process.env.NICHE || 'Mistérios';
const style = process.env.STYLE || 'Suspense';
const narration = process.env.NARRATION || 'Somente legenda';
const pexelsKey = process.env.PEXELS_API_KEY;
const openaiKey = process.env.OPENAI_API_KEY;
const scriptModel = process.env.OPENAI_SCRIPT_MODEL || 'gpt-5.6-luna';
const ttsModel = process.env.OPENAI_TTS_MODEL || 'tts-1';

if (!pexelsKey) {
  console.error('PEXELS_API_KEY não configurada nos Secrets do GitHub.');
  process.exit(1);
}

await fs.mkdir('output', { recursive: true });
await fs.mkdir('tmp-media', { recursive: true });
await fs.mkdir('tmp-audio', { recursive: true });

function fallbackScenes() {
  return [
    { title: 'Gancho', text: `Você teria coragem de descobrir o que aconteceu? ${topic}.`, query: topic },
    { title: 'Contexto', text: `Tudo começa com um detalhe aparentemente comum sobre ${topic}, mas algo não parece certo.`, query: `${topic} ${niche} cinematic` },
    { title: 'Escalada', text: 'Os sinais ficam cada vez mais estranhos e a situação muda completamente.', query: `${topic} suspense mystery cinematic` },
    { title: 'Revelação', text: 'Então surge o detalhe que muda a interpretação de toda a história.', query: `${topic} dramatic reveal cinematic` },
    { title: 'CTA', text: 'E você, o que faria nessa situação? Conta nos comentários.', query: `${topic} cinematic` },
  ];
}

function extractResponseText(data) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text;
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === 'string' && content.text.trim()) return content.text;
    }
  }
  return '';
}

async function generateAiScenes() {
  if (!openaiKey) {
    console.warn('OPENAI_API_KEY ausente: usando roteiro local de fallback.');
    return fallbackScenes();
  }

  const prompt = [
    'Crie um roteiro original em português do Brasil para vídeo vertical faceless.',
    `Tema: ${topic}`,
    `Nicho: ${niche}`,
    `Estilo: ${style}`,
    `Duração alvo: ${requestedDuration} segundos.`,
    'Produza exatamente 5 cenas: Gancho, Contexto, Escalada, Revelação e CTA.',
    'O texto de cada cena deve soar natural quando narrado, sem hashtags e sem instruções de câmera.',
    'Evite afirmações factuais inventadas. Se o tema exigir fatos, use linguagem cautelosa.',
    'Para cada cena, gere também uma query curta em inglês ou português adequada para busca de imagem em banco de mídia.',
    'Responda exclusivamente no JSON solicitado pelo schema.',
  ].join('\n');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: scriptModel,
      input: prompt,
      text: {
        format: {
          type: 'json_schema',
          name: 'faceless_video_script',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              scenes: {
                type: 'array',
                minItems: 5,
                maxItems: 5,
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    text: { type: 'string' },
                    query: { type: 'string' },
                  },
                  required: ['title', 'text', 'query'],
                  additionalProperties: false,
                },
              },
            },
            required: ['scenes'],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI roteiro ${response.status}: ${detail.slice(0, 400)}`);
  }

  const data = await response.json();
  const text = extractResponseText(data);
  if (!text) throw new Error('OpenAI retornou roteiro vazio.');
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed.scenes) || parsed.scenes.length !== 5) throw new Error('Roteiro fora do formato esperado.');
  return parsed.scenes.map((scene, index) => ({
    title: String(scene.title || `Cena ${index + 1}`).slice(0, 80),
    text: String(scene.text || '').trim().slice(0, 420),
    query: String(scene.query || topic).trim().slice(0, 180),
  }));
}

let scenes;
try {
  scenes = await generateAiScenes();
  console.log(openaiKey ? `Roteiro por IA gerado com ${scriptModel}.` : 'Roteiro fallback gerado.');
} catch (error) {
  console.warn('Falha ao gerar roteiro por IA; usando fallback.', error instanceof Error ? error.message : error);
  scenes = fallbackScenes();
}

async function searchImage(query, index) {
  const url = new URL('https://api.pexels.com/v1/search');
  url.searchParams.set('query', query);
  url.searchParams.set('orientation', 'portrait');
  url.searchParams.set('per_page', '1');
  url.searchParams.set('locale', 'pt-BR');
  const res = await fetch(url, { headers: { Authorization: pexelsKey } });
  if (!res.ok) throw new Error(`Pexels ${res.status}`);
  const data = await res.json();
  const photo = data.photos?.[0];
  if (!photo) return null;
  const imageUrl = photo.src?.portrait || photo.src?.large2x || photo.src?.large;
  if (!imageUrl) return null;
  const img = await fetch(imageUrl);
  if (!img.ok) return null;
  const buf = Buffer.from(await img.arrayBuffer());
  const file = `tmp-media/scene-${index}.jpg`;
  await fs.writeFile(file, buf);
  return file;
}

const media = [];
for (let i = 0; i < scenes.length; i++) {
  try {
    media.push(await searchImage(scenes[i].query, i));
  } catch (error) {
    console.warn(`Cena ${i + 1}: mídia indisponível, usando fundo padrão.`, error instanceof Error ? error.message : error);
    media.push(null);
  }
}

function shouldNarrate() {
  return narration.toLowerCase() !== 'somente legenda' && Boolean(openaiKey);
}

function selectedVoice() {
  return narration.toLowerCase().includes('femin') ? 'nova' : 'onyx';
}

async function probeDuration(file) {
  return await new Promise((resolve, reject) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file]);
    let out = '';
    p.stdout.on('data', (chunk) => { out += chunk.toString(); });
    p.stderr.on('data', () => {});
    p.on('close', (code) => {
      const value = Number.parseFloat(out.trim());
      if (code === 0 && Number.isFinite(value) && value > 0) resolve(value);
      else reject(new Error(`ffprobe ${code}`));
    });
    p.on('error', reject);
  });
}

async function synthesizeScene(scene, index) {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ttsModel,
      voice: selectedVoice(),
      input: scene.text,
      response_format: 'mp3',
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI TTS ${response.status}: ${detail.slice(0, 300)}`);
  }
  const file = `tmp-audio/scene-${index}.mp3`;
  await fs.writeFile(file, Buffer.from(await response.arrayBuffer()));
  return { file, seconds: await probeDuration(file) };
}

const audio = [];
if (shouldNarrate()) {
  for (let i = 0; i < scenes.length; i++) {
    try {
      audio.push(await synthesizeScene(scenes[i], i));
    } catch (error) {
      console.warn('Falha na narração; vídeo seguirá sem voz.', error instanceof Error ? error.message : error);
      audio.length = 0;
      break;
    }
  }
} else if (narration.toLowerCase() !== 'somente legenda' && !openaiKey) {
  console.warn('Narração solicitada, mas OPENAI_API_KEY não foi configurada.');
}

if (audio.length === scenes.length) {
  scenes = scenes.map((scene, i) => ({ ...scene, seconds: Math.max(2.5, audio[i].seconds + 0.12) }));
  console.log(`Narração ativa: ${narration} / voz ${selectedVoice()} / ${ttsModel}.`);
} else {
  const weights = [0.12, 0.22, 0.27, 0.27, 0.12];
  scenes = scenes.map((scene, i) => ({ ...scene, seconds: Math.max(3, requestedDuration * weights[i]) }));
}

const total = scenes.reduce((sum, scene) => sum + scene.seconds, 0);
const args = ['-hide_banner', '-loglevel', 'error'];

for (let i = 0; i < scenes.length; i++) {
  const seconds = scenes[i].seconds.toFixed(3);
  if (media[i]) args.push('-loop', '1', '-t', seconds, '-i', media[i]);
  else args.push('-f', 'lavfi', '-t', seconds, '-i', 'color=c=#101014:s=1080x1920:r=30');
}

const audioInputStart = scenes.length;
if (audio.length === scenes.length) {
  for (const item of audio) args.push('-i', item.file);
}

function ffmpegText(value) {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(':', '\\:')
    .replaceAll("'", "\\'")
    .replaceAll('%', '\\%')
    .replaceAll('\n', ' ')
    .slice(0, 240);
}

const filters = [];
const videoLabels = [];
for (let i = 0; i < scenes.length; i++) {
  const text = ffmpegText(scenes[i].text);
  const frames = Math.max(1, Math.round(scenes[i].seconds * 30));
  const caption = `drawtext=text='${text}':fontcolor=white:fontsize=50:x=(w-text_w)/2:y=h*0.72-text_h/2:box=1:boxcolor=black@0.58:boxborderw=24`;
  if (media[i]) {
    filters.push(`[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,zoompan=z='min(zoom+0.0008,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=30,${caption},trim=duration=${scenes[i].seconds.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
  } else {
    filters.push(`[${i}:v]scale=1080:1920,setsar=1,${caption},trim=duration=${scenes[i].seconds.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
  }
  videoLabels.push(`[v${i}]`);
}
filters.push(`${videoLabels.join('')}concat=n=${scenes.length}:v=1:a=0,format=yuv420p[outv]`);

if (audio.length === scenes.length) {
  const audioLabels = [];
  for (let i = 0; i < scenes.length; i++) {
    const input = audioInputStart + i;
    filters.push(`[${input}:a]apad=pad_dur=0.12,atrim=duration=${scenes[i].seconds.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`);
    audioLabels.push(`[a${i}]`);
  }
  filters.push(`${audioLabels.join('')}concat=n=${scenes.length}:v=0:a=1[outa]`);
}

args.push('-filter_complex', filters.join(';'), '-map', '[outv]');
if (audio.length === scenes.length) args.push('-map', '[outa]', '-c:a', 'aac', '-b:a', '160k');
args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-movflags', '+faststart', '-t', total.toFixed(3), '-y', 'output/ghost-content.mp4');

await new Promise((resolve, reject) => {
  const p = spawn('ffmpeg', args, { stdio: 'inherit' });
  p.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`)));
  p.on('error', reject);
});

await fs.writeFile('output/metadata.json', JSON.stringify({
  topic,
  niche,
  style,
  narration: audio.length === scenes.length ? narration : 'Somente legenda',
  requestedDuration,
  renderedDuration: Number(total.toFixed(2)),
  aiScript: Boolean(openaiKey),
  scenes: scenes.map((scene) => ({ title: scene.title, text: scene.text, query: scene.query, seconds: Number(scene.seconds.toFixed(2)) })),
}, null, 2));

console.log(`Gerado: output/ghost-content.mp4 (${total.toFixed(1)}s)`);
