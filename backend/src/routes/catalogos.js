import { Router } from 'express';
import prisma from '../config/prisma.js';
import { asyncHandler } from '../utils/http.js';

const router = Router();

// Usuario autenticado y sus sedes permitidas
router.get('/me', asyncHandler(async (req, res) => {
  const sedes = await prisma.sede.findMany({ where: { idSede: { in: req.user.sedeIds } }, orderBy: { idSede: 'asc' } });
  res.json({ userCode: req.user.code, sedes });
}));

router.get('/sedes', asyncHandler(async (req, res) => {
  res.json(await prisma.sede.findMany({ where: { idSede: { in: req.user.sedeIds } }, orderBy: { idSede: 'asc' } }));
}));

export default router;
