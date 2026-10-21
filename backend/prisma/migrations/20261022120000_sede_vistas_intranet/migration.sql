-- Sede y permisos dejan de copiar datos de la intranet:
--  * El nombre de la sede y su estado en la intranet se leen de la vista v_sede (docs/integracion/vistas-sorteos.sql).
--  * El nombre y el correo del usuario se leen de la vista v_users.
-- Las filas existentes se conservan (permisos por usuario y sede, y las sedes desactivadas a mano).
-- IMPORTANTE: crear las vistas ANTES de arrancar la versión nueva del servicio.

-- DropForeignKey
ALTER TABLE "Branch_group_detail" DROP CONSTRAINT "Branch_group_detail_id_sede_fkey";

-- DropForeignKey
ALTER TABLE "User_branch_permission" DROP CONSTRAINT "User_branch_permission_id_sede_fkey";

-- AlterTable
ALTER TABLE "Sede" DROP COLUMN "name";

-- AlterTable
ALTER TABLE "User_branch_permission" DROP COLUMN "user_email";
