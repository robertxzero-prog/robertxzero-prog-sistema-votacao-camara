-- CreateEnum
CREATE TYPE "etapa_sessao" AS ENUM ('ABERTURA', 'DISCUSSAO', 'VOTACAO', 'RESULTADO', 'ENCERRAMENTO');

-- AlterTable
ALTER TABLE "sessoes" ADD COLUMN     "etapa_atual" "etapa_sessao" DEFAULT 'ABERTURA';
