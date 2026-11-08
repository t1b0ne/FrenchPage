import { useState } from 'react';
import { ArrowRight, KeyRound, Mail, Sparkles, UserRound } from 'lucide-react';
import { supabase } from './lib/supabase.js';

export default function AuthPage({ configured }) {
  const [mode, setMode] = useState('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const isSignup = mode === 'signup';

  async function submit(event) {
    event.preventDefault();
    if (!configured || !supabase) return;
    setBusy(true); setFeedback(null);
    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { display_name: displayName.trim() } } });
        if (error) throw error;
        if (!data.session) setFeedback({ type: 'success', text: 'Cuenta creada. Revisa tu correo para confirmar la dirección y luego inicia sesión.' });
        else setFeedback({ type: 'success', text: 'Cuenta creada. ¡Bienvenida a Parlez!' });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (error) {
      setFeedback({ type: 'error', text: error.message || 'No se pudo completar el acceso.' });
    } finally { setBusy(false); }
  }

  return <main className="auth-page"><section className="auth-card"><a className="brand auth-brand" href="#home"><span className="brand-mark">p.</span><span>parlez<span className="brand-period">.</span></span></a><div className="auth-kicker"><Sparkles size={14}/> UN ESPACIO PARA PRACTICAR</div><h1>{configured ? (isSignup ? 'Tu francés empieza aquí.' : 'Qué gusto verte.') : 'Conectemos tu espacio.'}</h1><p className="auth-subtitle">{configured ? 'Conversaciones en francés, a tu ritmo y sin miedo a equivocarte.' : 'Añade las claves de tu proyecto Supabase para habilitar el acceso.'}</p>
    {!configured ? <div className="auth-config"><strong>Falta configurar Supabase</strong><p>En el archivo <code>.env</code>, agrega <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> desde la configuración de API de tu proyecto. Después reinicia el servidor.</p></div> : <>
      <div className="auth-tabs"><button className={!isSignup ? 'selected' : ''} onClick={() => { setMode('login'); setFeedback(null); }}>Iniciar sesión</button><button className={isSignup ? 'selected' : ''} onClick={() => { setMode('signup'); setFeedback(null); }}>Crear cuenta</button></div>
      <form className="auth-form" onSubmit={submit}>{isSignup && <label><span>Nombre</span><div className="auth-input"><UserRound size={16}/><input autoComplete="name" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Cómo te llamamos" required maxLength={80}/></div></label>}
        <label><span>Correo electrónico</span><div className="auth-input"><Mail size={16}/><input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@correo.com" required/></div></label>
        <label><span>Contraseña</span><div className="auth-input"><KeyRound size={16}/><input type="password" autoComplete={isSignup ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" minLength={8} required/></div></label>
        {feedback && <div className={`auth-feedback ${feedback.type}`}>{feedback.text}</div>}
        <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Un momento…' : isSignup ? 'Crear mi cuenta' : 'Entrar a practicar'}<ArrowRight size={16}/></button>
      </form><div className="auth-privacy">Tu cuenta y tu progreso se guardan de forma privada.</div>
    </>}</section><div className="auth-side"><div className="auth-side-orb"/><div className="auth-side-copy"><span>Bonjour, bon courage.</span><strong>Un poco de francés,<br/><em>un gran paso.</em></strong><p>Un ratito al día. Conversaciones reales. Sin miedo a equivocarte.</p></div><span className="auth-flag">🇫🇷</span></div></main>;
}
