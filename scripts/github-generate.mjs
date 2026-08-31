import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';

const topic = process.env.TOPIC || 'Mistério sem explicação';
const duration = Math.max(15, Math.min(90, Number(process.env.DURATION || 45)));
const pexelsKey = process.env.PEXELS_API_KEY;

if (!pexelsKey) {
  console.error('PEXELS_API_KEY não configurada nos Secrets do GitHub.');
  process.exit(1);
}

const scenes = [
  { title: 'Gancho', text: `Você teria coragem de descobrir o que aconteceu? ${topic}.`, seconds: 4, query: topic },
  { title: 'Contexto', text: 'Tudo começa com um detalhe aparentemente comum, mas algo não parece certo.', seconds: Math.max(7, Math.round(duration * .22)), query: `${topic} dark cinematic` },
  { title: 'Escalada', text: 'Os sinais ficam cada vez mais estranhos e o clima muda completamente.', seconds: Math.max(8, Math.round(duration * .28)), query: `${topic} mystery suspense` },
  { title: 'Revelação', text: 'Então surge o detalhe que muda a interpretação de toda a história.', seconds: Math.max(8, Math.round(duration * .25)), query: `${topic} dramatic reveal` },
  { title: 'CTA', text: 'Você continuaria investigando? Comenta o que faria.', seconds: 5, query: `${topic} cinematic night` },
];

const total = scenes.reduce((s, x) => s + x.seconds, 0);
await fs.mkdir('output', { recursive: true });
await fs.mkdir('tmp-media', { recursive: true });

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
  const img = await fetch(photo.src?.portrait || photo.src?.large2x || photo.src?.large);
  if (!img.ok) return null;
  const buf = Buffer.from(await img.arrayBuffer());
  const file = `tmp-media/scene-${index}.jpg`;
  await fs.writeFile(file, buf);
  return file;
}

const media = [];
for (let i = 0; i < scenes.length; i++) {
  try { media.push(await searchImage(scenes[i].query, i)); }
  catch { media.push(null); }
}

const args = ['-hide_banner','-loglevel','error'];
for (let i = 0; i < scenes.length; i++) {
  const s = scenes[i];
  if (media[i]) args.push('-loop','1','-t',String(s.seconds),'-i',media[i]);
  else args.push('-f','lavfi','-t',String(s.seconds),'-i','color=c=#101014:s=1080x1920:r=30');
}

const filters = [];
const labels = [];
for (let i = 0; i < scenes.length; i++) {
  const text = scenes[i].text.replaceAll('\\','\\\\').replaceAll(':','\\:').replaceAll("'","\\'").replaceAll('%','\\%').slice(0,180);
  if (media[i]) {
    filters.push(`[${i}:v]scale=1200:-1,crop=1080:1920,zoompan=z='min(zoom+0.0008,1.08)':d=${scenes[i].seconds*30}:s=1080x1920:fps=30,drawtext=text='${text}':fontcolor=white:fontsize=52:x=(w-text_w)/2:y=h*0.72-text_h/2:box=1:boxcolor=black@0.55:boxborderw=24[v${i}]`);
  } else {
    filters.push(`[${i}:v]scale=1080:1920,drawtext=text='${text}':fontcolor=white:fontsize=52:x=(w-text_w)/2:y=h*0.72-text_h/2:box=1:boxcolor=black@0.55:boxborderw=24[v${i}]`);
  }
  labels.push(`[v${i}]`);
}
filters.push(`${labels.join('')}concat=n=${scenes.length}:v=1:a=0,format=yuv420p[outv]`);

args.push('-filter_complex',filters.join(';'),'-map','[outv]','-c:v','libx264','-preset','veryfast','-crf','23','-movflags','+faststart','-t',String(total),'-y','output/ghost-content.mp4');

await new Promise((resolve,reject)=>{
  const p = spawn('ffmpeg',args,{stdio:'inherit'});
  p.on('close',code=>code===0?resolve():reject(new Error(`ffmpeg ${code}`)));
  p.on('error',reject);
});

console.log('Gerado: output/ghost-content.mp4');
