// Sincroniza datos de la intranet hacia las tablas de este módulo (misma base de datos, otro esquema).
// Uso: npm run sync:sedes | npm run sync:employees
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import prisma from '../src/config/prisma.js';

const JOBS = { sedes: 'sedes.sql', employees: 'employees.sql' };

// Los nombres de esquema no se pueden parametrizar: se validan antes de interpolarlos.
function schemaName(envVar, fallback) {
  const value = process.env[envVar] || fallback;
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error(`${envVar} inválido: "${value}"`);
  return value;
}

const job = process.argv[2];
if (!JOBS[job]) {
  console.error(`Uso: node prisma/sync.js <${Object.keys(JOBS).join('|')}>`);
  process.exit(1);
}

try {
  const sql = (await readFile(new URL(`./sync/${JOBS[job]}`, import.meta.url), 'utf8'))
    .replaceAll('{{AUTH_SCHEMA}}', schemaName('INTRANET_AUTH_SCHEMA', 'intranet_api_auth_manager'))
    .replaceAll('{{EMPLOYEES_SCHEMA}}', schemaName('INTRANET_EMPLOYEES_SCHEMA', 'intranet_employees_db'));
  const affected = await prisma.$executeRawUnsafe(sql);
  console.log(`sync:${job} listo (${affected} filas insertadas o actualizadas)`);
} finally {
  await prisma.$disconnect();
}
