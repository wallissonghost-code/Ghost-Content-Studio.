'use client';

import { useMemo, useState } from 'react';

type Narration = 'none' | 'male' | 'female';
type Scene = { title: string; text: string; seconds: number; imageUrl?: string; credit?: string; sourceUrl?: string };

type MediaResult = {
  index: number;
  imageUrl?: string;
  credit?: string;
  sourceUrl?: string;
};

export default function Home() {
  const [niche, setNiche] = useState('Mistérios');
  const [topic, setTopic] = useState('Uma gravação encontrada em uma casa abandonada');
  const [duration, setDuration] = useState(45);
  const [tone, setTone] = useState('Suspense');
  const [narration, setNarration] = useState<Narration>('none');
  const [script, setScript] = useState('');
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [status, setStatus] = useState('Pronto para criar.');
  const [rendering, setRendering] = useState(false);
  const [searchingMedia, setSearchingMedia] = useState(false);

  const hook = useMemo(() => topic.trim() || 'Escolha um tema para o vídeo', [topic]);

  function buildScenes() {
    return [
      { title: 'Gancho', text: `Você teria coragem de descobrir o que aconteceu? ${topic}.`, seconds: 3 },
      { title: 'Contexto', text: `Tudo começa com um detalhe aparentemente comum dentro do universo de ${niche.toLowerCase()}.`, seconds: Math.max(7, Math.round(duration * .2)) },
      { title: 'Escalada', text: 'A partir daí, os sinais ficam cada vez mais estranhos e o clima muda completamente.', seconds: Math.max(9, Math.round(duration * .28)) },
      { title: 'Revelação', text: 'No momento decisivo, surge a informação que muda a interpretação de toda a história.', seconds: Math.max(8, Math.round(duration * .25)) },
      { title: 'CTA', text: 'Você continuaria investigando? Comenta o que faria.', seconds: 5 },
    ] as Scene[];
  }

  async function generate() {
    const blocks = buildScenes();
    setScenes(blocks);
    setScript(blocks.map((s) => `${s.title}: ${s.text}`).join('\n\n'));
    setStatus('Roteiro criado. Buscando mídia automática para cada cena...');
    await searchMedia(blocks);
  }

  function updateSceneImage(index: number, imageUrl: string) {
    setScenes((current) => current.map((scene, sceneIndex) => sceneIndex === index ? { ...scene, imageUrl } : scene));
  }

  async function searchMedia(targetScenes = scenes) {
    if (!targetScenes.length) {
      setStatus('Gere o roteiro antes de buscar mídia.');
      return;
    }

    setSearchingMedia(true);
    setStatus('Buscando imagens verticais no Pexels para cada cena...');

    try {
      const response = await fetch('/api/media/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, scenes: targetScenes }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Falha ao buscar mídia.' }));
        throw new Error(error.error || 'Falha ao buscar mídia.');
      }

      const data = await response.json() as { results?: MediaResult[] };
      const results = Array.isArray(data.results) ? data.results : [];

      setScenes((current) => current.map((scene, index) => {
        const media = results.find((item) => item.index === index);
        if (!media?.imageUrl) return scene;
        return { ...scene, imageUrl: media.imageUrl, credit: media.credit, sourceUrl: media.sourceUrl };
      }));

      const filled = results.filter((item) => item.imageUrl).length;
      setStatus(`Mídia automática concluída: ${filled}/${targetScenes.length} cenas preenchidas.`);
    } catch (error) {
      setStatus(error instanceof Error ? `${error.message} Você ainda pode colar URLs manualmente.` : 'Falha ao buscar mídia automática.');
    } finally {
      setSearchingMedia(false);
    }
  }

  async function connectTikTok() {
    setStatus('Abrindo fluxo oficial de autorização do TikTok...');
    window.location.href = '/api/tiktok/auth';
  }

  async function renderVideo() {
    if (!scenes.length) {
      setStatus('Gere o roteiro antes de renderizar.');
      return;
    }

    setRendering(true);
    setStatus(narration === 'none' ? 'Renderizando vídeo 1080×1920...' : 'Gerando narração e renderizando vídeo 1080×1920...');

    try {
      const response = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, scenes, narration }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Falha na renderização.' }));
        throw new Error(error.error || 'Falha na renderização.');
      }

      const narrationEnabled = response.headers.get('X-Ghost-Narration') === 'enabled';
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `ghost-content-${Date.now()}.mp4`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      if (narration !== 'none' && !narrationEnabled) {
        setStatus('MP4 gerado. A voz não entrou porque a chave/voice ID do ElevenLabs ainda não está configurada no servidor.');
      } else {
        setStatus(narrationEnabled ? 'MP4 com narração renderizado com sucesso.' : 'MP4 renderizado com sucesso.');
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Falha ao renderizar o vídeo.');
    } finally {
      setRendering(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="brand">GHOST CONTENT STUDIO</div>
          <div className="muted">Conteúdo faceless · TikTok primeiro · Kwai depois</div>
        </div>
        <div className="platforms"><span className="pill on">TikTok</span><span className="pill">Kwai</span></div>
      </header>

      <section className="grid">
        <div className="card">
          <div className="row"><div><h2>Novo vídeo</h2><div className="muted">Monte o briefing, cenas, mídia e voz.</div></div><span className="badge">9:16 · 1080×1920</span></div>
          <div className="form">
            <div className="field"><label>Nicho</label><select value={niche} onChange={(e)=>setNiche(e.target.value)}><option>Mistérios</option><option>Curiosidades</option><option>Futebol</option><option>Tecnologia</option><option>Histórias</option></select></div>
            <div className="field"><label>Estilo</label><select value={tone} onChange={(e)=>setTone(e.target.value)}><option>Suspense</option><option>Rápido</option><option>Documental</option><option>Emocional</option><option>Impactante</option></select></div>
            <div className="field full"><label>Tema</label><input value={topic} onChange={(e)=>setTopic(e.target.value)} placeholder="Digite o assunto do vídeo" /></div>
            <div className="field"><label>Duração</label><select value={duration} onChange={(e)=>setDuration(Number(e.target.value))}><option value={30}>30 segundos</option><option value={45}>45 segundos</option><option value={60}>60 segundos</option><option value={90}>90 segundos</option></select></div>
            <div className="field"><label>Narração</label><select value={narration} onChange={(e)=>setNarration(e.target.value as Narration)}><option value="none">Somente legenda</option><option value="male">Masculina natural</option><option value="female">Feminina natural</option></select></div>
            <div className="actions"><button className="btn primary" onClick={generate} disabled={searchingMedia}>{searchingMedia ? 'Buscando mídia…' : 'Gerar vídeo base'}</button><button className="btn secondary" onClick={()=>searchMedia()} disabled={searchingMedia || !scenes.length}>Trocar mídia automática</button><button className="btn secondary" onClick={connectTikTok}>Conectar TikTok</button></div>
            <div className="field full"><label>Roteiro</label><textarea value={script} onChange={(e)=>setScript(e.target.value)} placeholder="O roteiro aparecerá aqui..." /></div>
          </div>
          <div className="status">{status}</div>
          <div className="timeline">{scenes.map((scene,i)=><div className="scene" key={`${scene.title}-${i}`}><strong>{String(i+1).padStart(2,'0')} · {scene.title}</strong><div>{scene.text}</div><small>{scene.seconds}s · {tone}</small>{scene.imageUrl ? <div style={{marginTop:10}}><img src={scene.imageUrl} alt={scene.title} style={{width:'100%',maxHeight:220,objectFit:'cover',borderRadius:12}} />{scene.credit ? <small style={{display:'block',marginTop:6}}>{scene.credit}</small> : null}</div> : null}<div className="field" style={{marginTop:10}}><label>Imagem da cena · pode substituir manualmente</label><input value={scene.imageUrl || ''} onChange={(e)=>updateSceneImage(i,e.target.value)} placeholder="https://.../imagem.jpg" /></div></div>)}</div>
          <div className="muted" style={{marginTop:14}}>Fotos fornecidas pelo Pexels quando a busca automática estiver ativa.</div>
        </div>

        <aside className="card">
          <h2>Preview</h2><div className="muted">Prévia conceitual do vídeo vertical.</div>
          <div className="video" style={scenes[0]?.imageUrl ? {backgroundImage:`linear-gradient(rgba(0,0,0,.18),rgba(0,0,0,.55)),url(${scenes[0].imageUrl})`,backgroundSize:'cover',backgroundPosition:'center'} : undefined}><div className="caption">{hook}</div></div>
          <button className="btn secondary" style={{width:'100%'}} onClick={renderVideo} disabled={rendering}>{rendering ? 'Renderizando…' : 'Renderizar MP4'}</button>
        </aside>
      </section>
    </main>
  );
}
