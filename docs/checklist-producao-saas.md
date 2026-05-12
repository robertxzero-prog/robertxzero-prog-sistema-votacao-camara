# Checklist de Produção - Sistema Câmara + SaaS Master

## 1) Arquitetura final

- `instancia-camara` (por cliente):
  - `admin-web` + `backend` + banco local/isolado.
- `saas-master` (seu controle central):
  - frontend `master-web` hospedado online.
  - backend central com APIs de monitoramento/licença.
  - banco central somente de tenants/licenças/auditoria.

## 2) Variáveis de ambiente (mínimo)

### Backend central

- `DATABASE_URL`
- `JWT_SECRET_MASTER`
- `MASTER_2FA_ISSUER`
- `CORS_ALLOWED_ORIGINS`
- `NODE_ENV=production`
- `HEARTBEAT_ONLINE_WINDOW_SECONDS=90`

### Instância da câmara

- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ALLOWED_ORIGINS`
- `MASTER_API_URL`
- `MASTER_INSTANCE_CODE`
- `MASTER_MONITOR_TOKEN`

## 3) Segurança obrigatória

- HTTPS obrigatório em todos os domínios.
- Senhas com hash forte (Argon2 ou BCrypt).
- JWT curto + refresh token revogável.
- 2FA obrigatório para usuários master.
- Auditoria imutável para ações críticas:
  - alterar plano/licença
  - gerar/rotacionar token
  - bloquear/desbloquear instância
  - excluir instância
- CORS restrito por domínio.
- Rate limit por IP e por rota crítica.

## 4) Fluxo de onboarding de nova câmara

1. Criar registro da câmara no SaaS Master.
2. Definir plano e status inicial da licença.
3. Gerar token de monitoramento.
4. Configurar instância da câmara com:
   - `MASTER_API_URL`
   - `MASTER_INSTANCE_CODE`
   - `MASTER_MONITOR_TOKEN`
5. Validar heartbeat no painel master (ONLINE).
6. Entregar credenciais operacionais ao cliente.

## 5) Monitoramento e observabilidade

- Heartbeat a cada 20-30 segundos.
- Considerar OFFLINE após janela de 90 segundos sem heartbeat.
- Registrar:
  - versão do sistema
  - latência média
  - timestamp do último heartbeat
- Alertas:
  - instância offline > 5 min
  - licença INADIMPLENTE/BLOQUEADA
  - erro repetitivo de API/WS

## 6) Backup e recuperação

- Backup diário do banco central.
- Backup diário da base de cada câmara.
- Teste mensal de restauração.
- Política de retenção (ex: 30/90 dias).

## 7) Deploy recomendado

### Master web
- Vercel/Netlify/Cloudflare Pages.
- Domínio próprio: `master.seudominio.com`.

### Backend central
- Render/Railway/Fly.io/VPS.
- Domínio API: `api-master.seudominio.com`.
- SSL válido + logs persistentes.

### Banco central
- PostgreSQL gerenciado (Neon/Supabase/RDS).

## 8) Pós-go-live

- Rodar checklist de validação:
  - login master
  - cadastro/edição/exclusão de câmara
  - geração de token
  - heartbeat online/offline
  - mudança de licença
- Criar rotina de rotação de token (ex: trimestral).
- Definir SLA de suporte e procedimento de incidentes.

## 9) Roadmap imediato (próximo passo técnico)

- Remover login hardcoded do `master-web`.
- Implementar auth real no backend central:
  - `POST /master/auth/login`
  - `POST /master/auth/2fa/verify`
  - refresh/revogação de sessão
- Integrar `master-web` com esse login real.
