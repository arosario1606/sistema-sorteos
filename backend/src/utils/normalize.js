// Clave comparable: mayúsculas, sin tildes y con espacios/guiones bajos unificados.
export function normalizeKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[\s_]+/g, '_')
    .trim();
}

export function normalizeCedula(value) {
  return String(value ?? '').replace(/[\s.]/g, '').trim();
}

export function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}

// "SI"/"NO" -> 1/0; cualquier otro valor -> null
export function parseSiNo(value) {
  const v = normalizeKey(value);
  if (v === 'SI') return 1;
  if (v === 'NO') return 0;
  return null;
}
