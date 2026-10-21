import { readFile } from 'node:fs/promises';
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

// ---- Intranet simulada -------------------------------------------------------------------------------------
// En producción las sedes y los usuarios viven en intranet_api_auth_manager y el administrador crea las vistas con
// docs/integracion/vistas-sorteos.sql. Aquí se simulan con esquemas PROPIOS de prueba y se ejecuta ESE MISMO script
// (cambiando los nombres de esquema), de modo que también se prueba el script real.
export const AUTH_SCHEMA = 'sorteos_test_auth';
export const EMPLOYEES_SCHEMA = 'sorteos_test_employees';
const MODULE_SCHEMA = 'sorteos_test';

const readFirst = async (...rels) => {
  for (const rel of rels) {
    try {
      return await readFile(new URL(rel, import.meta.url), 'utf8');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  throw new Error(`No se encontró el archivo en: ${rels.join(', ')}`);
};

// Parte un script SQL en sentencias respetando los bloques $$ ... $$ (DO) y quitando BEGIN/COMMIT, comentarios y vacíos.
export function splitSql(text) {
  const out = [];
  let current = '';
  let inDollar = false;
  for (const line of text.split('\n')) {
    if (!inDollar && /^\s*--/.test(line)) continue;
    current += `${line}\n`;
    if ((line.match(/\$\$/g) ?? []).length % 2 === 1) inDollar = !inDollar;
    if (!inDollar && /;\s*$/.test(line)) {
      out.push(current.trim().replace(/;$/, ''));
      current = '';
    }
  }
  return out.filter((s) => s && !/^(BEGIN|COMMIT)$/i.test(s));
}

export async function dropIntranetStub() {
  await prisma.$executeRawUnsafe('DROP VIEW IF EXISTS v_users');
  await prisma.$executeRawUnsafe('DROP VIEW IF EXISTS v_sede');
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${AUTH_SCHEMA} CASCADE`);
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${EMPLOYEES_SCHEMA} CASCADE`);
}

export async function createIntranetViews() {
  const script = (await readFirst('../../../docs/integracion/vistas-sorteos.sql', '../../docs/integracion/vistas-sorteos.sql'))
    .replace(/\bsorteos\./g, `${MODULE_SCHEMA}.`)
    .replaceAll('intranet_api_auth_manager', AUTH_SCHEMA);
  for (const stmt of splitSql(script)) await prisma.$executeRawUnsafe(stmt);
}

// Carga la fixture (Locations, Users, Employee ficticios) y, si se pide, las vistas del módulo.
export async function loadIntranetStub({ views = true } = {}) {
  if (!AUTH_SCHEMA.startsWith('sorteos_test_') || !EMPLOYEES_SCHEMA.startsWith('sorteos_test_')) throw new Error('Esquema de prueba inválido');
  await prisma.$executeRawUnsafe('DROP VIEW IF EXISTS v_users');
  await prisma.$executeRawUnsafe('DROP VIEW IF EXISTS v_sede');
  const fixture = (await readFile(new URL('../fixtures/intranet_min.sql', import.meta.url), 'utf8'))
    .replaceAll('{{AUTH_SCHEMA}}', AUTH_SCHEMA)
    .replaceAll('{{EMPLOYEES_SCHEMA}}', EMPLOYEES_SCHEMA);
  for (const stmt of splitSql(fixture)) await prisma.$executeRawUnsafe(stmt);
  if (views) await createIntranetViews();
}

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Winner","Participant","Sorteos","Department_quota","Branch_group_detail","Branch_group",'
    + '"User_branch_permission","Sede","Department","Employee","Winner_history" RESTART IDENTITY CASCADE',
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
