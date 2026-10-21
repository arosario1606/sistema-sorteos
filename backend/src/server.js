import dotenv from 'dotenv';
import { createApp } from './app.js';
import prisma from './config/prisma.js';

dotenv.config();

const PORT = process.env.PORT || 3000;
createApp().listen(PORT, async () => {
  console.log(`Servicio de sorteos escuchando en el puerto ${PORT}`);
  // Aviso temprano (sin impedir el arranque): sin las vistas de la intranet fallan «Permisos por Sedes», /me y crear sorteos.
  try {
    const [row] = await prisma.$queryRaw`SELECT to_regclass('v_sede') IS NOT NULL AS sede, to_regclass('v_users') IS NOT NULL AS users`;
    if (!row.sede || !row.users) {
      console.error('ATENCIÓN: faltan las vistas v_sede / v_users de la intranet. Ejecute docs/integracion/vistas-sorteos.sql (ver ENTREGA.md).');
    }
  } catch (err) {
    console.error('No se pudo comprobar las vistas de la intranet:', err.message);
  }
});
