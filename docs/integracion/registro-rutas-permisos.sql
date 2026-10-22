-- =====================================================================================
-- Registro del módulo «Permisos por Sedes» en el esquema intranet_api_auth_manager.
-- Se ejecuta UNA vez por entorno (las rutas anteriores del módulo de Sorteos ya están registradas). Hace tres cosas:
--   1) Registra las 4 rutas de backend nuevas (/api/lottery/permisos/...) bajo la ruta padre /lottery-service.
--   2) Registra la pantalla «Permisos por Sedes» (ruta de frontend /lotteryperm) en la MISMA sección del menú
--      que la pantalla «Registrar Sorteo» (/lotteryreg), o sea, dentro de «Sorteos».
--   3) Da permiso sobre esas 5 rutas SOLO al grupo ADMINISTRADOR. El grupo SORTEOS no ve la pantalla ni puede llamar
--      a esos endpoints: quien los usa puede dar acceso a cualquier sede a cualquier usuario.
--
-- No usa números fijos (ids): todo se busca por nombre o por ruta, así que sirve en cualquier entorno.
-- Se puede ejecutar más de una vez: no duplica nada. Si falta algo que debería existir, se detiene con un
-- mensaje claro y no cambia nada (todo va en una transacción).
-- Ejecutar COMPLETO como script (en DBeaver: Alt+X).
-- Para quitar el grupo o agregar otro, cambie el nombre en la sección 1.
-- =====================================================================================
BEGIN;

-- ---- 0) Comprobaciones previas -------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM intranet_api_auth_manager."Permissions_groups" WHERE group_name = 'ADMINISTRADOR') THEN
    RAISE EXCEPTION 'No existe el grupo de permisos ADMINISTRADOR';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM intranet_api_auth_manager."Routes_backend" WHERE route_path = '/lottery-service') THEN
    RAISE EXCEPTION 'Falta la ruta padre /lottery-service: ejecute antes el registro de rutas del módulo de Sorteos';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM intranet_api_auth_manager."Routes_frontend_child" WHERE route_path = '/lotteryreg') THEN
    RAISE EXCEPTION 'Falta la pantalla /lotteryreg: de ella se toma la sección del menú donde irá «Permisos por Sedes»';
  END IF;
END $$;

-- ---- 1) Grupo que tendrá acceso ------------------------------------------------------------------
CREATE TEMP TABLE _grupos_permisos (id integer PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _grupos_permisos (id)
SELECT id FROM intranet_api_auth_manager."Permissions_groups" WHERE group_name IN ('ADMINISTRADOR');

-- ---- 2) Rutas de backend nuevas ------------------------------------------------------------------
INSERT INTO intranet_api_auth_manager."Routes_backend_child" (route_name, route_path, "routes_backendId")
SELECT v.route_name, v.route_path, p.id
FROM (VALUES
    ('Sorteos - Permisos: buscar usuarios', '/api/lottery/permisos/usuarios'),
    ('Sorteos - Permisos: listar sedes', '/api/lottery/permisos/sedes'),
    ('Sorteos - Permisos: ver usuario', '/api/lottery/permisos/usuario'),
    ('Sorteos - Permisos: guardar usuario', '/api/lottery/permisos/usuario/guardar')
) AS v(route_name, route_path)
CROSS JOIN intranet_api_auth_manager."Routes_backend" p
WHERE p.route_path = '/lottery-service'
  AND NOT EXISTS (
    SELECT 1 FROM intranet_api_auth_manager."Routes_backend_child" c WHERE c.route_path = v.route_path);

-- ---- 3) Pantalla del menú: misma sección que /lotteryreg ------------------------------------------
-- sequence = 1 (las otras tres pantallas tienen 0): así queda de última en el menú de «Sorteos».
INSERT INTO intranet_api_auth_manager."Routes_frontend_child"
  (route_name, active, "routes_frontendId", route_path, type, visible, "powerBi", url, "routes_bi_categoryCategory", sequence)
SELECT 'Permisos por Sedes', true, ref."routes_frontendId", '/lotteryperm', false, true, false, NULL, NULL, 1
FROM intranet_api_auth_manager."Routes_frontend_child" ref
WHERE ref.route_path = '/lotteryreg'
  AND NOT EXISTS (
    SELECT 1 FROM intranet_api_auth_manager."Routes_frontend_child" c WHERE c.route_path = '/lotteryperm');

-- ---- 4) Permisos del grupo: ruta padre (por si faltara) ------------------------------------------
INSERT INTO intranet_api_auth_manager."Permissions_groups_routes_entity" ("permissions_groupsId", "routes_backendId")
SELECT g.id, p.id
FROM _grupos_permisos g
CROSS JOIN intranet_api_auth_manager."Routes_backend" p
WHERE p.route_path = '/lottery-service'
  AND NOT EXISTS (
    SELECT 1 FROM intranet_api_auth_manager."Permissions_groups_routes_entity" e
    WHERE e."permissions_groupsId" = g.id AND e."routes_backendId" = p.id);

-- ---- 5) Permisos del grupo: las 4 rutas de backend nuevas ----------------------------------------
INSERT INTO intranet_api_auth_manager."Permissions_groups_routes_child_entity" ("permissions_groupsId", "routes_backend_childId")
SELECT g.id, c.id
FROM _grupos_permisos g
JOIN intranet_api_auth_manager."Routes_backend_child" c ON c.route_path LIKE '/api/lottery/permisos/%'
WHERE NOT EXISTS (
    SELECT 1 FROM intranet_api_auth_manager."Permissions_groups_routes_child_entity" e
    WHERE e."permissions_groupsId" = g.id AND e."routes_backend_childId" = c.id);

-- ---- 6) Permisos del grupo: la pantalla del menú -------------------------------------------------
INSERT INTO intranet_api_auth_manager."Permissions_groups_routes_child_entity" ("permissions_groupsId", "routes_frontend_childId")
SELECT g.id, c.id
FROM _grupos_permisos g
JOIN intranet_api_auth_manager."Routes_frontend_child" c ON c.route_path = '/lotteryperm'
WHERE NOT EXISTS (
    SELECT 1 FROM intranet_api_auth_manager."Permissions_groups_routes_child_entity" e
    WHERE e."permissions_groupsId" = g.id AND e."routes_frontend_childId" = c.id);

-- ---- 7) Resumen: cada valor debe coincidir con el esperado ---------------------------------------
SELECT
  (SELECT count(*) FROM intranet_api_auth_manager."Routes_backend_child" WHERE route_path LIKE '/api/lottery/permisos/%') AS rutas_backend_esperado_4,
  (SELECT count(*) FROM intranet_api_auth_manager."Routes_frontend_child" WHERE route_path = '/lotteryperm')              AS pantalla_esperado_1,
  (SELECT count(*) FROM intranet_api_auth_manager."Permissions_groups_routes_child_entity" e
     JOIN _grupos_permisos g ON g.id = e."permissions_groupsId"
     LEFT JOIN intranet_api_auth_manager."Routes_backend_child" b ON b.id = e."routes_backend_childId"
     LEFT JOIN intranet_api_auth_manager."Routes_frontend_child" f ON f.id = e."routes_frontend_childId"
   WHERE b.route_path LIKE '/api/lottery/permisos/%' OR f.route_path = '/lotteryperm')                                      AS permisos_esperado_5,
  (SELECT count(*) FROM intranet_api_auth_manager."Permissions_groups_routes_child_entity" e
     JOIN intranet_api_auth_manager."Permissions_groups" pg ON pg.id = e."permissions_groupsId"
     LEFT JOIN intranet_api_auth_manager."Routes_backend_child" b ON b.id = e."routes_backend_childId"
     LEFT JOIN intranet_api_auth_manager."Routes_frontend_child" f ON f.id = e."routes_frontend_childId"
   WHERE pg.group_name <> 'ADMINISTRADOR' AND (b.route_path LIKE '/api/lottery/permisos/%' OR f.route_path = '/lotteryperm')) AS otros_grupos_esperado_0;

COMMIT;
