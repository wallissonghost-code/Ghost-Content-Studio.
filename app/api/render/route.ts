import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Scene = { title: string; text: string; seconds: number };

type Payload = {
  topic?: string;
  scenes?: Scene[];
};

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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Payload;
    const scenes = Array.isArray(body.scenes) ? body.scenes.filter((scene) => scene?.text && scene?.seconds > 0) : [];

    if (!scenes.length) {
      return NextResponse.json({ error: 'Gere o roteiro antes de renderizar.' }, { status: 400 });
    }

    const totalSeconds = Math.min(120, Math.max(3, scenes.reduce((sum, scene) => sum + Math.max(1, scene.seconds), 0)));
    const output = path.join(os.tmpdir(), `ghost-content-${Date.now()}.mp4`);

    let cursor = 0;
    const drawTextFilters = scenes.map((scene) => {
      const start = cursor;
      const end = Math.min(totalSeconds, cursor + Math.max(1, scene.seconds));
      cursor = end;
      const text = escapeForFfmpegText(scene.text);
      return `drawtext=text='${text}':fontcolor=white:fontsize=54:line_spacing=14:x=(w-text_w)/2:y=h*0.70-text_h/2:box=1:boxcolor=black@0.55:boxborderw=28:enable='between(t,${start},${end})'`;
    });

    const topic = escapeForFfmpegText(body.topic || 'Ghost Content Studio');
    const filter = [
      `drawtext=text='${topic}':fontcolor=white@0.75:fontsize=34:x=70:y=90`,
      ...drawTextFilters,
      'format=yuv420p',
    ].join(',');

    await runFfmpeg([
      '-hide_banner',
      '-loglevel', 'error',
      '-f', 'lavfi',
      '-i', `color=c=#101014:s=1080x1920:r=30:d=${totalSeconds}`,
      '-vf', filter,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-movflags', '+faststart',
      '-t', String(totalSeconds),
      '-y',
      output,
    ]);

    const file = await fs.readFile(output);
    await fs.unlink(output).catch(() => undefined);

    return new NextResponse(file, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': 'attachment; filename="ghost-content.mp4"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('render_error', error);
    return NextResponse.json(
      { error: 'Falha ao renderizar o MP4. Verifique se o ambiente suporta o binário do FFmpeg.' },
      { status: 500 },
    );
  }
}
