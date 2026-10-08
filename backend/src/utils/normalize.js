// Clave comparable: mayúsculas, sin tildes y con espacios/guiones bajos unificados.
export function normalizeKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim()
    .replace(/[\s_]+/g, '_');
}

// Deja solo letras y números: "28.624.356-1" -> "286243561" (no se permiten guiones en Employee).
export function normalizeCedula(value) {
  return String(value ?? '').replace(/[^0-9A-Za-z]/g, '');
}

export function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}

// "SI"/"NO" -> true/false; cualquier otro valor -> null
export function parseSiNo(value) {
  const v = normalizeKey(value);
  if (v === 'SI') return true;
  if (v === 'NO') return false;
  return null;
}
