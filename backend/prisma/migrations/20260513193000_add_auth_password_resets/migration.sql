CREATE TABLE "auth_password_resets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "codigo_hash" VARCHAR(128) NOT NULL,
    "expira_em" TIMESTAMP(6) NOT NULL,
    "usado_em" TIMESTAMP(6),
    "criado_em" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "auth_password_resets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "auth_password_resets_usuario_id_expira_em_idx"
    ON "auth_password_resets"("usuario_id", "expira_em");

CREATE INDEX "auth_password_resets_codigo_hash_idx"
    ON "auth_password_resets"("codigo_hash");

ALTER TABLE "auth_password_resets"
    ADD CONSTRAINT "auth_password_resets_usuario_id_fkey"
    FOREIGN KEY ("usuario_id")
    REFERENCES "usuarios"("id")
    ON DELETE CASCADE
    ON UPDATE NO ACTION;

