ALTER TABLE IF EXISTS "camara_configuracoes"
  ADD COLUMN IF NOT EXISTS "onboarding_status" VARCHAR(20) DEFAULT 'NAO_INICIADO',
  ADD COLUMN IF NOT EXISTS "onboarding_responsavel_nome" VARCHAR(160),
  ADD COLUMN IF NOT EXISTS "onboarding_responsavel_email" VARCHAR(160),
  ADD COLUMN IF NOT EXISTS "onboarding_responsavel_telefone" VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "onboarding_enviado_em" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "onboarding_aprovado_em" TIMESTAMP(6);
