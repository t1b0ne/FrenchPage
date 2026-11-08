import dotenv from 'dotenv';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });
const app = express();
app.use(express.json({ limit: '1mb' }));
const PORT = process.env.PORT || 3001;
const models = (process.env.GEMINI_MODELS || 'gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash-lite').split(',').map(x => x.trim()).filter(Boolean);
const studioVoices = new Set(['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat']);
app.get('/api/health', (_req, res) => res.json({ configured: Boolean(process.env.GEMINI_API_KEY), models }));
app.post('/api/chat', async (req, res) => {
  const { messages = [], level = 'A2', scenario = 'Café parisien' } = req.body || {};
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'Falta configurar GEMINI_API_KEY en el archivo .env.' });
  if (!Array.isArray(messages) || messages.length === 0) return res.status(400).json({ error: 'Escribe algo para empezar la conversación.' });
  const contents = messages.slice(-16).map(({ role, content }) => ({ role: role === 'assistant' ? 'model' : 'user', parts: [{ text: String(content).slice(0, 4000) }] }));
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const requestStarted = Date.now();
  res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
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
      emit({ type: 'waiting', model, elapsedMs });
      if (elapsedMs - lastWaitLog >= 5000) {
        lastWaitLog = elapsedMs;
        console.log(`[chat ${requestId}] still waiting on ${model} (${(elapsedMs / 1000).toFixed(0)}s)`);
      }
    }, 1000);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system_instruction: { parts: [{ text: `Eres Camille, profesora amable de francés conversacional. Contexto: ${scenario}. Nivel: ${level}. Habla principalmente en francés natural, adaptado al nivel, con respuestas breves que inviten a continuar. Si comete un error, responde primero a la idea y añade una corrección breve en español con “✍️ Mejor: …” solo cuando sea útil. Haz una pregunta de seguimiento. No traduzcas todo.` }] }, contents, generationConfig: { temperature: 0.8, maxOutputTokens: 350 } }) });
      const data = await response.json();
      clearInterval(waitTimer);
      const attemptDurationMs = Date.now() - attemptStarted;
      if (!response.ok) {
        const canTryNext = [403, 404, 429, 500, 502, 503, 504].includes(response.status) && i < models.length - 1;
        lastError = data?.error?.message || `Gemini respondió con estado ${response.status}`;
        console.warn(`[chat ${requestId}] ${model} returned HTTP ${response.status} after ${attemptDurationMs}ms`);
        if (canTryNext) {
          emit({ type: 'retry', model, nextModel: models[i + 1], status: response.status, durationMs: attemptDurationMs, reason: lastError });
          continue;
        }
        break;
      }
      const reply = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
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
  res.end();
});
app.post('/api/speech', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 1200) : '';
  const voice = studioVoices.has(req.body?.voice) ? req.body.voice : 'Achird';
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'Falta configurar GEMINI_API_KEY en el archivo .env.' });
  if (!text) return res.status(400).json({ error: 'No hay texto para convertir en voz.' });
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
        if ([429, 502, 503, 504].includes(response.status) && index === 0) continue;
        return res.status(response.status).json({ error: [429, 502, 503, 504].includes(response.status) ? 'Gemini TTS está ocupado o alcanzó su cuota gratuita.' : lastError });
      }
      const audioPart = data.candidates?.[0]?.content?.parts?.find(part => part.inlineData?.data)?.inlineData;
      if (!audioPart?.data) return res.status(502).json({ error: 'Gemini no devolvió audio. Intenta de nuevo.' });
      res.set('Content-Type', audioPart.mimeType || 'audio/wav');
      res.set('Cache-Control', 'no-store');
      res.set('X-TTS-Model', model);
      return res.send(Buffer.from(audioPart.data, 'base64'));
    }
    return res.status(502).json({ error: lastError || 'No se pudo generar el audio.' });
  } catch (error) {
    res.status(502).json({ error: `No pude conectar con Gemini TTS. ${error.message}` });
  }
});

if (process.env.NODE_ENV === 'production') app.use(express.static(path.join(__dirname, 'dist')));
app.listen(PORT, () => console.log(`Parlez API lista en http://localhost:${PORT}`));
