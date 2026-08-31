import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SceneInput = {
  title?: string;
  text?: string;
};

type PexelsPhoto = {
  id: number;
  alt?: string;
  photographer?: string;
  photographer_url?: string;
  url?: string;
  src?: {
    portrait?: string;
    large2x?: string;
    large?: string;
  };
};

type PexelsResponse = {
  photos?: PexelsPhoto[];
};

function buildQuery(scene: SceneInput, topic: string) {
  const raw = `${scene.title || ''} ${scene.text || ''} ${topic}`
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return raw.slice(0, 120) || topic || 'cinematic vertical background';
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'PEXELS_API_KEY não configurada.' },
      { status: 503 },
    );
  }

  try {
    const body = await request.json();
    const scenes = Array.isArray(body.scenes) ? (body.scenes as SceneInput[]) : [];
    const topic = typeof body.topic === 'string' ? body.topic : '';

    if (!scenes.length) {
      return NextResponse.json({ error: 'Nenhuma cena recebida.' }, { status: 400 });
    }

    const results = await Promise.all(
      scenes.map(async (scene, index) => {
        const query = buildQuery(scene, topic);
        const url = new URL('https://api.pexels.com/v1/search');
        url.searchParams.set('query', query);
        url.searchParams.set('orientation', 'portrait');
        url.searchParams.set('locale', 'pt-BR');
        url.searchParams.set('per_page', '4');
        url.searchParams.set('page', String((index % 3) + 1));

        const response = await fetch(url, {
          headers: { Authorization: apiKey },
          cache: 'no-store',
        });

        if (!response.ok) {
          return { index, query, imageUrl: '', credit: '', sourceUrl: '' };
        }

        const data = (await response.json()) as PexelsResponse;
        const photo = data.photos?.[index % Math.max(1, data.photos?.length || 1)] || data.photos?.[0];

        return {
          index,
          query,
          imageUrl: photo?.src?.portrait || photo?.src?.large2x || photo?.src?.large || '',
          credit: photo?.photographer ? `Foto: ${photo.photographer} · Pexels` : 'Pexels',
          sourceUrl: photo?.url || photo?.photographer_url || 'https://www.pexels.com',
          alt: photo?.alt || '',
        };
      }),
    );

    return NextResponse.json({ results });
  } catch (error) {
    console.error('media_search_error', error);
    return NextResponse.json({ error: 'Falha ao buscar mídia automática.' }, { status: 500 });
  }
}
