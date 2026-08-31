import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Narration = 'none' | 'male' | 'female';
type Scene = { title: string; text: string; seconds: number; imageUrl?: string };
type Payload = { topic?: string; scenes?: Scene[]; narration?: Narration };

function escapeForFfmpegText(value: string) {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(':', '\\:')
    .replaceAll("'", "\\'")
    .replaceAll('%', '\\%')
    .replaceAll('\n', ' ')
    .slice(0, 180);
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error('FFmpeg binary not available.'));
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.slice(-5000) || `FFmpeg exited with ${code}`));
    });
  });
}

async function synthesizeNarration(text: string, narration: Narration, outputPath: string) {
  if (narration === 'none') return false;

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = narration === 'female'
    ? process.env.ELEVENLABS_VOICE_ID_FEMALE
    : process.env.ELEVENLABS_VOICE_ID_MALE;

  if (!apiKey || !voiceId) return false;

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs TTS failed with status ${response.status}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outputPath, audio);
  return true;
}

function isSafeRemoteImageUrl(value?: string) {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return false;
    return true;
  } catch {
    return false;
  }
}

async function downloadImage(url: string, outputPath: string) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Image download failed with status ${response.status}`);

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) throw new Error('Scene URL did not return an image.');

  const length = Number(response.headers.get('content-length') || 0);
  if (length > 12 * 1024 * 1024) throw new Error('Scene image is too large.');

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > 12 * 1024 * 1024) throw new Error('Scene image is too large.');
  await fs.writeFile(outputPath, bytes);
}

export async function POST(request: NextRequest) {
  const workdir = path.join(os.tmpdir(), `ghost-render-${Date.now()}`);
  try {
    await fs.mkdir(workdir, { recursive: true });
    const body = (await request.json()) as Payload;
    const scenes = Array.isArray(body.scenes)
      ? body.scenes.filter((scene) => scene?.text && scene?.seconds > 0)
      : [];

    if (!scenes.length) {
      return NextResponse.json({ error: 'Gere o roteiro antes de renderizar.' }, { status: 400 });
    }

    const narration: Narration = ['male', 'female'].includes(body.narration || '')
      ? (body.narration as Narration)
      : 'none';

    const totalSeconds = Math.min(120, Math.max(3, scenes.reduce((sum, scene) => sum + Math.max(1, scene.seconds), 0)));
    const output = path.join(workdir, 'ghost-content.mp4');
    const audioPath = path.join(workdir, 'narration.mp3');
    const narrationText = scenes.map((scene) => scene.text).join(' ');
    const hasNarration = await synthesizeNarration(narrationText, narration, audioPath);

    const imageInputs: { sceneIndex: number; filePath: string }[] = [];
    for (let i = 0; i < scenes.length; i += 1) {
      const imageUrl = scenes[i].imageUrl;
      if (!isSafeRemoteImageUrl(imageUrl)) continue;
      const filePath = path.join(workdir, `scene-${i}.img`);
      try {
        await downloadImage(imageUrl!, filePath);
        imageInputs.push({ sceneIndex: i, filePath });
      } catch (error) {
        console.warn('scene_image_failed', i, error);
      }
    }

    const args: string[] = ['-hide_banner', '-loglevel', 'error'];
    args.push('-f', 'lavfi', '-i', `color=c=#101014:s=1080x1920:r=30:d=${totalSeconds}`);

    for (const image of imageInputs) {
      args.push('-loop', '1', '-i', image.filePath);
    }
    if (hasNarration) args.push('-i', audioPath);

    let cursor = 0;
    const filters: string[] = [];
    let currentVideo = '[0:v]';

    for (const image of imageInputs) {
      const scene = scenes[image.sceneIndex];
      const start = scenes.slice(0, image.sceneIndex).reduce((sum, item) => sum + Math.max(1, item.seconds), 0);
      const end = Math.min(totalSeconds, start + Math.max(1, scene.seconds));
      const inputIndex = 1 + imageInputs.findIndex((item) => item.sceneIndex === image.sceneIndex);
      const baseLabel = `base${image.sceneIndex}`;
      const mediaLabel = `media${image.sceneIndex}`;
      const outLabel = `mix${image.sceneIndex}`;

      filters.push(`${currentVideo}setpts=PTS-STARTPTS[${baseLabel}]`);
      filters.push(`[${inputIndex}:v]scale=1200:2134:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0008,1.08)':d=1:s=1080x1920:fps=30,trim=duration=${Math.max(1, scene.seconds)},setpts=PTS-STARTPTS+${start}/TB[${mediaLabel}]`);
      filters.push(`[${baseLabel}][${mediaLabel}]overlay=0:0:enable='between(t,${start},${end})'[${outLabel}]`);
      currentVideo = `[${outLabel}]`;
    }

    const textFilters: string[] = [];
    cursor = 0;
    for (let i = 0; i < scenes.length; i += 1) {
      const scene = scenes[i];
      const start = cursor;
      const end = Math.min(totalSeconds, cursor + Math.max(1, scene.seconds));
      cursor = end;
      const text = escapeForFfmpegText(scene.text);
      textFilters.push(`drawtext=text='${text}':fontcolor=white:fontsize=54:line_spacing=14:x=(w-text_w)/2:y=h*0.72-text_h/2:box=1:boxcolor=black@0.58:boxborderw=28:enable='between(t,${start},${end})'`);
    }

    const topic = escapeForFfmpegText(body.topic || 'Ghost Content Studio');
    filters.push(`${currentVideo}drawtext=text='${topic}':fontcolor=white@0.82:fontsize=34:x=70:y=90,${textFilters.join(',')},format=yuv420p[vout]`);

    args.push('-filter_complex', filters.join(';'), '-map', '[vout]');

    if (hasNarration) {
      const audioInputIndex = 1 + imageInputs.length;
      args.push('-map', `${audioInputIndex}:a`, '-af', `apad=pad_dur=${totalSeconds}`, '-c:a', 'aac', '-b:a', '160k');
    }

    args.push(
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-movflags', '+faststart',
      '-t', String(totalSeconds),
      '-y',
      output,
    );

    await runFfmpeg(args);

    const file = await fs.readFile(output);
    return new NextResponse(file, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': 'attachment; filename="ghost-content.mp4"',
        'Cache-Control': 'no-store',
        'X-Ghost-Narration': hasNarration ? 'enabled' : 'disabled',
      },
    });
  } catch (error) {
    console.error('render_error', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Falha ao renderizar o MP4.' },
      { status: 500 },
    );
  } finally {
    await fs.rm(workdir, { recursive: true, force: true }).catch(() => undefined);
  }
}
