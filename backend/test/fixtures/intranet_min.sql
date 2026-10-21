-- Réplica MÍNIMA y con datos FICTICIOS de las tablas de la intranet que usan las sincronizaciones.
-- Solo para pruebas. Reproduce tablas y columnas reales, pero en esquemas PROPIOS de prueba ({{...}} los
-- reemplaza sync.test.js por sorteos_test_*): NUNCA toca los esquemas reales de la intranet.
CREATE SCHEMA IF NOT EXISTS {{AUTH_SCHEMA}};
CREATE SCHEMA IF NOT EXISTS {{EMPLOYEES_SCHEMA}};

DROP TABLE IF EXISTS {{AUTH_SCHEMA}}."Locations";
CREATE TABLE {{AUTH_SCHEMA}}."Locations" (
  id serial PRIMARY KEY,
  "name" text NOT NULL UNIQUE,
  is_active bool DEFAULT true
);
INSERT INTO {{AUTH_SCHEMA}}."Locations" (id, "name", is_active) VALUES
  (1, 'Sede Maracaibo', true),
  (2, 'Sede Caracas', true),
  (3, 'Sede Antigua', false),
  (4, 'Sede Valencia', true),
  (5, 'Sede Barquisimeto', true);

DROP TABLE IF EXISTS {{AUTH_SCHEMA}}."Users";
CREATE TABLE {{AUTH_SCHEMA}}."Users" (
  id serial PRIMARY KEY,
  email text NOT NULL UNIQUE,
  "password" text NOT NULL,
  verified bool DEFAULT false,
  "name" text,
  lastname text,
  active bool DEFAULT true,
  cedula text
);
-- Datos FICTICIOS. La "contraseña" y la cédula existen para comprobar que las vistas NO las exponen.
INSERT INTO {{AUTH_SCHEMA}}."Users" (id, email, "password", verified, "name", lastname, active, cedula) VALUES
  (10, 'admin@example.com',   'HASH-SECRETO-1', true, 'Ana María',  'Pérez Gómez', true,  '11111111'),
  (11, 'otro@example.com',    'HASH-SECRETO-2', true, 'Luis',       'Rojas',       true,  '22222222'),
  (12, 'josefina@example.com','HASH-SECRETO-3', true, 'Josefina',   'Núñez',       true,  '33333333'),
  (13, 'baja@example.com',    'HASH-SECRETO-4', true, 'Pedro',      'Inactivo',    false, '44444444'),
  (14, '100%@example.com',    'HASH-SECRETO-5', true, 'Cien',       'Porciento',   true,  '55555555');

DROP TABLE IF EXISTS {{EMPLOYEES_SCHEMA}}."Employee";
CREATE TABLE {{EMPLOYEES_SCHEMA}}."Employee" (
  employee_id serial PRIMARY KEY,
  cedula text NOT NULL UNIQUE,
  names text NOT NULL,
  lastnames text NOT NULL,
  email text NOT NULL,
  "bornDate" timestamp(3) NOT NULL,
  "isActive" bool DEFAULT true
);
INSERT INTO {{EMPLOYEES_SCHEMA}}."Employee" (cedula, names, lastnames, email, "bornDate", "isActive") VALUES
  ('12345678',  'juan  carlos', 'pérez gómez', 'juan@example.com',  '1990-01-01', true),
  ('V-2222222', 'maría',        'lópez',       'maria@example.com', '1985-05-05', true),
  ('28624356',  'ana',          'rojas',       'ana1@example.com',  '1992-02-02', true),
  ('286243561', 'ana',          'rojas',       'ana2@example.com',  '1992-02-02', true),
  ('33333333',  'luis',         'díaz',        'luis@example.com',  '1980-03-03', false);
