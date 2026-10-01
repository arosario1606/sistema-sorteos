// src/app.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Endpoint de prueba para verificar conectividad
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend del Sistema de Sorteos iniciado correctamente' });
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});