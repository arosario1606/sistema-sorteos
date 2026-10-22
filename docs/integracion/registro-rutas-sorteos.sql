-- =====================================================================================
-- Registro de las rutas del módulo de Sorteos en el esquema intranet_api_auth_manager
-- Equivale a seed-rutas-sorteos.js, pero en SQL y SIN ids fijos (busca todo por ruta).
-- Se puede ejecutar más de una vez: no duplica nada.
-- Ejecutar COMPLETO como script (en DBeaver: Alt+X), sobre la copia de la base. Si algo falla: ROLLBACK;
--
-- IMPORTANTE: da a los grupos SORTEOS y ADMINISTRADOR las 12 rutas del servicio de sorteos y NADA MÁS. Las 4 rutas
-- /api/lottery/permisos/... (pantalla «Permisos por Sedes») se excluyen a propósito y solo las asigna
-- registro-rutas-permisos.sql al grupo ADMINISTRADOR: quien las llama puede dar cualquier sede a cualquier usuario.
-- Orden en un entorno nuevo: 1) este script, 2) registro-rutas-permisos.sql.
-- =====================================================================================
BEGIN;

-- ---- 1) Grupos de permisos que usarán Sorteos --------------------------------------------------
-- Son los dos grupos que hoy tienen asignadas las pantallas Registrar Sorteo, Listar Asistencia y
-- Ejecutar Sorteo del menú (rutas de frontend 65, 66 y 67). Se buscan por NOMBRE, no por número, para que el
-- script funcione aunque los ids sean distintos en otro entorno.
-- Para agregar o quitar grupos, edita la lista de nombres. Si la lista queda vacía, solo se registran las rutas.
CREATE TEMP TABLE _grupos_sorteos (id integer PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _grupos_sorteos (id)
SELECT id FROM intranet_api_auth_manager."Permissions_groups"
WHERE group_name IN ('ADMINISTRADOR', 'SORTEOS');

-- ---- 2) Ruta padre -------------------------------------------------------------------------
INSERT INTO intranet_api_auth_manager."Routes_backend" (route_name, route_path)
SELECT 'API Sorteos', '/lottery-service'
WHERE NOT EXISTS (
  SELECT 1 FROM intranet_api_auth_manager."Routes_backend" WHERE route_path = '/lottery-service');

-- ---- 3) Rutas hijas (una por endpoint) ---------------------------------------------------------
INSERT INTO intranet_api_auth_manager."Routes_backend_child" (route_name, route_path, "routes_backendId")
SELECT v.route_name, v.route_path, p.id
FROM (VALUES
    ('Sorteos - Usuario y sedes', '/api/lottery/me'),
    ('Sorteos - Listar sorteos', '/api/lottery/sorteos'),
    ('Sorteos - Crear sorteo', '/api/lottery/sorteos/create'),
    ('Sorteos - Detalle de sorteo', '/api/lottery/sorteos/detail'),
    ('Sorteos - Finalizar sorteo', '/api/lottery/sorteos/finalize'),
    ('Sorteos - Cargar participantes', '/api/lottery/participants/upload'),
    ('Sorteos - Cargar cupos', '/api/lottery/quotas/upload'),
    ('Sorteos - Listar asistencia', '/api/lottery/attendance/list'),
    ('Sorteos - Marcar asistencia', '/api/lottery/attendance/mark'),
    ('Sorteos - Marcar asistencia de todos', '/api/lottery/attendance/mark-all'),
    ('Sorteos - Ejecutar sorteo', '/api/lottery/draw/execute'),
    ('Sorteos - Ver ganadores', '/api/lottery/draw/winners')
) AS v(route_name, route_path)
CROSS JOIN intranet_api_auth_manager."Routes_backend" p
WHERE p.route_path = '/lottery-service'
  AND NOT EXISTS (
    SELECT 1 FROM intranet_api_auth_manager."Routes_backend_child" c WHERE c.route_path = v.route_path);

-- ---- 4) Permisos: ruta padre para cada grupo ----------------------------------------------
INSERT INTO intranet_api_auth_manager."Permissions_groups_routes_entity" ("permissions_groupsId", "routes_backendId")
SELECT g.id, p.id
FROM _grupos_sorteos s
JOIN intranet_api_auth_manager."Permissions_groups" g ON g.id = s.id
CROSS JOIN intranet_api_auth_manager."Routes_backend" p
WHERE p.route_path = '/lottery-service'
  AND NOT EXISTS (
    SELECT 1 FROM intranet_api_auth_manager."Permissions_groups_routes_entity" e
    WHERE e."permissions_groupsId" = g.id AND e."routes_backendId" = p.id);

-- ---- 5) Permisos: cada ruta hija para cada grupo -----------------------------------------------
INSERT INTO intranet_api_auth_manager."Permissions_groups_routes_child_entity" ("permissions_groupsId", "routes_backend_childId")
SELECT g.id, c.id
FROM _grupos_sorteos s
JOIN intranet_api_auth_manager."Permissions_groups" g ON g.id = s.id
JOIN intranet_api_auth_manager."Routes_backend_child" c
  ON c.route_path LIKE '/api/lottery/%' AND c.route_path NOT LIKE '/api/lottery/permisos/%'
WHERE NOT EXISTS (
    SELECT 1 FROM intranet_api_auth_manager."Permissions_groups_routes_child_entity" e
    WHERE e."permissions_groupsId" = g.id AND e."routes_backend_childId" = c.id);

-- ---- 6) Resumen antes de confirmar ------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM intranet_api_auth_manager."Routes_backend" WHERE route_path = '/lottery-service')                AS padre_esperado_1,
  (SELECT count(*) FROM intranet_api_auth_manager."Routes_backend_child"
     WHERE route_path LIKE '/api/lottery/%' AND route_path NOT LIKE '/api/lottery/permisos/%')                  AS hijas_esperado_12,
  (SELECT count(*) FROM _grupos_sorteos)                                                                         AS grupos_encontrados_esperado_2;

COMMIT;
