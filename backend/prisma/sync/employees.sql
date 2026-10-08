-- Copia nombre, apellido y estado de los empleados de la intranet a la tabla Employee de este módulo.
-- La cédula se limpia igual que en los CSV (solo letras y números); si dos filas colapsan a la misma
-- cédula se toma la activa. No se copian fecha de nacimiento ni correo (el sorteo no los usa).
-- Repetible: actualiza los existentes y agrega los nuevos; no borra ninguno.
INSERT INTO "Employee" (cedula, names, last_name, "isActive", "createdAt", "updatedAt")
SELECT DISTINCT ON (e.c)
  e.c,
  left(upper(regexp_replace(btrim(e.names), '\s+', ' ', 'g')), 100),
  left(upper(regexp_replace(btrim(e.lastnames), '\s+', ' ', 'g')), 100),
  COALESCE(e."isActive", true),
  now(), now()
FROM (
  SELECT regexp_replace(cedula, '[^0-9A-Za-z]', '', 'g') AS c, names, lastnames, "isActive"
  FROM "{{EMPLOYEES_SCHEMA}}"."Employee"
) e
WHERE e.c <> ''
ORDER BY e.c, e."isActive" DESC NULLS LAST
ON CONFLICT (cedula) DO UPDATE
  SET names = EXCLUDED.names, last_name = EXCLUDED.last_name, "isActive" = EXCLUDED."isActive", "updatedAt" = now();
