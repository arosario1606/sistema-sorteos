-- =====================================================================================
-- Vistas que permiten al módulo de Sorteos LEER (sin copiar) las sedes y los usuarios de la intranet.
--
--   sorteos.v_sede   <- intranet_api_auth_manager."Locations"   (id, name, is_active)
--   sorteos.v_users  <- intranet_api_auth_manager."Users"       (id, name, lastname, email, active)
--
-- POR QUÉ ES UNA VISTA Y NO UN PERMISO DIRECTO: "Users" guarda la contraseña (password) y la cédula. Una vista
-- se ejecuta con los permisos de QUIEN LA CREA, así que el rol del módulo (sorteos_app) solo puede leer estas
-- columnas y nunca toca la tabla "Users".
--
-- QUIÉN LA EJECUTA: un usuario que ya pueda leer intranet_api_auth_manager (p. ej. el administrador de la base).
--   * No se puede incluir en las migraciones del módulo: sorteos_app no puede leer "Users" y por tanto no podría crearla.
--   * El usuario que la ejecute NO debe eliminarse ni perder el permiso de lectura sobre "Users"/"Locations":
--     las vistas dejarían de funcionar.
-- CUÁNDO: después de crear el esquema "sorteos" (ENTREGA.md, paso 2) y ANTES de arrancar el servicio.
-- Se puede ejecutar más de una vez. Si el esquema del módulo no se llama "sorteos", cambie el prefijo abajo.
-- Ejecutar COMPLETO como script (en DBeaver: Alt+X).
-- =====================================================================================
BEGIN;

CREATE OR REPLACE VIEW sorteos.v_sede AS
SELECT l.id, l.name, COALESCE(l.is_active, true) AS is_active
FROM intranet_api_auth_manager."Locations" l;

CREATE OR REPLACE VIEW sorteos.v_users AS
SELECT u.id, u.name, u.lastname, u.email, COALESCE(u.active, false) AS active
FROM intranet_api_auth_manager."Users" u;

-- Permiso de lectura para el rol del módulo. Si el rol no existe (p. ej. una copia local), solo avisa.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sorteos_app') THEN
    GRANT SELECT ON sorteos.v_sede, sorteos.v_users TO sorteos_app;
  ELSE
    RAISE NOTICE 'El rol sorteos_app no existe: no se concedió ningún permiso (correcto en una copia local).';
  END IF;
END $$;

-- Comprobación: deben aparecer las dos vistas y devolver filas.
SELECT 'v_sede' AS vista, count(*) AS filas FROM sorteos.v_sede
UNION ALL
SELECT 'v_users', count(*) FROM sorteos.v_users;

COMMIT;
