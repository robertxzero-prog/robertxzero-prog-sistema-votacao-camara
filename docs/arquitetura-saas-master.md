# Arquitetura recomendada: Sistema Câmara + SaaS Master

## 1. Separação de produtos

- **Produto Câmara (cliente):**
  - Instalação local na câmara (ou VPS dedicada da própria câmara).
  - Opera sessão, pauta, votação, ata, telão.
  - Base de dados isolada por câmara.

- **SaaS Master (seu controle central):**
  - Hospedado em nuvem separada.
  - Gerencia planos, licenças, monitoramento e status operacional.
  - Não acessa banco interno da câmara diretamente.

## 2. Comunicação segura

- Cada câmara possui:
  - `codigo_instancia`
  - `monitor_token` exclusivo (gerado no Master e guardado como hash no servidor).
- Heartbeat periódico da câmara para o Master:
  - Endpoint: `POST /configuracao/monitor/heartbeat`
  - Payload: `codigo_instancia`, `monitor_token`, `versao`, `latencia_ms`
- Tráfego somente por HTTPS.
- Opcional recomendado: IP allowlist para endpoints de monitoramento.

## 3. Status e operação

- Considerar **ONLINE** quando último heartbeat <= 90s.
- Considerar **OFFLINE** quando > 90s.
- Painel Master mostra:
  - Status online/offline.
  - Plano e situação da licença.
  - Último heartbeat e metadados de versão.

## 4. Segurança recomendada para produção

- Remover credencial master fixa no frontend.
- Implementar autenticação master no backend com:
  - usuário master + senha hash
  - 2FA obrigatório
  - sessão curta + refresh controlado
- Registrar auditoria de ações do master:
  - criação de câmara
  - troca de plano
  - bloqueio/desbloqueio de licença
  - geração de token de monitoramento

## 5. Escalabilidade prática

- 1 banco central para SaaS Master.
- 1 banco por câmara para operação legislativa.
- Deploy desacoplado:
  - Master: domínio central (ex: `master.seudominio.com`)
  - Câmara: domínio/instância própria (ex: `camara-x.seudominio.com`)

## 6. Fluxo comercial simples

1. Cadastrar câmara no Master.
2. Gerar `monitor_token`.
3. Configurar cliente com `codigo_instancia` + `monitor_token`.
4. Ativar licença.
5. Monitorar status e renovar plano pelo Master.

