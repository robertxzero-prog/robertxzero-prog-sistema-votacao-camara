# Licenciamento híbrido (ativação + operação)

## Objetivo

Impedir uso sem liberação comercial e manter operação da câmara após ativação.

## Status atual implementado

- O login pode exigir ativação SaaS via variável:
  - `REQUIRE_SAAS_ACTIVATION=true`
- Quando habilitado:
  - `licenca_status=TESTE` bloqueia login (não ativado).
  - `licenca_status=INADIMPLENTE` bloqueia login.
  - `licenca_status=BLOQUEADA` bloqueia login.
  - `licenca_expira_em` no passado bloqueia login.

## Como operar

1. No SaaS Master, cadastrar a câmara.
2. Definir licença como `ATIVA`.
3. (Opcional) Definir `licenca_expira_em`.
4. Na instância da câmara, habilitar:
   - `REQUIRE_SAAS_ACTIVATION=true`
5. Reiniciar backend da câmara.

## Próxima etapa técnica

- Implementar cache local de licença com janela offline (ex.: 15/30 dias) e reconciliação automática quando internet voltar.
