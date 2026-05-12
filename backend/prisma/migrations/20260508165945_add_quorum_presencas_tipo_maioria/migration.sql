-- CreateEnum
CREATE TYPE "session_status" AS ENUM ('ABERTA', 'EM_ANDAMENTO', 'ENCERRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "tipo_voto" AS ENUM ('SIM', 'NAO', 'ABSTENCAO', 'AUSENTE');

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('ADMIN', 'PRESIDENTE', 'VEREADOR', 'OPERADOR');

-- CreateEnum
CREATE TYPE "votacao_status" AS ENUM ('ABERTA', 'ENCERRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "tipo_maioria" AS ENUM ('SIMPLES', 'ABSOLUTA', 'DOIS_TERCOS');

-- CreateTable
CREATE TABLE "cadeiras" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" INTEGER NOT NULL,
    "linha" INTEGER NOT NULL,
    "coluna" INTEGER NOT NULL,
    "descricao" VARCHAR(100),
    "ativa" BOOLEAN DEFAULT true,

    CONSTRAINT "cadeiras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pautas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessao_id" UUID NOT NULL,
    "numero_ordem" INTEGER NOT NULL,
    "titulo" VARCHAR(200) NOT NULL,
    "descricao" TEXT,
    "autor_id" UUID NOT NULL,
    "arquivo_url" TEXT,
    "tipo_maioria" "tipo_maioria" NOT NULL DEFAULT 'SIMPLES',
    "criada_em" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pautas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "titulo" VARCHAR(200) NOT NULL,
    "descricao" TEXT,
    "data_sessao" DATE NOT NULL,
    "hora_inicio" TIMESTAMP(6),
    "hora_fim" TIMESTAMP(6),
    "status" "session_status" DEFAULT 'ABERTA',
    "criada_por" UUID NOT NULL,
    "criado_em" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" VARCHAR(150) NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "role" "user_role" NOT NULL,
    "foto_url" TEXT,
    "ativo" BOOLEAN DEFAULT true,
    "criado_em" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vereadores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "cadeira_id" UUID NOT NULL,
    "partido" VARCHAR(20),
    "mandato_inicio" DATE,
    "mandato_fim" DATE,

    CONSTRAINT "vereadores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "votacoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pauta_id" UUID NOT NULL,
    "aberta_por" UUID NOT NULL,
    "aberta_em" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "encerrada_em" TIMESTAMP(6),
    "status" "votacao_status" DEFAULT 'ABERTA',

    CONSTRAINT "votacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "votos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "votacao_id" UUID NOT NULL,
    "vereador_id" UUID NOT NULL,
    "voto" "tipo_voto" NOT NULL,
    "votado_em" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "votos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presencas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessao_id" UUID NOT NULL,
    "vereador_id" UUID NOT NULL,
    "presente_em" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "presencas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cadeiras_numero_key" ON "cadeiras"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "vereadores_usuario_id_key" ON "vereadores"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "vereadores_cadeira_id_key" ON "vereadores"("cadeira_id");

-- CreateIndex
CREATE UNIQUE INDEX "votos_votacao_id_vereador_id_key" ON "votos"("votacao_id", "vereador_id");

-- CreateIndex
CREATE UNIQUE INDEX "presencas_sessao_id_vereador_id_key" ON "presencas"("sessao_id", "vereador_id");

-- AddForeignKey
ALTER TABLE "pautas" ADD CONSTRAINT "pautas_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pautas" ADD CONSTRAINT "pautas_sessao_id_fkey" FOREIGN KEY ("sessao_id") REFERENCES "sessoes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_criada_por_fkey" FOREIGN KEY ("criada_por") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vereadores" ADD CONSTRAINT "vereadores_cadeira_id_fkey" FOREIGN KEY ("cadeira_id") REFERENCES "cadeiras"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vereadores" ADD CONSTRAINT "vereadores_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "votacoes" ADD CONSTRAINT "votacoes_aberta_por_fkey" FOREIGN KEY ("aberta_por") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "votacoes" ADD CONSTRAINT "votacoes_pauta_id_fkey" FOREIGN KEY ("pauta_id") REFERENCES "pautas"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "votos" ADD CONSTRAINT "votos_vereador_id_fkey" FOREIGN KEY ("vereador_id") REFERENCES "vereadores"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "votos" ADD CONSTRAINT "votos_votacao_id_fkey" FOREIGN KEY ("votacao_id") REFERENCES "votacoes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "presencas" ADD CONSTRAINT "presencas_sessao_id_fkey" FOREIGN KEY ("sessao_id") REFERENCES "sessoes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "presencas" ADD CONSTRAINT "presencas_vereador_id_fkey" FOREIGN KEY ("vereador_id") REFERENCES "vereadores"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
