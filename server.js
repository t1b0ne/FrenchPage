import express from 'express';
import { chatHandler, healthHandler, speechHandler } from './lib/api-handlers.js';

const app = express();
app.use(express.json({ limit: '1mb' }));
const PORT = process.env.PORT || 3001;

app.get('/api/health', healthHandler);
app.post('/api/chat', chatHandler);
app.post('/api/speech', speechHandler);

app.listen(PORT, () => console.log(`Parlez API lista en http://localhost:${PORT}`));
