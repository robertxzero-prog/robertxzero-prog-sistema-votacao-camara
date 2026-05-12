DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cargo_mesa') THEN
    CREATE TYPE "cargo_mesa" AS ENUM ('PRESIDENTE', 'VICE_PRESIDENTE', 'SECRETARIO_GERAL');
  END IF;
END $$;

ALTER TABLE IF EXISTS "usuarios"
  ADD COLUMN IF NOT EXISTS "twofa_enabled" BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS "twofa_secret" TEXT,
  ADD COLUMN IF NOT EXISTS "twofa_configurada_em" TIMESTAMP(6);

ALTER TABLE IF EXISTS "vereadores"
  ADD COLUMN IF NOT EXISTS "cargo_mesa" "cargo_mesa";
