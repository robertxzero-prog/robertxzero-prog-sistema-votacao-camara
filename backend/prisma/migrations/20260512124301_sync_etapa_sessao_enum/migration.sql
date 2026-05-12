/*
  Warnings:

  - The values [DISCUSSAO,VOTACAO] on the enum `etapa_sessao` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "etapa_sessao_new" AS ENUM ('ABERTURA', 'LEITURA_BIBLICA', 'CHAMADA_VEREADORES', 'VERIFICACAO_QUORUM', 'LEITURA_EXPEDIENTE', 'PEQUENAS_COMUNICACOES', 'GRANDE_EXPEDIENTE', 'ORDEM_DO_DIA', 'RESULTADO', 'EXPLICACOES_PESSOAIS', 'ENCERRAMENTO');
ALTER TABLE "sessoes" ALTER COLUMN "etapa_atual" DROP DEFAULT;
ALTER TABLE "sessoes" ALTER COLUMN "etapa_atual" TYPE "etapa_sessao_new" USING ("etapa_atual"::text::"etapa_sessao_new");
ALTER TYPE "etapa_sessao" RENAME TO "etapa_sessao_old";
ALTER TYPE "etapa_sessao_new" RENAME TO "etapa_sessao";
DROP TYPE "etapa_sessao_old";
ALTER TABLE "sessoes" ALTER COLUMN "etapa_atual" SET DEFAULT 'ABERTURA';
COMMIT;

-- AlterTable
ALTER TABLE "camara_configuracoes" ALTER COLUMN "nome_oficial" SET DEFAULT 'Câmara Municipal',
ALTER COLUMN "plano_nome" SET DEFAULT 'Plano Básico';

-- CreateTable
CREATE TABLE "auth_sessoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "jwt_id" VARCHAR(120) NOT NULL,
    "device_id" VARCHAR(120),
    "device_nome" VARCHAR(160),
    "ip" VARCHAR(64),
    "user_agent" TEXT,
    "expira_em" TIMESTAMP(6) NOT NULL,
    "revogada_em" TIMESTAMP(6),
    "ultimo_acesso_em" TIMESTAMP(6),
    "criado_em" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria_eventos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID,
    "usuario_nome" VARCHAR(150),
    "usuario_role" "user_role",
    "acao" VARCHAR(80) NOT NULL,
    "entidade" VARCHAR(80) NOT NULL,
    "entidade_id" VARCHAR(120),
    "detalhes" JSONB,
    "ip" VARCHAR(64),
    "user_agent" TEXT,
    "hash_anterior" VARCHAR(128),
    "hash_evento" VARCHAR(128),
    "criado_em" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "atas_assinaturas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "votacao_id" UUID NOT NULL,
    "hash_sha256" VARCHAR(128) NOT NULL,
    "assinatura_hmac" VARCHAR(256) NOT NULL,
    "payload_json" JSONB NOT NULL,
    "assinada_por" UUID,
    "assinada_em" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "atas_assinaturas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessoes_jwt_id_key" ON "auth_sessoes"("jwt_id");

-- CreateIndex
CREATE INDEX "auth_sessoes_usuario_id_expira_em_idx" ON "auth_sessoes"("usuario_id", "expira_em");

-- CreateIndex
CREATE INDEX "auditoria_eventos_acao_criado_em_idx" ON "auditoria_eventos"("acao", "criado_em");

-- CreateIndex
CREATE INDEX "auditoria_eventos_entidade_entidade_id_criado_em_idx" ON "auditoria_eventos"("entidade", "entidade_id", "criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "atas_assinaturas_votacao_id_key" ON "atas_assinaturas"("votacao_id");

-- CreateIndex
CREATE INDEX "atas_assinaturas_assinada_em_idx" ON "atas_assinaturas"("assinada_em");

-- AddForeignKey
ALTER TABLE "auth_sessoes" ADD CONSTRAINT "auth_sessoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "auditoria_eventos" ADD CONSTRAINT "auditoria_eventos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "atas_assinaturas" ADD CONSTRAINT "atas_assinaturas_votacao_id_fkey" FOREIGN KEY ("votacao_id") REFERENCES "votacoes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
