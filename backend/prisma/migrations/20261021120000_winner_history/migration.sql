-- CreateTable
CREATE TABLE "Winner_history" (
    "id" SERIAL NOT NULL,
    "sorteo_name" VARCHAR(150) NOT NULL,
    "sorteo_date" DATE NOT NULL,
    "cedula" VARCHAR(50) NOT NULL,
    "full_name" VARCHAR(250) NOT NULL,
    "department" VARCHAR(100) NOT NULL,
    "winning_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Winner_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Winner_history_cedula_idx" ON "Winner_history"("cedula");

-- CreateIndex
CREATE INDEX "Winner_history_sorteo_date_idx" ON "Winner_history"("sorteo_date");

