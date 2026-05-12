-- CreateEnum
CREATE TYPE "tipo_fala_sessao" AS ENUM ('PEQUENAS_COMUNICACOES', 'GRANDE_EXPEDIENTE', 'ORDEM_DO_DIA', 'EXPLICACOES_PESSOAIS');

-- AlterTable
ALTER TABLE "sessoes" ADD COLUMN     "orador_duracao_segundos" INTEGER,
ADD COLUMN     "orador_inicio_em" TIMESTAMP(6),
ADD COLUMN     "orador_tipo_fala" "tipo_fala_sessao",
ADD COLUMN     "orador_vereador_id" UUID;

-- AddForeignKey
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_orador_vereador_id_fkey" FOREIGN KEY ("orador_vereador_id") REFERENCES "vereadores"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
