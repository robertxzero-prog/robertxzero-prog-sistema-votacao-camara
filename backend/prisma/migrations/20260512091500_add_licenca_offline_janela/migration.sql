DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'licenca_status') THEN
    CREATE TYPE "licenca_status" AS ENUM ('TESTE', 'ATIVA', 'INADIMPLENTE', 'BLOQUEADA');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "camara_configuracoes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "codigo_instancia" VARCHAR(80) NOT NULL DEFAULT 'default',
  "nome_oficial" VARCHAR(200) NOT NULL DEFAULT 'Camara Municipal',
  "nome_exibicao" VARCHAR(120),
  "tenant_slug" VARCHAR(120),
  "plano_nome" VARCHAR(120) DEFAULT 'Plano Basico',
  "backend_url" TEXT,
  "brasao_url" TEXT,
  "cidade" VARCHAR(120),
  "uf" VARCHAR(2),
  "monitor_token_hash" VARCHAR(128),
  "monitor_versao" VARCHAR(40),
  "monitor_ip" VARCHAR(64),
  "monitor_user_agent" TEXT,
  "monitor_latencia_ms" INTEGER,
  "licenca_status" "licenca_status" NOT NULL DEFAULT 'TESTE',
  "licenca_expira_em" TIMESTAMP(6),
  "ultimo_heartbeat_em" TIMESTAMP(6),
  "atualizado_em" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "camara_configuracoes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "camara_configuracoes_codigo_instancia_key"
ON "camara_configuracoes"("codigo_instancia");

ALTER TABLE IF EXISTS "camara_configuracoes"
  ADD COLUMN IF NOT EXISTS "licenca_offline_valor" INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "licenca_offline_unidade" VARCHAR(16) DEFAULT 'DIAS',
  ADD COLUMN IF NOT EXISTS "licenca_ultimo_sync_em" TIMESTAMP(6);

UPDATE "camara_configuracoes"
SET
  "licenca_offline_valor" = COALESCE("licenca_offline_valor", 30),
  "licenca_offline_unidade" = COALESCE("licenca_offline_unidade", 'DIAS'),
  "licenca_ultimo_sync_em" = COALESCE("licenca_ultimo_sync_em", now());
