-- CreateEnum
CREATE TYPE "status_fala_sessao" AS ENUM ('PENDENTE', 'CHAMADO', 'ENCERRADO', 'CANCELADO');

-- CreateTable
CREATE TABLE "fila_oradores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessao_id" UUID NOT NULL,
    "vereador_id" UUID NOT NULL,
    "tipo_fala" "tipo_fala_sessao" NOT NULL,
    "status" "status_fala_sessao" NOT NULL DEFAULT 'PENDENTE',
    "solicitada_em" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "chamada_em" TIMESTAMP(6),

    CONSTRAINT "fila_oradores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fila_oradores_sessao_id_status_solicitada_em_idx" ON "fila_oradores"("sessao_id", "status", "solicitada_em");

-- AddForeignKey
ALTER TABLE "fila_oradores" ADD CONSTRAINT "fila_oradores_sessao_id_fkey" FOREIGN KEY ("sessao_id") REFERENCES "sessoes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fila_oradores" ADD CONSTRAINT "fila_oradores_vereador_id_fkey" FOREIGN KEY ("vereador_id") REFERENCES "vereadores"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
