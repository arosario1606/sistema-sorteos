import dotenv from 'dotenv';
import { createApp } from './app.js';

dotenv.config();

const PORT = process.env.PORT || 3000;
createApp().listen(PORT, () => {
  console.log(`Servicio de sorteos escuchando en el puerto ${PORT}`);
});
