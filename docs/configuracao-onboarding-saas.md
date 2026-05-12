# Configuração de Onboarding SaaS (Primeiro Acesso)

## 1) Objetivo

Permitir que a câmara faça o primeiro cadastro local e envie automaticamente para o SaaS Master, liberando login só após ativação comercial.

## 2) Variáveis obrigatórias no backend da câmara

Use como base `backend/.env.example`:

- `REQUIRE_SAAS_ACTIVATION=true`
- `CAMARA_INSTANCE_CODE=default` (ou um código local inicial)
- `MASTER_API_URL=http://localhost:3000` (trocar para URL real do SaaS em produção)
- `ONBOARDING_SHARED_KEY=...` (mesma chave no SaaS e na instância)
- `MONITOR_TOKEN_SALT=...`

## 3) Fluxo funcional

1. Tela `/` do admin abre em modo **Primeiro acesso**.
2. Operador preenche dados da câmara e responsável.
3. Backend local salva solicitação (`onboarding_status=SOLICITADO`).
4. Se `MASTER_API_URL` + `ONBOARDING_SHARED_KEY` estiverem configurados, o backend envia para:
   - `POST /configuracao/onboarding/registro-publico`
5. No SaaS Master, você aprova e ativa a licença.
6. Com licença `ATIVA`, o login local é liberado.

## 4) Endpoints do onboarding

- `GET /configuracao/onboarding/status`
- `POST /configuracao/onboarding/solicitar`
- `POST /configuracao/onboarding/registro-publico` (chave `x-onboarding-key`)

## 5) Produção (recomendação)

- SaaS Master em HTTPS (ex.: `https://api-master.seudominio.com`).
- Instâncias de câmara em HTTPS.
- `ONBOARDING_SHARED_KEY` longa e com rotação periódica.
- Logs/auditoria habilitados.
