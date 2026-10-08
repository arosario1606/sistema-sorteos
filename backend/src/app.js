import express from 'express';
import { authenticate } from './middleware/auth.js';
import lottery from './routes/lottery.js';

// Sin CORS: el navegador solo habla con el gateway de la intranet (mismo origen).
export function createApp() {
  const app = express();
  app.use(express.json());

  // Sin autenticación: para el healthcheck del contenedor (solo red interna).
  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.use('/api/lottery', authenticate, lottery);
  app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.status) return res.status(err.status).json({ error: err.message, ...err.extra });
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'El archivo supera 5 MB' });
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  });

  return app;
}
