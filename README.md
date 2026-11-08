# Parlez

Una plataforma ligera para practicar conversación en francés con situaciones cotidianas, dictado por voz, voz generada por Gemini y respuestas conversacionales.

## Requisitos

- Node.js 20 o posterior.
- Una clave de Gemini API de Google AI Studio.

## Empezar

1. Instala las dependencias con `npm install`.
2. Copia `.env.example` como `.env` y añade la clave de Gemini y los datos públicos de tu proyecto Supabase.
3. Ejecuta `npm run dev`.
4. Abre la dirección local que muestra Vite (normalmente `http://localhost:5173`).

La API queda en `http://localhost:3001`. `GEMINI_API_KEY` permanece en el servidor; la URL y publishable key de Supabase se usan en el navegador y quedan protegidas por RLS.

## Despliegue en Vercel

La carpeta raíz `api/` contiene funciones Vercel para chat, voz y diagnóstico; `server.js` se usa para desarrollo local. En los ajustes del proyecto Vercel configura estas variables para Production (y Preview si corresponde): `GEMINI_API_KEY`, `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. Añade también `GEMINI_MODELS` solo si quieres cambiar el orden predeterminado. Después de agregar o cambiar variables, crea un nuevo deployment. `/api/health` muestra si Gemini y Supabase quedaron configurados, sin revelar sus claves.

## Supabase: acceso y persistencia

1. Crea un proyecto Supabase y copia su Project URL y publishable key (o anon key) en `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` dentro de `.env`.
2. Ejecuta [`20261107000000_parlez_auth_and_practice.sql`](supabase/migrations/20261107000000_parlez_auth_and_practice.sql) desde el SQL Editor de Supabase. Crea perfiles, sesiones y mensajes con políticas RLS por usuario, además del perfil automático al registrarse. También puedes aplicar la migración con `supabase db push` si tienes instalada y enlazada la CLI.
3. Habilita el proveedor Email en Supabase Auth y define la URL local `http://localhost:5173` como URL del sitio para confirmaciones.
4. Reinicia `npm run dev`, crea tu cuenta y confirma el correo si Supabase lo solicita.

La pantalla de acceso consulta y conserva la sesión de Supabase; sin sesión no monta la práctica. El servidor vuelve a verificar el token antes de aceptar solicitudes de chat o voz. El historial de mensajes se guarda con el propietario autenticado y RLS impide que otros usuarios lo lean. Por petición, `supabase/migrations/` está excluido de Git en este proyecto.

## Audio y coste

El botón «Escuchar · Gemini TTS» genera la voz bajo demanda con `gemini-3.8-flash-tts` y la guarda en memoria para repetirla sin otra solicitud. Si el modelo está ocupado, prueba `gemini-3.8-flash-lite-tts`; si se alcanza la cuota, la app usa la voz francesa integrada del navegador sin otra llamada a Gemini. El selector ofrece las voces predefinidas de Google AI Studio y conserva la preferencia en este navegador. La tarifa oficial muestra ambos modelos como gratuitos en el nivel gratuito de Gemini API, sujeto a sus límites. El micrófono usa el reconocimiento de voz integrado del navegador.

Durante el chat, el registro visible muestra qué modelo se intenta, cuánto tarda, y cuándo se cambia al siguiente. El servidor también imprime esos intentos en su terminal. Por defecto el chat prueba `gemini-3.8-flash`, `gemini-3.6-flash` y `gemini-3.5-flash-lite`, en ese orden; `GEMINI_MODELS` puede cambiar esa lista.

## Cambio automático de modelo

El servidor intenta los modelos indicados en `GEMINI_MODELS`, en orden. Si un modelo está saturado o devuelve un error temporal (429, 502, 503 o 504), prueba el siguiente. Puedes cambiar la lista en `.env`; usa IDs habilitados para tu proyecto y región.

## Voz

El botón del micrófono usa Web Speech Recognition en francés de Francia. La disponibilidad del dictado depende del navegador (Chrome y Edge suelen ofrecerlo). “Escuchar” genera audio con Gemini TTS; la voz del dispositivo es un respaldo si se alcanza la cuota.
