-- Copia las sedes de la intranet (Locations) a la tabla Sede de este módulo.
-- Es repetible: actualiza el nombre pero NUNCA pisa `active`, para respetar las sedes desactivadas.
INSERT INTO "Sede" (id_sede, name, active, created_at, updated_at)
SELECT l.id, left(btrim(l.name), 150), COALESCE(l.is_active, true), now(), now()
FROM "{{AUTH_SCHEMA}}"."Locations" l
ON CONFLICT (id_sede) DO UPDATE SET name = EXCLUDED.name, updated_at = now();
