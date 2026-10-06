// Genera un x-auth-token de PRUEBA con la misma forma que el que firma el gateway de la intranet.
// Solo para desarrollo local: usa SERVICES_SECRET_KEY de backend/.env (debe ser un valor de prueba).
// Uso: npm run dev:token [id] [email]   (por defecto DEV_USER_ID / DEV_USER_EMAIL)
import 'dotenv/config';
import jwt from 'jsonwebtoken';

const secret = process.env.SERVICES_SECRET_KEY;
const id = Number(process.argv[2] ?? process.env.DEV_USER_ID);
const email = process.argv[3] ?? process.env.DEV_USER_EMAIL;
if (!secret || !Number.isInteger(id) || !email) {
  console.error('Faltan SERVICES_SECRET_KEY, DEV_USER_ID o DEV_USER_EMAIL en backend/.env');
  process.exit(1);
}
console.log(jwt.sign({ id, email, cedula: null, active: true }, secret, { expiresIn: '8h' }));
