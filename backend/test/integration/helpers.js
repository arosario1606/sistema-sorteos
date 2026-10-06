import jwt from 'jsonwebtoken';
import prisma from '../../src/config/prisma.js';
import { createApp } from '../../src/app.js';

// Estas pruebas BORRAN todas las tablas del esquema: solo corren contra un esquema de pruebas.
if (!/schema=sorteos_test\b/.test(process.env.DATABASE_URL ?? '')) {
  throw new Error('Las pruebas de integración exigen DATABASE_URL con ?schema=sorteos_test');
}

export const SECRET = 'secreto-de-prueba';
process.env.SERVICES_SECRET_KEY = SECRET;

export { prisma };

export const token = (user, opts = {}) =>
  jwt.sign({ cedula: null, active: true, ...user }, SECRET, { expiresIn: '5m', ...opts });

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Winner","Participant","Sorteos","Department_quota","Branch_group_detail","Branch_group",'
    + '"User_branch_permission","Sede","Department","Employee" RESTART IDENTITY CASCADE',
  );
}

export function startServer() {
  return new Promise((resolve) => {
    const server = createApp().listen(0, () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

export function client(url) {
  const call = async (method, path, { tk, body, csv } = {}) => {
    const headers = {};
    if (tk) headers['x-auth-token'] = tk;
    let payload;
    if (csv !== undefined) {
      payload = new FormData();
      payload.append('archivo', new Blob([csv], { type: 'text/csv' }), 'datos.csv');
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${url}/api/lottery${path}`, { method, headers, body: payload });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  return {
    get: (p, tk) => call('GET', p, { tk }),
    post: (p, tk, body) => call('POST', p, { tk, body }),
    upload: (p, tk, csv) => call('POST', p, { tk, csv }),
  };
}
