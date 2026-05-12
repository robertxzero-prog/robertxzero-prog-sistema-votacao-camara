# Guia Operacional Comercial - Sistema Câmara + SaaS Master

## 1) Objetivo do guia

Padronizar como você implanta, ativa, monitora e mantém cada câmara cliente.

---

## 2) Fluxo de onboarding (nova câmara)

1. Cadastrar câmara no SaaS Master:
   - código da instância
   - nome oficial
   - cidade/UF
   - plano
2. Definir licença inicial:
   - status: `ATIVA` (ou `TESTE` se ainda não liberada)
   - janela offline: valor + unidade (dias/mês/ano)
3. Gerar token de monitoramento.
4. Configurar instância da câmara com:
   - código da instância
   - token de monitoramento
5. Validar heartbeat e status ONLINE no SaaS Master.
6. Entregar acesso ao cliente e executar checklist de validação final.

---

## 3) Política de licença sugerida

- `TESTE`: instância não liberada comercialmente.
- `ATIVA`: operação normal.
- `INADIMPLENTE`: sinal de cobrança pendente; pode manter aviso e prazo curto.
- `BLOQUEADA`: bloqueio operacional (conforme política contratual).

Recomendação:
- contratos anuais: janela offline em `30 dias`
- contratos mensais: janela offline em `15 dias`

---

## 4) Operação diária no SaaS Master

Todo início de dia:

1. Abrir SaaS Master.
2. Filtrar instâncias OFFLINE.
3. Verificar colunas:
   - heartbeat
   - sync da licença
   - restante da janela offline
4. Tratar casos:
   - OFFLINE com janela restante alta: monitorar.
   - OFFLINE com risco alto/expirado: contatar TI local da câmara.
   - licenças em inadimplência: aplicar política comercial.

---

## 5) Rotina mensal (recomendada)

1. Revisar todas as licenças ativas.
2. Revisar inadimplência e aplicar régua de cobrança.
3. Rotacionar token de monitoramento por lote (quando necessário).
4. Revisar auditoria das ações do master.
5. Validar backup e restauração (teste controlado).
6. Atualizar changelog de versão entregue para clientes.

---

## 6) Checklist de ativação por cliente

- [ ] Câmara cadastrada no SaaS Master  
- [ ] Licença em `ATIVA`  
- [ ] Janela offline configurada  
- [ ] Token gerado e salvo na instância  
- [ ] Heartbeat ONLINE confirmado  
- [ ] Login admin da câmara validado  
- [ ] Fluxo básico testado (sessão, pauta, votação, ata, telão)  
- [ ] Operador treinado  
- [ ] Contato de suporte registrado  

---

## 7) Checklist de bloqueio por inadimplência

1. Confirmar atraso conforme contrato.
2. Registrar evidência (financeiro/comercial).
3. Alterar status para `INADIMPLENTE`.
4. Enviar aviso com prazo final.
5. Se não regularizar, alterar para `BLOQUEADA`.
6. Registrar evento e comunicação enviada.

---

## 8) Script de suporte (incidente rápido)

Quando cliente reportar indisponibilidade:

1. Conferir status no SaaS Master (ONLINE/OFFLINE).
2. Conferir status de licença.
3. Validar tempo restante da janela offline.
4. Se OFFLINE:
   - orientar conferência de internet local
   - validar processo backend da câmara
   - validar token e código de instância
5. Após normalização, confirmar heartbeat e login.

---

## 9) Itens obrigatórios para produção

- HTTPS ativo nos domínios.
- Senhas fortes e 2FA para ADMIN/PRESIDENTE.
- Política de backup válida e testada.
- CORS restrito.
- Rate limit ativo no login.
- Auditoria habilitada.

---

## 10) Expansão comercial (escala)

Para crescer com segurança:

1. Criar plano Básico / Profissional / Enterprise.
2. Automatizar geração de contrato e ativação.
3. Criar painel financeiro acoplado ao SaaS Master.
4. Criar SLA formal por faixa de plano.
5. Versionar rollout de atualizações por lote de câmaras.
