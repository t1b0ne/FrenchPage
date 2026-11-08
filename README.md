# Parlez

Una plataforma ligera para practicar conversación en francés con situaciones cotidianas, dictado por voz, voz generada por Gemini y respuestas conversacionales.

## Requisitos

- Node.js 20 o posterior.
- Una clave de Gemini API de Google AI Studio.

## Empezar

1. Instala las dependencias con `npm install`.
2. Copia `.env.example` como `.env` y añade tu clave en `GEMINI_API_KEY`.
3. Ejecuta `npm run dev`.
4. Abre la dirección local que muestra Vite (normalmente `http://localhost:5173`).

La API privada queda en `http://localhost:3001`. La clave nunca se envía al navegador.

## Audio y coste

El botón «Escuchar · Gemini TTS» genera la voz bajo demanda con `gemini-3.8-flash-tts` y la guarda en memoria para repetirla sin otra solicitud. Si el modelo está ocupado, prueba `gemini-3.8-flash-lite-tts`; si se alcanza la cuota, la app usa la voz francesa integrada del navegador sin otra llamada a Gemini. El selector ofrece las voces predefinidas de Google AI Studio y conserva la preferencia en este navegador. La tarifa oficial muestra ambos modelos como gratuitos en el nivel gratuito de Gemini API, sujeto a sus límites. El micrófono usa el reconocimiento de voz integrado del navegador.

Durante el chat, el registro visible muestra qué modelo se intenta, cuánto tarda, y cuándo se cambia al siguiente. El servidor también imprime esos intentos en su terminal. Por defecto el chat prueba `gemini-3.8-flash`, `gemini-3.6-flash` y `gemini-3.5-flash-lite`, en ese orden; `GEMINI_MODELS` puede cambiar esa lista.

## Cambio automático de modelo

El servidor intenta los modelos indicados en `GEMINI_MODELS`, en orden. Si un modelo está saturado o devuelve un error temporal (429, 502, 503 o 504), prueba el siguiente. Puedes cambiar la lista en `.env`; usa IDs habilitados para tu proyecto y región.

## Voz

El botón del micrófono usa Web Speech Recognition en francés de Francia. La disponibilidad del dictado depende del navegador (Chrome y Edge suelen ofrecerlo). “Escuchar” usa la voz francesa instalada en el dispositivo mediante Speech Synthesis.
