import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
dotenv.config({ path: path.join(root, '.env') });

const defaultModels = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];
const configuredModels = (process.env.GEMINI_MODELS || '').split(',').map(model => model.trim()).filter(Boolean);
export const models = configuredModels.length ? configuredModels : defaultModels;
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabaseAuth = supabaseUrl && supabasePublishableKey
  ? createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  : null;
const studioVoices = new Set(['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat']);
const retryableStatus = new Set([403, 404, 429, 500, 502, 503, 504]);

function json(res, status, payload) {
  if (typeof res.status === 'function' && typeof res.json === 'function') return res.status(status).json(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(payload));
}

function requestBody(req) {
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body || {};
}

async function authenticatedUser(req) {
  if (!supabaseAuth) return { error: 'Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en Vercel.' };
  const authorization = req.headers?.authorization || req.headers?.Authorization;
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { error: 'Inicia sesión para usar esta función.', status: 401 };
  try {
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data.user) return { error: 'La sesión no es válida. Inicia sesión de nuevo.', status: 401 };
    return { user: data.user };
  } catch {
    return { error: 'No pude verificar la sesión con Supabase.', status: 503 };
  }
}

export function healthHandler(_req, res) {
  return json(res, 200, { configured: Boolean(process.env.GEMINI_API_KEY), supabaseConfigured: Boolean(supabaseAuth), models });
}

export async function chatHandler(req, res) {
  if (req.method && req.method !== 'POST') return json(res, 405, { error: 'Usa POST para conversar.' });
  let body;
  try { body = requestBody(req); }
  catch { return json(res, 400, { error: 'El cuerpo de la solicitud no es JSON válido.' }); }
  const { messages = [], level = 'A2', scenario = 'Café parisien' } = body;
  if (!process.env.GEMINI_API_KEY) return json(res, 503, { error: 'Falta configurar GEMINI_API_KEY en las variables de Vercel.' });
  if (!Array.isArray(messages) || messages.length === 0) return json(res, 400, { error: 'Escribe algo para empezar la conversación.' });
  const auth = await authenticatedUser(req);
  if (!auth.user) return json(res, auth.status || 503, { error: auth.error });

  const contents = messages.slice(-16).map(({ role, content }) => ({ role: role === 'assistant' ? 'model' : 'user', parts: [{ text: String(content).slice(0, 4000) }] }));
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const requestStarted = Date.now();
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  const emit = event => res.write(`data: ${JSON.stringify(event)}\n\n`);
  emit({ type: 'status', text: 'Conectado. Preparando la conversación…' });
  console.log(`[chat ${requestId}] started; ${models.length} model(s) configured`);

  let lastError;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const attemptStarted = Date.now();
    let lastWaitLog = 0;
    emit({ type: 'attempt', model, number: i + 1, total: models.length });
    console.log(`[chat ${requestId}] trying ${model} (${i + 1}/${models.length})`);
    const waitTimer = setInterval(() => {
      const elapsedMs = Date.now() - attemptStarted;
      if (!res.destroyed && !res.writableEnded) emit({ type: 'waiting', model, elapsedMs });
      if (elapsedMs - lastWaitLog >= 5000) {
        lastWaitLog = elapsedMs;
        console.log(`[chat ${requestId}] still waiting on ${model} (${(elapsedMs / 1000).toFixed(0)}s)`);
      }
    }, 1000);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: `Eres Camille, profesora amable de francés conversacional. Contexto: ${scenario}. Nivel: ${level}. Habla principalmente en francés natural, adaptado al nivel, con respuestas breves que inviten a continuar. Si comete un error, responde primero a la idea y añade una corrección breve en español con “✍️ Mejor: …” solo cuando sea útil. Haz una pregunta de seguimiento. No traduzcas todo.` }] },
          contents,
          generationConfig: { temperature: 0.8, maxOutputTokens: 350 }
        })
      });
      const data = await response.json();
      clearInterval(waitTimer);
      const attemptDurationMs = Date.now() - attemptStarted;
      if (!response.ok) {
        const canTryNext = retryableStatus.has(response.status) && i < models.length - 1;
        lastError = data?.error?.message || `Gemini respondió con estado ${response.status}`;
        console.warn(`[chat ${requestId}] ${model} returned HTTP ${response.status} after ${attemptDurationMs}ms`);
        if (canTryNext) {
          emit({ type: 'retry', model, nextModel: models[i + 1], status: response.status, durationMs: attemptDurationMs, reason: lastError });
          continue;
        }
        break;
      }
      const reply = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
      if (!reply) throw new Error('Gemini no devolvió una respuesta de texto.');
      const durationMs = Date.now() - requestStarted;
      console.log(`[chat ${requestId}] ${model} succeeded in ${durationMs}ms`);
      emit({ type: 'complete', reply, model, fallback: i > 0, durationMs, attempts: i + 1 });
      return res.end();
    } catch (error) {
      clearInterval(waitTimer);
      const attemptDurationMs = Date.now() - attemptStarted;
      lastError = error.message;
      console.warn(`[chat ${requestId}] ${model} failed after ${attemptDurationMs}ms: ${error.message}`);
      if (i < models.length - 1) {
        emit({ type: 'retry', model, nextModel: models[i + 1], durationMs: attemptDurationMs, reason: error.message });
        continue;
      }
    }
  }
  const error = `No hubo respuesta de Gemini tras intentar ${models.length} modelo(s). ${lastError || ''}`.trim();
  console.error(`[chat ${requestId}] failed after ${Date.now() - requestStarted}ms`);
  emit({ type: 'error', text: error, attempts: models.length });
  return res.end();
}

export async function speechHandler(req, res) {
  if (req.method && req.method !== 'POST') return json(res, 405, { error: 'Usa POST para generar audio.' });
  let body;
  try { body = requestBody(req); }
  catch { return json(res, 400, { error: 'El cuerpo de la solicitud no es JSON válido.' }); }
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 1200) : '';
  const voice = studioVoices.has(body.voice) ? body.voice : 'Achird';
  if (!process.env.GEMINI_API_KEY) return json(res, 503, { error: 'Falta configurar GEMINI_API_KEY en las variables de Vercel.' });
  if (!text) return json(res, 400, { error: 'No hay texto para convertir en voz.' });
  const auth = await authenticatedUser(req);
  if (!auth.user) return json(res, auth.status || 503, { error: auth.error });
  try {
    let lastError;
    for (const [index, model] of ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts'].entries()) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ text, speech_metadata: { style: 'Casual, friendly French conversation.' } }] }],
          generationConfig: { responseModalities: ['AUDIO'], speechConfig: { languageCode: 'fr-FR', voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } }
        })
      });
      const data = await response.json();
      if (!response.ok) {
        lastError = data?.error?.message || `Gemini respondió con estado ${response.status}`;
        if (retryableStatus.has(response.status) && index === 0) continue;
        return json(res, response.status, { error: retryableStatus.has(response.status) ? 'Gemini TTS está ocupado o alcanzó su cuota gratuita.' : lastError });
      }
      const audioPart = data.candidates?.[0]?.content?.parts?.find(part => part.inlineData?.data)?.inlineData;
      if (!audioPart?.data) return json(res, 502, { error: 'Gemini no devolvió audio. Intenta de nuevo.' });
      res.statusCode = 200;
      res.setHeader('Content-Type', audioPart.mimeType || 'audio/wav');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-TTS-Model', model);
      return res.end(Buffer.from(audioPart.data, 'base64'));
    }
    return json(res, 502, { error: lastError || 'No se pudo generar el audio.' });
  } catch (error) {
    return json(res, 502, { error: `No pude conectar con Gemini TTS. ${error.message}` });
  }
}
