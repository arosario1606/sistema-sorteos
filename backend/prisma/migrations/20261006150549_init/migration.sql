-- CreateTable
CREATE TABLE "Employee" (
    "employee_id" SERIAL NOT NULL,
    "cedula" VARCHAR(50) NOT NULL,
    "names" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "bornDate" DATE,
    "email" VARCHAR(150),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("employee_id")
);

-- CreateTable
CREATE TABLE "Sede" (
    "id_sede" INTEGER NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sede_pkey" PRIMARY KEY ("id_sede")
);

-- CreateTable
CREATE TABLE "User_branch_permission" (
    "user_id" INTEGER NOT NULL,
    "user_email" VARCHAR(150) NOT NULL,
    "id_sede" INTEGER NOT NULL,
    "created_by" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_branch_permission_pkey" PRIMARY KEY ("user_id","id_sede")
);

-- CreateTable
CREATE TABLE "Branch_group" (
    "group_id" SERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "created_by" VARCHAR(100) NOT NULL,
    "updated_by" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Branch_group_pkey" PRIMARY KEY ("group_id")
);

-- CreateTable
CREATE TABLE "Branch_group_detail" (
    "group_id" INTEGER NOT NULL,
    "id_sede" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Branch_group_detail_pkey" PRIMARY KEY ("group_id","id_sede")
);

-- CreateTable
CREATE TABLE "Department" (
    "id_department" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id_department")
);

-- CreateTable
CREATE TABLE "Department_quota" (
    "group_id" INTEGER NOT NULL,
    "id_department" INTEGER NOT NULL,
    "allowed_quantity" INTEGER NOT NULL,
    "created_by" VARCHAR(100) NOT NULL,
    "updated_by" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Department_quota_pkey" PRIMARY KEY ("group_id","id_department")
);

-- CreateTable
CREATE TABLE "Sorteos" (
    "id_sorteos" SERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "sorteo_date" DATE NOT NULL,
    "group_id" INTEGER NOT NULL,
    "created_by" VARCHAR(100) NOT NULL,
    "updated_by" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sorteos_pkey" PRIMARY KEY ("id_sorteos")
);

-- CreateTable
CREATE TABLE "Participant" (
    "id_participant" SERIAL NOT NULL,
    "id_sorteos" INTEGER NOT NULL,
    "cedula" VARCHAR(50) NOT NULL,
    "id_department" INTEGER NOT NULL,
    "job_title" VARCHAR(100) NOT NULL,
    "participate" BOOLEAN NOT NULL DEFAULT true,
    "attended" BOOLEAN NOT NULL DEFAULT false,
    "created_by" VARCHAR(100) NOT NULL,
    "updated_by" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id_participant")
);

-- CreateTable
CREATE TABLE "Winner" (
    "id_participant" INTEGER NOT NULL,
    "winning_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Winner_pkey" PRIMARY KEY ("id_participant")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_cedula_key" ON "Employee"("cedula");

-- CreateIndex
CREATE UNIQUE INDEX "Participant_id_sorteos_cedula_key" ON "Participant"("id_sorteos", "cedula");

-- AddForeignKey
ALTER TABLE "User_branch_permission" ADD CONSTRAINT "User_branch_permission_id_sede_fkey" FOREIGN KEY ("id_sede") REFERENCES "Sede"("id_sede") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch_group_detail" ADD CONSTRAINT "Branch_group_detail_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Branch_group"("group_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch_group_detail" ADD CONSTRAINT "Branch_group_detail_id_sede_fkey" FOREIGN KEY ("id_sede") REFERENCES "Sede"("id_sede") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department_quota" ADD CONSTRAINT "Department_quota_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Branch_group"("group_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department_quota" ADD CONSTRAINT "Department_quota_id_department_fkey" FOREIGN KEY ("id_department") REFERENCES "Department"("id_department") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sorteos" ADD CONSTRAINT "Sorteos_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Branch_group"("group_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_id_sorteos_fkey" FOREIGN KEY ("id_sorteos") REFERENCES "Sorteos"("id_sorteos") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_id_department_fkey" FOREIGN KEY ("id_department") REFERENCES "Department"("id_department") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Winner" ADD CONSTRAINT "Winner_id_participant_fkey" FOREIGN KEY ("id_participant") REFERENCES "Participant"("id_participant") ON DELETE CASCADE ON UPDATE CASCADE;
