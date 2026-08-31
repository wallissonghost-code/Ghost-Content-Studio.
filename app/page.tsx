'use client';

import { useMemo, useState } from 'react';

type Scene = { title: string; text: string; seconds: number };

export default function Home() {
  const [niche, setNiche] = useState('Mistérios');
  const [topic, setTopic] = useState('Uma gravação encontrada em uma casa abandonada');
  const [duration, setDuration] = useState(45);
  const [tone, setTone] = useState('Suspense');
  const [script, setScript] = useState('');
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [status, setStatus] = useState('Pronto para criar.');

  const hook = useMemo(() => topic.trim() || 'Escolha um tema para o vídeo', [topic]);

  function generate() {
    const blocks: Scene[] = [
      { title: 'Gancho', text: `Você teria coragem de descobrir o que aconteceu? ${topic}.`, seconds: 3 },
      { title: 'Contexto', text: `Tudo começa com um detalhe aparentemente comum dentro do universo de ${niche.toLowerCase()}.`, seconds: Math.max(7, Math.round(duration * .2)) },
      { title: 'Escalada', text: `A partir daí, os sinais ficam cada vez mais estranhos e o clima muda completamente.`, seconds: Math.max(9, Math.round(duration * .28)) },
      { title: 'Revelação', text: `No momento decisivo, surge a informação que muda a interpretação de toda a história.`, seconds: Math.max(8, Math.round(duration * .25)) },
      { title: 'CTA', text: 'Você continuaria investigando? Comenta o que faria.', seconds: 5 },
    ];
    setScenes(blocks);
    setScript(blocks.map((s) => `${s.title}: ${s.text}`).join('\n\n'));
    setStatus('Roteiro criado. Próximo passo: narração + mídia + renderização 9:16.');
  }

  async function connectTikTok() {
    setStatus('Abrindo fluxo oficial de autorização do TikTok...');
    window.location.href = '/api/tiktok/auth';
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
          <div className="row"><div><h2>Novo vídeo</h2><div className="muted">Monte o briefing e gere a estrutura do conteúdo.</div></div><span className="badge">9:16 · 1080×1920</span></div>
          <div className="form">
            <div className="field"><label>Nicho</label><select value={niche} onChange={(e)=>setNiche(e.target.value)}><option>Mistérios</option><option>Curiosidades</option><option>Futebol</option><option>Tecnologia</option><option>Histórias</option></select></div>
            <div className="field"><label>Estilo</label><select value={tone} onChange={(e)=>setTone(e.target.value)}><option>Suspense</option><option>Rápido</option><option>Documental</option><option>Emocional</option><option>Impactante</option></select></div>
            <div className="field full"><label>Tema</label><input value={topic} onChange={(e)=>setTopic(e.target.value)} placeholder="Digite o assunto do vídeo" /></div>
            <div className="field"><label>Duração</label><select value={duration} onChange={(e)=>setDuration(Number(e.target.value))}><option value={30}>30 segundos</option><option value={45}>45 segundos</option><option value={60}>60 segundos</option><option value={90}>90 segundos</option></select></div>
            <div className="field"><label>Narração</label><select defaultValue="Masculina natural"><option>Masculina natural</option><option>Feminina natural</option><option>Somente legenda</option></select></div>
            <div className="actions"><button className="btn primary" onClick={generate}>Gerar roteiro</button><button className="btn secondary" onClick={connectTikTok}>Conectar TikTok</button></div>
            <div className="field full"><label>Roteiro</label><textarea value={script} onChange={(e)=>setScript(e.target.value)} placeholder="O roteiro aparecerá aqui..." /></div>
          </div>
          <div className="status">{status}</div>
          <div className="timeline">{scenes.map((scene,i)=><div className="scene" key={`${scene.title}-${i}`}><strong>{String(i+1).padStart(2,'0')} · {scene.title}</strong><div>{scene.text}</div><small>{scene.seconds}s · {tone}</small></div>)}</div>
        </div>

        <aside className="card">
          <h2>Preview</h2><div className="muted">Prévia conceitual do vídeo vertical.</div>
          <div className="video"><div className="caption">{hook}</div></div>
          <button className="btn secondary" style={{width:'100%'}} onClick={()=>setStatus('Renderização ficará ativa quando o worker FFmpeg for conectado.')}>Renderizar MP4</button>
        </aside>
      </section>
    </main>
  );
}
