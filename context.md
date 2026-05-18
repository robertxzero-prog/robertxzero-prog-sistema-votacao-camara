## Estado atual do projeto (VotaCam / SILCAM)

### Arquitetura
- **Backend (NestJS + Prisma + PostgreSQL)**: `C:\sistema-votacao-camara\backend`
- **Admin Web da câmara (Next.js)**: `C:\sistema-votacao-camara\admin-web`
- **SaaS Master local (estático)**: `C:\master-web`
- **SaaS Master online (Render)**: `https://votacam-master-web.onrender.com/`
- **Backend público SaaS/câmara teste (Render)**: `https://robertxzero-prog-sistema-votacao-camara.onrender.com/`

### O que já foi implementado
- Fluxo legislativo completo (sessão, pauta, votação, presença, quórum, ata, telão, fala de oradores).
- Perfis de uso (admin, vereador, presidente) com fluxos separados.
- SaaS Master com:
  - cadastro/listagem de instâncias,
  - status/licença (ATIVA, BLOQUEADA, etc.),
  - sync de licença,
  - heartbeat (ONLINE/OFFLINE),
  - testes de conexão e ações operacionais.
- Onboarding de primeiro acesso da câmara integrado ao SaaS.
- Recuperação de senha do admin local (fluxo simplificado).
- Notificação por e-mail via Resend para eventos de onboarding.
- Ajustes visuais relevantes na tela de login/onboarding local (bloco azul + bloco branco, branding SILCAM).

### Pontos sensíveis já identificados
- A instância `default` pode reaparecer/gerar conflito quando variáveis locais apontam para código padrão.
- Se `CAMARA_INSTANCE_CODE` e `MONITOR_TOKEN` do backend local estiverem desalinhados com a instância cadastrada no SaaS, sync/teste de conexão falham.
- Mensagens de erro de conexão geralmente indicam `backend_url` ausente/incorreto ou fallback de URL mal configurado.

### Configurações importantes (.env backend)
Arquivo: `C:\sistema-votacao-camara\backend\.env`

Variáveis chave para integração SaaS:
- `APP_MODE`
- `DATABASE_URL`
- `MASTER_API_URL`
- `ONBOARDING_SHARED_KEY`
- `CAMARA_INSTANCE_CODE`
- `MONITOR_TOKEN`
- `DEFAULT_INSTANCE_BACKEND_URL`
- `INSTANCE_BACKEND_URL_TEMPLATE`
- `SAAS_SINGLE_BACKEND_MODE`
- `RESEND_API_KEY`
- `SAAS_ALERT_EMAIL_FROM`
- `SAAS_ALERT_EMAIL_TO`

### Fluxo operacional recomendado (resumo)
1. Câmara preenche “Primeiro acesso”.
2. Solicitação aparece no SaaS Master.
3. Operador aprova/licencia no SaaS Master.
4. Executar sync/teste conexão.
5. Admin local acessa com credencial liberada.
6. Alterações de senha/admin devem atuar na instância da câmara (não no usuário do SaaS Master).

### Situação recente
- O usuário pediu um resumo para trocar de thread sem travamento.
- Próximo foco sugerido na nova conversa:
  1. estabilizar definitivamente o fluxo de onboarding pendente -> aprovado,
  2. eliminar conflitos de `default`,
  3. validar recuperação de senha ponta a ponta por e-mail sem fallback de código de teste,
  4. fechar checklist final de operação comercial.

### Comandos úteis (local)
- Backend:
  - `cd C:\sistema-votacao-camara\backend`
  - `npm run start:dev`
- Admin web:
  - `cd C:\sistema-votacao-camara\admin-web`
  - `npm run dev -- -p 3001`
- SaaS Master local:
  - `cd C:\master-web`
  - abrir `index.html` com servidor estático (ou serviço já usado no ambiente).

### Instrução para colar na nova conversa
Use este texto:

> “Continuar projeto VotaCam/SILCAM a partir do arquivo `C:\sistema-votacao-camara\context.md`.  
> Prioridade: estabilizar onboarding + sync instância sem conflito `default` e validar recuperação de senha por e-mail em produção.”

