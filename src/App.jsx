import { useEffect, useRef, useState } from 'react';
import { Activity, AudioLines, BookOpen, Check, ChevronDown, CircleHelp, Clock3, Coffee, Compass, Headphones, Mic, MoreHorizontal, Plus, Send, Settings2, Sparkles, Volume2, X } from 'lucide-react';
import AuthPage from './AuthPage.jsx';
import { supabase, supabaseConfigured } from './lib/supabase.js';

const scenarios = [
  { id: 'cafe', title: 'En un café', sub: 'Pide algo como un local', icon: Coffee, tag: 'A2 · 5 min', color: 'peach', initial: 'Bonjour ! Bienvenue au Café de Flore. Qu’est-ce que je vous sers aujourd’hui ?' },
  { id: 'voyage', title: 'En la ciudad', sub: 'Pregunta cómo llegar', icon: Compass, tag: 'A2 · 7 min', color: 'blue', initial: 'Bonjour ! Vous avez l’air un peu perdu. Vous cherchez quelque chose ?' },
  { id: 'rencontre', title: 'Conocer a alguien', sub: 'Inicia una conversación', icon: Sparkles, tag: 'B1 · 5 min', color: 'lilac', initial: 'Salut ! C’est la première fois que tu viens à cette exposition ?' },
  { id: 'marche', title: 'En el mercado', sub: 'Compra productos frescos', icon: BookOpen, tag: 'A2 · 6 min', color: 'green', initial: 'Bonjour madame ! Les fraises sont très bonnes aujourd’hui. Vous en voulez ?' },
];
const voices = [
  ['Zephyr', 'Brillante'], ['Puck', 'Animada'], ['Charon', 'Informativa'], ['Kore', 'Firme'], ['Fenrir', 'Enérgica'], ['Leda', 'Juvenil'], ['Orus', 'Firme'], ['Aoede', 'Ligera'], ['Callirrhoe', 'Relajada'], ['Autonoe', 'Brillante'], ['Enceladus', 'Aireada'], ['Iapetus', 'Clara'], ['Umbriel', 'Relajada'], ['Algieba', 'Suave'], ['Despina', 'Suave'], ['Erinome', 'Clara'], ['Algenib', 'Grave'], ['Rasalgethi', 'Informativa'], ['Laomedeia', 'Animada'], ['Achernar', 'Dulce'], ['Alnilam', 'Firme'], ['Schedar', 'Serena'], ['Gacrux', 'Madura'], ['Pulcherrima', 'Expresiva'], ['Achird', 'Amable'], ['Zubenelgenubi', 'Casual'], ['Vindemiatrix', 'Gentil'], ['Sadachbia', 'Vivaz'], ['Sadaltager', 'Amable'], ['Sulafat', 'Cálida']
];
const makeMessage = (role, text) => ({ id: `${Date.now()}-${Math.random()}`, role, text });
async function apiError(response) {
  const raw = await response.text();
  try { return JSON.parse(raw).error || `La API respondió HTTP ${response.status}.`; }
  catch {
    if (/the page could not be found/i.test(raw)) return 'Vercel no encontró /api/chat. Despliega de nuevo con las funciones api/ incluidas.';
    return `La API respondió HTTP ${response.status} sin JSON${raw ? `: ${raw.slice(0, 140)}` : '.'}`;
  }
}

function PracticeApp({ user }) {
  const [scenario, setScenario] = useState(scenarios[0]);
  const [messages, setMessages] = useState([makeMessage('assistant', scenarios[0].initial)]);
  const [input, setInput] = useState('');
  const [level, setLevel] = useState('A2 · Elemental');
  const [voice, setVoice] = useState(() => localStorage.getItem('parlezVoice') || 'Achird');
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [waitingStatus, setWaitingStatus] = useState('');
  const [activity, setActivity] = useState([]);
  const [speechLoadingId, setSpeechLoadingId] = useState(null);
  const [speakingId, setSpeakingId] = useState(null);
  const [toast, setToast] = useState('');
  const [started, setStarted] = useState(false);
  const [model, setModel] = useState('Gemini · listo');
  const [conversationId, setConversationId] = useState(null);
  const bottomRef = useRef(null);
  const recognition = useRef(null);
  const audioCache = useRef(new Map());
  const audioPlayer = useRef(null);
  const startedAt = useRef(Date.now());
  const [minutes, setMinutes] = useState(0);
  useEffect(() => { const t = setInterval(() => setMinutes(Math.floor((Date.now() - startedAt.current) / 60000)), 10000); return () => clearInterval(t); }, []);
  useEffect(() => { localStorage.setItem('parlezVoice', voice); }, [voice]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) { const rec = new SpeechRecognition(); rec.lang = 'fr-FR'; rec.interimResults = true; rec.continuous = false; rec.onresult = e => setInput(Array.from(e.results).map(r => r[0].transcript).join('')); rec.onend = () => setListening(false); rec.onerror = () => setListening(false); recognition.current = rec; }
    return () => recognition.current?.abort();
  }, []);
  const showToast = text => { setToast(text); window.setTimeout(() => setToast(''), 3200); };
  function logActivity(text, kind = 'info') {
    const time = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setActivity(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, time, text, kind }].slice(-40));
  }
  function selectScenario(item) { setScenario(item); setMessages([makeMessage('assistant', item.initial)]); setActivity([]); setWaitingStatus(''); setConversationId(null); setStarted(false); startedAt.current = Date.now(); }
  async function sendMessage(value = input) {
    const text = value.trim(); if (!text || busy) return;
    const updated = [...messages, makeMessage('user', text)]; setMessages(updated); setInput(''); setBusy(true); setStarted(true);
    logActivity('Mensaje enviado; abriendo una solicitud a Gemini.');
    try {
      const { data: authData, error: authError } = await supabase.auth.getSession();
      const accessToken = authData.session?.access_token;
      if (authError || !accessToken) throw new Error('Tu sesión expiró. Inicia sesión de nuevo.');
      let activeConversationId = conversationId;
      if (!activeConversationId) {
        setWaitingStatus('Guardando tu práctica…');
        const { data, error } = await supabase.from('practice_sessions').insert({ user_id: user.id, scenario: scenario.title, level: level.slice(0, 2) }).select('id').single();
        if (error) logActivity(`No se pudo crear el historial en Supabase: ${error.message}`, 'warning');
        else {
          activeConversationId = data.id;
          setConversationId(data.id);
          logActivity('Sesión de práctica creada en Supabase.', 'success');
        }
      }
      let userMessageInsert = null;
      if (activeConversationId) {
        userMessageInsert = supabase.from('practice_messages').insert({ session_id: activeConversationId, user_id: user.id, role: 'user', content: text }).then(result => result);
      }
      setWaitingStatus('Conectando con Gemini…');
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ messages: updated.map(({ role, text }) => ({ role, content: text })), level: level.slice(0, 2), scenario: scenario.title }) });
      if (!response.ok) throw new Error(await apiError(response));
      if (!response.headers.get('content-type')?.includes('text/event-stream')) throw new Error(await apiError(response));
      if (!response.body) throw new Error('El navegador no pudo abrir el registro en tiempo real.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let receivedReply = false;
      let streamError = '';
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
          const dataLine = frame.split(/\r?\n/).find(line => line.startsWith('data:'));
          if (!dataLine) continue;
          const event = JSON.parse(dataLine.slice(5).trim());
          if (event.type === 'status') { setWaitingStatus(event.text); }
          if (event.type === 'waiting') { setWaitingStatus(`Esperando a ${event.model}… ${(event.elapsedMs / 1000).toFixed(0)} s`); }
          if (event.type === 'attempt') {
            setWaitingStatus(`Probando ${event.model} (${event.number}/${event.total})…`);
            logActivity(`Enviando solicitud al modelo ${event.model}.`);
          }
          if (event.type === 'retry') {
            const elapsed = event.durationMs ? ` (${(event.durationMs / 1000).toFixed(1)} s)` : '';
            const statusCode = event.status ? `, HTTP ${event.status}` : '';
            const cause = event.timedOut ? 'agotó el tiempo de espera' : 'ocupado/no disponible';
            setWaitingStatus(`${event.model} ${event.timedOut ? 'tardó demasiado' : 'no respondió'}; probando ${event.nextModel}…`);
            logActivity(`${event.model} ${cause}${statusCode}${elapsed}. Cambiando a ${event.nextModel}.`, 'warning');
          }
          if (event.type === 'complete') {
            receivedReply = true;
            setMessages(prev => [...prev, makeMessage('assistant', event.reply)]);
            setModel(event.fallback ? `Gemini · ${event.model} (respaldo)` : `Gemini · ${event.model}`);
            setWaitingStatus(`Respuesta recibida en ${(event.durationMs / 1000).toFixed(1)} s.`);
            logActivity(`Respuesta de ${event.model} en ${(event.durationMs / 1000).toFixed(1)} s; se probaron ${event.attempts} modelo(s).`, 'success');
            if (userMessageInsert) {
              const { error: userSaveError } = await userMessageInsert;
              if (userSaveError) logActivity(`No se guardó tu mensaje: ${userSaveError.message}`, 'warning');
              else {
                const { error: replySaveError } = await supabase.from('practice_messages').insert({ session_id: activeConversationId, user_id: user.id, role: 'assistant', content: event.reply, model: event.model });
                if (replySaveError) logActivity(`No se guardó la respuesta: ${replySaveError.message}`, 'warning');
                else logActivity('Mensajes guardados en Supabase.', 'success');
                await supabase.from('practice_sessions').update({ updated_at: new Date().toISOString() }).eq('id', activeConversationId).eq('user_id', user.id);
              }
            }
            if (event.fallback) showToast(`Gemini usó ${event.model} como respaldo.`);
          }
          if (event.type === 'error') {
            streamError = event.text;
            logActivity(event.text, 'error');
          }
        }
        if (done) break;
      }
      if (streamError) throw new Error(streamError);
      if (!receivedReply) throw new Error('La conexión terminó antes de recibir la respuesta de Gemini.');
    } catch (e) {
      logActivity(`Error: ${e.message}`, 'error');
      setMessages(prev => [...prev, makeMessage('assistant', `Petit souci technique : ${e.message}`)]);
      showToast('No se pudo completar la solicitud. Revisa el registro de actividad.');
    } finally { setBusy(false); setWaitingStatus(''); }
  }
  function toggleMic() { if (!recognition.current) return showToast('Tu navegador no permite dictado. Prueba Chrome o Edge.'); if (listening) recognition.current.stop(); else { setListening(true); recognition.current.start(); } }
  function speakWithDeviceVoice(text) {
    if (!('speechSynthesis' in window)) return showToast('Este navegador no tiene una voz francesa disponible.');
    const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'fr-FR'; utterance.rate = 0.88;
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance);
  }
  async function speak(message) {
    if (speechLoadingId === message.id) return;
    if (speakingId === message.id && audioPlayer.current) { audioPlayer.current.pause(); setSpeakingId(null); return; }
    const text = message.text.replace(/✍️[\s\S]*/u, '').trim();
    const cacheKey = `${voice}:${message.id}`;
    let url = audioCache.current.get(cacheKey);
    if (!url) {
      setSpeechLoadingId(message.id);
      try {
        const { data: authData } = await supabase.auth.getSession();
        const response = await fetch('/api/speech', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authData.session?.access_token || ''}` }, body: JSON.stringify({ text, voice }) });
        if (!response.ok) throw new Error(await apiError(response));
        url = URL.createObjectURL(await response.blob());
        audioCache.current.set(cacheKey, url);
      } catch (error) {
        setSpeechLoadingId(null);
        speakWithDeviceVoice(text);
        return showToast(`${error.message} Usando la voz gratuita del dispositivo.`);
      }
      setSpeechLoadingId(null);
    }
    const player = audioPlayer.current || new Audio();
    audioPlayer.current = player;
    player.src = url;
    player.onended = () => setSpeakingId(null);
    player.onerror = () => { setSpeakingId(null); showToast('No pude reproducir el audio de Gemini.'); };
    try { await player.play(); setSpeakingId(message.id); }
    catch { setSpeakingId(null); speakWithDeviceVoice(text); showToast('El navegador no pudo reproducir el audio. Usando su voz francesa.'); }
  }
  const setNextLevel = () => setLevel(level.startsWith('A2') ? 'B1 · Intermedio' : level.startsWith('B1') ? 'A1 · Principiante' : 'A2 · Elemental');
  return <div className="app-shell">
    <aside className="sidebar"><a className="brand" href="#home"><span className="brand-mark">p.</span><span>parlez<span className="brand-period">.</span></span></a>
      <button className="new-session" onClick={() => { selectScenario(scenarios[0]); setStarted(false); }}><Plus size={17}/> Nueva práctica <span className="shortcut">⌘ K</span></button>
      <div className="side-label">TU ESPACIO</div><button className="nav-item active"><AudioLines size={17}/> Practicar <span className="nav-dot"/></button>
      <button className="nav-item" onClick={() => showToast('Tu progreso aparecerá después de tu primera práctica.')}><BookOpen size={17}/> Mi progreso</button>
      <button className="nav-item" onClick={() => showToast('Próximamente: guarda frases durante tus conversaciones.')}><Headphones size={17}/> Frases guardadas</button>
      <div className="side-label scenario-label">PRÁCTICA RÁPIDA</div><div className="side-scenarios">{scenarios.map(s => <button key={s.id} className={`mini-scenario ${scenario.id === s.id ? 'selected' : ''}`} onClick={() => selectScenario(s)}><span className={`mini-icon ${s.color}`}><s.icon size={15}/></span><span>{s.title}</span></button>)}</div>
      <div className="sidebar-bottom"><div className="daily-card"><div className="daily-top"><span>Racha de hoy</span><span>🔥 3 días</span></div><div className="streak-row">{['L','M','X','J','V','S','D'].map((d,i) => <span key={i} className={i < 3 ? 'done' : ''}>{i < 3 ? <Check size={12}/> : d}</span>)}</div><div className="daily-caption">Una pequeña charla cada día ✨</div></div><button className="profile" onClick={() => supabase.auth.signOut()}><span className="avatar">{(user.user_metadata?.display_name || user.email || 'M').charAt(0).toUpperCase()}</span><span className="profile-name">{user.user_metadata?.display_name || user.email}<span>Cerrar sesión</span></span><MoreHorizontal size={18}/></button></div>
    </aside>
    <main className="main-area"><header className="topbar"><div className="breadcrumbs"><span>Práctica</span><span className="crumb-slash">/</span><span className="crumb-current">Conversación libre</span></div><div className="top-actions"><button className="help-button" onClick={() => showToast('Elige una situación, habla o escribe en francés y Camille seguirá la conversación.')}><CircleHelp size={17}/><span>¿Cómo funciona?</span></button><button className="level-select" onClick={setNextLevel}><span className="level-dot"/>{level}<ChevronDown size={14}/></button></div></header>
      <div className="workspace"><section className="practice-column"><div className="practice-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> TU RINCÓN DE FRANCÉS</div><h1>Un poco de francés,<br/><em>un gran paso.</em></h1><p className="intro">Practica a tu ritmo. Camille está aquí para conversar, no para juzgar.</p></div><div className="daily-illustration"><span className="sun-orb"/><span className="flower">✳</span><span className="illustration-line line-one"/><span className="illustration-line line-two"/><span className="coffee-cup">☕</span><span className="illustration-label">bonjour !</span></div></div>
        <div className="scenario-heading"><div><span className="section-title">¿Qué te apetece practicar?</span><span className="section-hint">Elige una situación para empezar</span></div><button className="browse-link" onClick={() => showToast('Ya estás viendo todas las situaciones disponibles.')}>Ver todas <span>↗</span></button></div>
        <div className="scenario-grid">{scenarios.map(s => <button key={s.id} onClick={() => selectScenario(s)} className={`scenario-card ${scenario.id === s.id ? 'chosen' : ''}`}><span className={`scenario-icon ${s.color}`}><s.icon size={18}/></span><span className="scenario-check">{scenario.id === s.id ? <Check size={12}/> : <span className="empty-check"/>}</span><span className="scenario-title">{s.title}</span><span className="scenario-sub">{s.sub}</span><span className="scenario-meta"><span>{s.tag}</span><span className="arrow-go">↗</span></span></button>)}</div>
        <div className="conversation-head"><div><span className="section-title">Tu conversación</span><span className="section-hint">Un espacio seguro para probar, equivocarte y mejorar.</span></div><div className="conversation-meta"><span className="live-pill"><span/> EN VIVO</span><span className="duration"><Clock3 size={13}/> {String(minutes).padStart(2,'0')}:00</span><button className="settings-button" onClick={() => showToast('Elige tu nivel desde el menú superior derecho.')}><Settings2 size={16}/></button></div></div>
        <div className="chat-card"><div className="chat-topline"><div className="tutor-profile"><div className="tutor-avatar">C<span/></div><div><strong>Camille</strong><span>Tu compañera de conversación</span></div></div><div className="chat-top-right"><span className="model-status"><span className="status-pulse"/>Gemini TTS</span><label className="voice-picker" title="Voces predefinidas de Google AI Studio"><Volume2 size={13}/><select aria-label="Voz de Camille" value={voice} onChange={e => setVoice(e.target.value)}>{voices.map(([name, mood]) => <option key={name} value={name}>{name} · {mood}</option>)}</select></label><button className="dots-button" onClick={() => { audioPlayer.current?.pause(); window.speechSynthesis.cancel(); setSpeakingId(null); showToast('Audio detenido.'); }}><MoreHorizontal size={19}/></button></div></div>
          <div className="chat-messages">{messages.map(m => <div key={m.id} className={`message-row ${m.role}`}><div className={`message-avatar ${m.role}`}>{m.role === 'assistant' ? 'C' : 'M'}</div><div className="message-content"><span className="message-author">{m.role === 'assistant' ? 'Camille' : 'TÚ'} <span>· ahora</span></span><div className={`bubble ${m.role}`}>{m.text.split('\n').map((line,i)=><span key={i}>{line}{i < m.text.split('\n').length-1 && <br/>}</span>)}</div>{m.role === 'assistant' && <button className="speak-button" onClick={() => speak(m)}><Volume2 size={13}/>{speechLoadingId === m.id ? 'Generando voz…' : speakingId === m.id ? 'Pausar audio' : 'Escuchar · Gemini TTS'}</button>}</div></div>)}{busy && <div className="message-row"><div className="message-avatar assistant">C</div><div className="typing-bubble"><i/><i/><i/><span>{waitingStatus || 'Camille está pensando…'}</span></div></div>}<div ref={bottomRef}/></div>
          <form className="composer" onSubmit={e => { e.preventDefault(); sendMessage(); }}><button type="button" className={`mic-button ${listening ? 'listening' : ''}`} onClick={toggleMic} aria-label="Hablar"><Mic size={17}/></button><input value={input} onChange={e => setInput(e.target.value)} placeholder={listening ? 'Te escucho… habla en francés' : 'Escribe o habla en francés…'} /><button type="button" className="voice-button" onClick={() => showToast('Pulsa el micrófono para dictar tu respuesta en francés.')}><AudioLines size={16}/></button><button type="submit" className="send-button" disabled={!input.trim() || busy} aria-label="Enviar"><Send size={15}/></button></form>
          <div className="composer-foot"><span><span className="enter-key">↵</span> para enviar</span><span>Una conversación a la vez <span className="tiny-heart">♡</span></span></div></div>
        <section className="activity-log" aria-live="polite"><header><span><Activity size={14}/> Registro de actividad</span><span className={busy ? 'activity-live' : 'activity-status'}>{busy ? waitingStatus : model}</span></header><div className="activity-items">{activity.length ? activity.slice(-6).map(item => <div key={item.id} className={`activity-item ${item.kind}`}><time>{item.time}</time><span>{item.text}</span></div>) : <div className="activity-empty">Se mostrarán aquí los modelos intentados, cambios por saturación y tiempo de respuesta.</div>}</div></section>
        {!started && <div className="starter-row"><span className="starter-label">O EMPIEZA POR AQUÍ</span>{['Bonjour !', 'Je voudrais un café, s’il vous plaît.', 'Comment ça va ?'].map(t => <button key={t} onClick={() => sendMessage(t)}>{t}<span>↗</span></button>)}</div>}
        <div className="footnote"><span>✳</span> Equivocarse también es parte de aprender. Camille te ayudará con cariño.</div></section>
        <aside className="right-rail"><div className="rail-card welcome-card"><div className="rail-spark">✳</div><span className="rail-kicker">BIENVENIDA A PARLEZ</span><h3>Tu francés,<br/>a tu manera.</h3><p>Un ratito al día. Conversaciones reales. Sin miedo a equivocarte.</p><div className="welcome-bottom"><span>Hecho con <b>♡</b> para aprender</span><span className="flag-fr">🇫🇷</span></div></div>
          <div className="rail-card tip-card"><div className="tip-title"><span className="tip-icon">✦</span><span>UN CONSEJITO</span><MoreHorizontal size={18}/></div><p>En francés, <b>“je voudrais”</b> suena más natural y amable que <b>“je veux”</b> al pedir algo. ¡Pruébalo en el café!</p><button onClick={() => { setInput('Je voudrais un café, s’il vous plaît.'); showToast('Frase lista para enviar.'); }}>Probar esta frase <span>↗</span></button></div>
          <div className="rail-card goals-card"><div className="goals-heading"><span>Tu mini objetivo</span><MoreHorizontal size={18}/></div><div className="goal-number">{started ? '1' : '0'}<span> / 5 min</span></div><div className="progress-track"><span style={{width: started ? '20%' : '3%'}}/></div><p>Con solo 5 minutos al día<br/>ya estás más cerca ✨</p><div className="goal-footer"><span>Práctica de hoy</span><span>♡</span></div></div>
          <div className="level-card"><span className="level-card-icon">✳</span><div><strong>Tu nivel actual</strong><span>{level.split(' · ')[0]} · {level.split(' · ')[1]}</span></div><button onClick={setNextLevel} aria-label="Cambiar nivel"><ChevronDown size={16}/></button></div><div className="rail-note"><span>✿</span> Petit à petit, l’oiseau fait son nid.<br/><i>Poco a poco se llega lejos.</i></div></aside>
      </div></main>{toast && <div className="toast"><span>✳</span>{toast}<button onClick={() => setToast('')}><X size={14}/></button></div>}</div>;
}

export default function App() {
  const [auth, setAuth] = useState({ loading: true, user: null });
  useEffect(() => {
    if (!supabaseConfigured || !supabase) { setAuth({ loading: false, user: null }); return; }
    let mounted = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setAuth({ loading: false, user: session?.user || null });
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (mounted) setAuth({ loading: false, user: error ? null : data.session?.user || null });
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);
  if (auth.loading) return <div className="auth-loading"><span className="brand-mark">p.</span><span>Comprobando tu sesión…</span></div>;
  if (!supabaseConfigured) return <AuthPage configured={false}/>;
  if (!auth.user) return <AuthPage configured/>;
  return <PracticeApp user={auth.user}/>;
}
