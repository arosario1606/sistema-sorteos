// src/app.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { authenticate } from './middleware/auth.js';
import catalogos from './routes/catalogos.js';
import sorteos from './routes/sorteos.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Endpoint de prueba para verificar conectividad
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend del Sistema de Sorteos iniciado correctamente' });
});

app.use('/api', authenticate);
app.use('/api', catalogos);
app.use('/api/sorteos', sorteos);

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ error: err.message, ...err.extra });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'El archivo supera 5 MB' });
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
