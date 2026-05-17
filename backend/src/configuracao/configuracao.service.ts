import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { licenca_status } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AuditoriaContexto } from '../auditoria/auditoria.types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ConfiguracaoService implements OnModuleInit, OnModuleDestroy {
  private ultimoSyncLicencaSaasEm = 0;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private heartbeatRodando = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  private isSaasMasterMode() {
    const mode = (process.env.APP_MODE || '').trim().toLowerCase();
    return (
      mode === 'saas_master' ||
      mode === 'master' ||
      process.env.SAAS_MASTER_MODE === 'true'
    );
  }

  private isSaasSingleBackendMode() {
    return process.env.SAAS_SINGLE_BACKEND_MODE === 'true';
  }

  private isCodigoInstanciaReservado(codigo?: string | null) {
    const normalizado = (codigo || '').trim().toLowerCase();
    return normalizado === 'default' || normalizado === 'pendente-onboarding';
  }

  onModuleInit() {
    const intervalMs = Math.max(
      10000,
      Number(process.env.SAAS_HEARTBEAT_INTERVAL_MS || 30000),
    );
    this.heartbeatTimer = setInterval(() => {
      this.enviarHeartbeatSaasSePossivel().catch(() => undefined);
    }, intervalMs);
  }

  onModuleDestroy() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private hashMonitorToken(token: string) {
    const salt = process.env.MONITOR_TOKEN_SALT || 'monitor-default-salt';
    return createHash('sha256').update(`${salt}:${token}`).digest('hex');
  }

  private normalizarBackendUrl(url?: string | null) {
    const raw = (url || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    return `https://${raw}`;
  }

  private isLoopbackUrl(url?: string | null) {
    try {
      const parsed = new URL((url || '').trim());
      const host = (parsed.hostname || '').toLowerCase();
      return host === 'localhost' || host === '127.0.0.1' || host === '::1';
    } catch {
      return false;
    }
  }

  private extrairHost(url?: string | null) {
    try {
      const parsed = new URL((url || '').trim());
      return (parsed.host || '').toLowerCase();
    } catch {
      return '';
    }
  }

  private backendApontaParaSaasMaster(url?: string | null) {
    const hostAlvo = this.extrairHost(url);
    if (!hostAlvo) return false;
    const hostMasterApi = this.extrairHost(process.env.MASTER_API_URL || '');
    const hostPublicApi = this.extrairHost(
      process.env.PUBLIC_API_BASE_URL || '',
    );
    return (
      (hostMasterApi && hostAlvo === hostMasterApi) ||
      (hostPublicApi && hostAlvo === hostPublicApi)
    );
  }

  private resolverBackendUrlInstancia(
    backendUrlInstancia?: string | null,
    requestBackendUrl?: string | null,
    codigoInstancia?: string | null,
    opts?: { evitarFallbackGlobal?: boolean },
  ) {
    if (this.isSaasSingleBackendMode()) {
      return (
        this.normalizarBackendUrl(process.env.PUBLIC_API_BASE_URL) ||
        this.normalizarBackendUrl(process.env.MASTER_API_URL) ||
        this.normalizarBackendUrl(process.env.DEFAULT_INSTANCE_BACKEND_URL) ||
        ''
      );
    }

    const template = (process.env.INSTANCE_BACKEND_URL_TEMPLATE || '').trim();
    const fromTemplate =
      template && codigoInstancia
        ? template.replace(
            '{codigo}',
            (codigoInstancia || '').trim().toLowerCase(),
          )
        : '';

    const resolvedBase =
      this.normalizarBackendUrl(backendUrlInstancia) ||
      this.normalizarBackendUrl(requestBackendUrl) ||
      this.normalizarBackendUrl(fromTemplate);
    const resolvedFallback = opts?.evitarFallbackGlobal
      ? ''
      : this.normalizarBackendUrl(process.env.DEFAULT_INSTANCE_BACKEND_URL) ||
        this.normalizarBackendUrl(process.env.PUBLIC_API_BASE_URL) ||
        '';
    const resolved = resolvedBase || resolvedFallback || '';

    const publicBase = this.normalizarBackendUrl(
      process.env.PUBLIC_API_BASE_URL,
    );
    if (
      this.isLoopbackUrl(resolved) &&
      publicBase &&
      !this.isLoopbackUrl(publicBase)
    ) {
      return publicBase;
    }
    return resolved;
  }

  private async notificarNovaCamaraPorEmail(input: {
    codigoInstancia: string;
    nomeOficial: string;
    cidade?: string | null;
    uf?: string | null;
    responsavelNome?: string | null;
    responsavelEmail?: string | null;
    responsavelTelefone?: string | null;
    backendUrl?: string | null;
    origem: 'onboarding_publico' | 'saas_manual';
  }) {
    const resendApiKey = (process.env.RESEND_API_KEY || '').trim();
    const emailDestino = (
      process.env.SAAS_ALERT_EMAIL_TO || 'robertxzero@gmail.com'
    )
      .trim()
      .toLowerCase();
    const emailRemetente = (
      process.env.SAAS_ALERT_EMAIL_FROM || 'onboarding@votacam.local'
    ).trim();

    if (!resendApiKey || !emailDestino || !emailRemetente) {
      return {
        ok: false,
        skipped: true,
        motivo: 'email_nao_configurado' as const,
      };
    }

    const painelMasterUrl = (
      process.env.SAAS_MASTER_WEB_URL ||
      'https://votacam-master-web.onrender.com'
    ).trim();
    const backendUrl = (input.backendUrl || '').trim() || 'nao informado';
    const local = [input.cidade || null, input.uf || null]
      .filter(Boolean)
      .join('/');
    const assunto = `[VotaCam] Nova camara cadastrada: ${input.nomeOficial}`;

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#0f172a">
        <h2>Nova camara cadastrada</h2>
        <p>Uma nova camara foi registrada no SaaS Master.</p>
        <ul>
          <li><strong>Codigo da instancia:</strong> ${input.codigoInstancia}</li>
          <li><strong>Nome oficial:</strong> ${input.nomeOficial}</li>
          <li><strong>Cidade/UF:</strong> ${local || 'nao informado'}</li>
          <li><strong>Responsavel:</strong> ${input.responsavelNome || 'nao informado'}</li>
          <li><strong>E-mail responsavel:</strong> ${input.responsavelEmail || 'nao informado'}</li>
          <li><strong>Telefone responsavel:</strong> ${input.responsavelTelefone || 'nao informado'}</li>
          <li><strong>Backend da instancia:</strong> ${backendUrl}</li>
          <li><strong>Origem:</strong> ${input.origem}</li>
        </ul>
        <p>
          <a href="${painelMasterUrl}" target="_blank" rel="noopener noreferrer">
            Abrir SaaS Master
          </a>
        </p>
      </div>
    `;

    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: emailRemetente,
          to: [emailDestino],
          subject: assunto,
          html,
        }),
      });

      if (!resp.ok) {
        const erro = await resp.text().catch(() => '');
        return {
          ok: false,
          skipped: false,
          motivo: `falha_resend_${resp.status}`,
          erro,
        };
      }

      return { ok: true };
    } catch (err: any) {
      return {
        ok: false,
        skipped: false,
        motivo: 'erro_rede_email',
        erro: err?.message || String(err),
      };
    }
  }

  private async provisionarAdminLocalAoAtivarLicenca(config: any) {
    // Nunca alterar credencial no backend que estiver operando como SaaS Master.
    if (this.isSaasMasterMode()) return;

    const email = (config?.onboarding_responsavel_email || '')
      .trim()
      .toLowerCase();
    if (!email) return;

    const nome =
      (config?.onboarding_responsavel_nome || 'Administrador').trim() ||
      'Administrador';
    const senhaHash = await bcrypt.hash('123456', 10);

    const admin = await this.prisma.usuarios.findFirst({
      where: { role: 'ADMIN', ativo: true },
      orderBy: { criado_em: 'asc' },
    });

    if (!admin) return;

    const emailEmUso = await this.prisma.usuarios.findFirst({
      where: {
        email,
        id: { not: admin.id },
      },
      select: { id: true },
    });

    if (emailEmUso) {
      // Evita colisão de e-mail sem derrubar o fluxo de liberação.
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.usuarios.update({
        where: { id: admin.id },
        data: {
          email,
          nome,
          senha_hash: senhaHash,
          atualizado_em: new Date(),
        },
      });

      await tx.auth_sessoes.updateMany({
        where: { usuario_id: admin.id, revogada_em: null },
        data: { revogada_em: new Date() },
      });
    });
  }

  private async obterRegistroCamaraAtual() {
    const preferEnv = (process.env.CAMARA_INSTANCE_CODE || '')
      .trim()
      .toLowerCase();
    const prefer =
      preferEnv ||
      (this.isSaasMasterMode() ? 'default' : 'pendente-onboarding');
    let config = await this.prisma.camara_configuracoes.findUnique({
      where: { codigo_instancia: prefer },
    });
    if (
      (!config && prefer === 'pendente-onboarding') ||
      (config &&
        !this.isSaasMasterMode() &&
        this.isCodigoInstanciaReservado(config.codigo_instancia))
    ) {
      const instanciaReal = await this.prisma.camara_configuracoes.findFirst({
        where: {
          codigo_instancia: { notIn: ['default', 'pendente-onboarding'] },
        },
        orderBy: { atualizado_em: 'desc' },
      });
      if (instanciaReal) {
        return instanciaReal;
      }
    }
    if (!config && prefer === 'pendente-onboarding') {
      config = await this.prisma.camara_configuracoes.findFirst({
        orderBy: { atualizado_em: 'desc' },
      });
    }
    if (!config) {
      config = await this.prisma.camara_configuracoes.create({
        data: {
          codigo_instancia: prefer,
          nome_oficial: 'Camara Municipal',
          licenca_status: licenca_status.TESTE,
        },
      });
    }
    return config;
  }

  private async sincronizarLicencaComSaasSePossivel() {
    const masterApi = (process.env.MASTER_API_URL || '').trim();
    const sharedKey = (process.env.ONBOARDING_SHARED_KEY || '').trim();
    if (!masterApi || !sharedKey) return;

    const agora = Date.now();
    if (agora - this.ultimoSyncLicencaSaasEm < 15000) {
      return;
    }
    this.ultimoSyncLicencaSaasEm = agora;

    const atual = await this.obterRegistroCamaraAtual();
    const codigo = (atual.codigo_instancia || '').trim().toLowerCase();
    if (!codigo) return;

    try {
      const resp = await fetch(
        `${masterApi.replace(/\/$/, '')}/configuracao/licenca/sync-publico`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-onboarding-key': sharedKey,
          },
          body: JSON.stringify({ codigo_instancia: codigo }),
        },
      );

      if (!resp.ok) return;
      const data: any = await resp.json();
      if (!data?.ok || !data?.config) {
        const mensagem = String(data?.mensagem || '').toLowerCase();
        if (mensagem.includes('instancia nao encontrada')) {
          await this.prisma.camara_configuracoes.update({
            where: { id: atual.id },
            data: {
              licenca_status: licenca_status.BLOQUEADA,
              atualizado_em: new Date(),
            } as any,
          });
        }
        return;
      }

      await this.prisma.camara_configuracoes.update({
        where: { id: atual.id },
        data: {
          licenca_status: data.config.licenca_status,
          licenca_expira_em: data.config.licenca_expira_em
            ? new Date(data.config.licenca_expira_em)
            : null,
          licenca_offline_valor:
            typeof data.config.licenca_offline_valor === 'number'
              ? Math.max(1, data.config.licenca_offline_valor)
              : ((atual as any).licenca_offline_valor ?? 30),
          licenca_offline_unidade: (data.config.licenca_offline_unidade ||
            (atual as any).licenca_offline_unidade ||
            'DIAS') as any,
          onboarding_status:
            data.config.licenca_status === licenca_status.ATIVA
              ? 'APROVADO'
              : (atual as any).onboarding_status || 'SOLICITADO',
          onboarding_aprovado_em:
            data.config.licenca_status === licenca_status.ATIVA
              ? new Date()
              : (atual as any).onboarding_aprovado_em || null,
          licenca_ultimo_sync_em: new Date(),
          atualizado_em: new Date(),
        } as any,
      });

      if (data.config.licenca_status === licenca_status.ATIVA) {
        const atualizado = await this.prisma.camara_configuracoes.findUnique({
          where: { id: atual.id },
        });
        if (atualizado) {
          await this.provisionarAdminLocalAoAtivarLicenca(atualizado as any);
        }
      }
    } catch {
      // Sem rede ou SaaS indisponivel: mantem estado local e segue.
    }
  }

  private async enviarHeartbeatSaasSePossivel() {
    if (this.heartbeatRodando) return;
    this.heartbeatRodando = true;
    try {
      const masterApi = (process.env.MASTER_API_URL || '').trim();
      const monitorToken = (process.env.MONITOR_TOKEN || '').trim();
      if (!masterApi || !monitorToken) return;

      const atual = await this.obterRegistroCamaraAtual();
      const codigo = (atual.codigo_instancia || '').trim().toLowerCase();
      if (!codigo) return;

      await fetch(
        `${masterApi.replace(/\/$/, '')}/configuracao/monitor/heartbeat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            codigo_instancia: codigo,
            monitor_token: monitorToken,
            versao: process.env.APP_VERSION || 'local-dev',
            latencia_ms: 0,
          }),
        },
      );
    } finally {
      this.heartbeatRodando = false;
    }
  }

  async validarAcessoPorLicenca() {
    if (this.isSaasMasterMode()) {
      return { ok: true, motivo: 'saas_master' };
    }

    await this.sincronizarLicencaComSaasSePossivel();
    const atual = await this.obterCamara();
    const config: any = atual.config as any;
    const exigirAtivacao = process.env.REQUIRE_SAAS_ACTIVATION === 'true';

    if (!exigirAtivacao) {
      return { ok: true, motivo: 'ativacao_nao_obrigatoria' };
    }

    if (config.licenca_status === licenca_status.TESTE) {
      return { ok: false, motivo: 'nao_ativado' };
    }
    if (config.licenca_status === licenca_status.BLOQUEADA) {
      return { ok: false, motivo: 'bloqueada' };
    }
    if (config.licenca_status === licenca_status.INADIMPLENTE) {
      return { ok: false, motivo: 'inadimplente' };
    }
    if (
      config.licenca_expira_em &&
      new Date(config.licenca_expira_em).getTime() < Date.now()
    ) {
      return { ok: false, motivo: 'expirada' };
    }

    const offlineValor = Math.max(
      1,
      Number(config.licenca_offline_valor || 30),
    );
    const offlineUnidade = (
      config.licenca_offline_unidade || 'DIAS'
    ).toUpperCase();
    const mult =
      offlineUnidade === 'ANOS'
        ? 365 * 24 * 60 * 60 * 1000
        : offlineUnidade === 'MESES'
          ? 30 * 24 * 60 * 60 * 1000
          : 24 * 60 * 60 * 1000;
    const ultimaSync = config.licenca_ultimo_sync_em
      ? new Date(config.licenca_ultimo_sync_em).getTime()
      : new Date(config.atualizado_em || Date.now()).getTime();
    const limiteOffline = ultimaSync + offlineValor * mult;
    if (Date.now() > limiteOffline) {
      return { ok: false, motivo: 'offline_expirado' };
    }

    return { ok: true, motivo: 'ativa' };
  }

  async obterCamara() {
    const config = await this.obterRegistroCamaraAtual();

    return { ok: true, config };
  }

  async obterStatusOnboarding() {
    await this.sincronizarLicencaComSaasSePossivel();
    const atual = await this.obterCamara();
    const c: any = atual.config;
    return {
      ok: true,
      onboarding_status: c.onboarding_status || 'NAO_INICIADO',
      licenca_status: c.licenca_status,
      liberado_login: c.licenca_status === licenca_status.ATIVA,
      nome_oficial: c.nome_oficial,
      codigo_instancia: c.codigo_instancia,
      onboarding_enviado_em: c.onboarding_enviado_em || null,
      onboarding_aprovado_em: c.onboarding_aprovado_em || null,
    };
  }

  async sincronizarLicencaAgora() {
    this.ultimoSyncLicencaSaasEm = 0;
    await this.sincronizarLicencaComSaasSePossivel();
    const atual = await this.obterCamara();
    const c: any = atual.config;
    return {
      ok: true,
      codigo_instancia: c.codigo_instancia,
      licenca_status: c.licenca_status,
      licenca_ultimo_sync_em: c.licenca_ultimo_sync_em || null,
      onboarding_status: c.onboarding_status || 'NAO_INICIADO',
      liberado_login: c.licenca_status === licenca_status.ATIVA,
    };
  }

  async solicitarPrimeiroAcesso(
    body: {
      codigo_instancia: string;
      nome_oficial: string;
      backend_url?: string | null;
      cidade?: string | null;
      uf?: string | null;
      responsavel_nome: string;
      responsavel_email: string;
      responsavel_telefone?: string | null;
    },
    contexto?: { ip?: string | null; userAgent?: string | null },
  ) {
    const codigo = body.codigo_instancia.trim().toLowerCase();
    const atual = await this.obterRegistroCamaraAtual();
    const existenteMesmoCodigo =
      await this.prisma.camara_configuracoes.findUnique({
        where: { codigo_instancia: codigo },
        select: { id: true, codigo_instancia: true },
      });

    const targetId =
      existenteMesmoCodigo && existenteMesmoCodigo.id !== atual.id
        ? existenteMesmoCodigo.id
        : atual.id;

    const atualizado = await this.prisma.camara_configuracoes.update({
      where: { id: targetId },
      data: {
        codigo_instancia: codigo,
        nome_oficial: body.nome_oficial.trim(),
        backend_url:
          this.resolverBackendUrlInstancia(
            body.backend_url,
            process.env.PUBLIC_API_BASE_URL,
            codigo,
          ) || null,
        cidade: body.cidade?.trim() || null,
        uf: body.uf?.trim().toUpperCase() || null,
        licenca_status: licenca_status.TESTE,
        onboarding_status: 'SOLICITADO',
        onboarding_responsavel_nome: body.responsavel_nome.trim(),
        onboarding_responsavel_email: body.responsavel_email
          .trim()
          .toLowerCase(),
        onboarding_responsavel_telefone:
          body.responsavel_telefone?.trim() || null,
        onboarding_enviado_em: new Date(),
        atualizado_em: new Date(),
      } as any,
    });

    if (
      existenteMesmoCodigo &&
      existenteMesmoCodigo.id !== atual.id &&
      this.isCodigoInstanciaReservado(atual.codigo_instancia) &&
      !this.isSaasMasterMode()
    ) {
      await this.prisma.camara_configuracoes.delete({
        where: { id: atual.id },
      });
    }

    let sincronizadoNoSaas = false;
    const masterApi = (process.env.MASTER_API_URL || '').trim();
    const sharedKey = (process.env.ONBOARDING_SHARED_KEY || '').trim();
    if (masterApi && sharedKey) {
      try {
        const resp = await fetch(
          `${masterApi.replace(/\/$/, '')}/configuracao/onboarding/registro-publico`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-onboarding-key': sharedKey,
            },
            body: JSON.stringify({
              codigo_instancia: codigo,
              nome_oficial: body.nome_oficial,
              backend_url:
                this.resolverBackendUrlInstancia(
                  body.backend_url,
                  process.env.PUBLIC_API_BASE_URL,
                  codigo,
                ) || null,
              cidade: body.cidade || null,
              uf: body.uf || null,
              responsavel_nome: body.responsavel_nome,
              responsavel_email: body.responsavel_email,
              responsavel_telefone: body.responsavel_telefone || null,
              origem_ip: contexto?.ip || null,
              origem_user_agent: contexto?.userAgent || null,
            }),
          },
        );
        sincronizadoNoSaas = resp.ok;
      } catch {
        sincronizadoNoSaas = false;
      }
    }

    await this.auditoriaService.registrarEvento({
      acao: 'SAAS_ONBOARDING_SOLICITADO',
      entidade: 'camara_configuracao',
      entidadeId: atualizado.id,
      detalhes: {
        codigo_instancia: atualizado.codigo_instancia,
        nome_oficial: atualizado.nome_oficial,
        sincronizado_no_saas: sincronizadoNoSaas,
      },
      contexto: {
        ip: contexto?.ip || null,
        userAgent: contexto?.userAgent || null,
      },
    });

    return {
      ok: true,
      mensagem: sincronizadoNoSaas
        ? 'Solicitacao enviada e sincronizada com o SaaS.'
        : 'Solicitacao registrada localmente. Aguardando sincronizacao com o SaaS.',
      sincronizado_no_saas: sincronizadoNoSaas,
    };
  }

  async registrarOnboardingPublico(
    body: {
      codigo_instancia: string;
      nome_oficial: string;
      backend_url?: string | null;
      cidade?: string | null;
      uf?: string | null;
      responsavel_nome: string;
      responsavel_email: string;
      responsavel_telefone?: string | null;
      origem_ip?: string | null;
      origem_user_agent?: string | null;
    },
    onboardingKey?: string | null,
    backendUrlDetectado?: string | null,
  ) {
    const esperado = (process.env.ONBOARDING_SHARED_KEY || '').trim();
    if (!esperado || !onboardingKey || onboardingKey !== esperado) {
      return { ok: false, mensagem: 'Chave de onboarding invalida.' };
    }
    const codigo = body.codigo_instancia.trim().toLowerCase();
    const existente = await this.prisma.camara_configuracoes.findUnique({
      where: { codigo_instancia: codigo },
      select: { id: true },
    });

    const config = await this.prisma.camara_configuracoes.upsert({
      where: { codigo_instancia: codigo },
      create: {
        codigo_instancia: codigo,
        nome_oficial: body.nome_oficial,
        backend_url:
          this.resolverBackendUrlInstancia(
            body.backend_url,
            backendUrlDetectado,
            codigo,
          ) || null,
        cidade: body.cidade?.trim() || null,
        uf: body.uf?.trim().toUpperCase() || null,
        licenca_status: licenca_status.TESTE,
        onboarding_status: 'SOLICITADO',
        onboarding_responsavel_nome: body.responsavel_nome.trim(),
        onboarding_responsavel_email: body.responsavel_email
          .trim()
          .toLowerCase(),
        onboarding_responsavel_telefone:
          body.responsavel_telefone?.trim() || null,
        onboarding_enviado_em: new Date(),
      } as any,
      update: {
        nome_oficial: body.nome_oficial,
        backend_url:
          this.resolverBackendUrlInstancia(
            body.backend_url,
            backendUrlDetectado,
            codigo,
          ) || null,
        cidade: body.cidade?.trim() || null,
        uf: body.uf?.trim().toUpperCase() || null,
        onboarding_status: 'SOLICITADO',
        onboarding_responsavel_nome: body.responsavel_nome.trim(),
        onboarding_responsavel_email: body.responsavel_email
          .trim()
          .toLowerCase(),
        onboarding_responsavel_telefone:
          body.responsavel_telefone?.trim() || null,
        onboarding_enviado_em: new Date(),
        atualizado_em: new Date(),
      } as any,
    });

    await this.auditoriaService.registrarEvento({
      acao: 'SAAS_ONBOARDING_RECEBIDO',
      entidade: 'camara_configuracao',
      entidadeId: config.id,
      detalhes: {
        codigo_instancia: config.codigo_instancia,
        origem_ip: body.origem_ip || null,
      },
    });

    if (!existente) {
      const envio = await this.notificarNovaCamaraPorEmail({
        codigoInstancia: config.codigo_instancia,
        nomeOficial: config.nome_oficial,
        cidade: (config as any).cidade || null,
        uf: (config as any).uf || null,
        responsavelNome: (config as any).onboarding_responsavel_nome || null,
        responsavelEmail: (config as any).onboarding_responsavel_email || null,
        responsavelTelefone:
          (config as any).onboarding_responsavel_telefone || null,
        backendUrl: (config as any).backend_url || null,
        origem: 'onboarding_publico',
      });
      await this.auditoriaService.registrarEvento({
        acao: envio.ok
          ? 'SAAS_ALERTA_EMAIL_NOVA_CAMARA_ENVIADO'
          : 'SAAS_ALERTA_EMAIL_NOVA_CAMARA_FALHA',
        entidade: 'camara_configuracao',
        entidadeId: config.id,
        detalhes: {
          codigo_instancia: config.codigo_instancia,
          envio,
        },
      });
    }

    return { ok: true, mensagem: 'Onboarding recebido no SaaS.', config };
  }

  async obterLicencaPublica(
    codigoInstancia: string,
    onboardingKey?: string | null,
  ) {
    const esperado = (process.env.ONBOARDING_SHARED_KEY || '').trim();
    if (!esperado || !onboardingKey || onboardingKey !== esperado) {
      return { ok: false, mensagem: 'Chave de onboarding invalida.' };
    }

    const codigo = (codigoInstancia || '').trim().toLowerCase();
    if (!codigo) {
      return { ok: false, mensagem: 'Codigo da instancia obrigatorio.' };
    }

    const config = await this.prisma.camara_configuracoes.findUnique({
      where: { codigo_instancia: codigo },
      select: {
        id: true,
        codigo_instancia: true,
        licenca_status: true,
        licenca_expira_em: true,
        licenca_offline_valor: true,
        licenca_offline_unidade: true,
        onboarding_status: true,
        onboarding_aprovado_em: true,
      },
    });

    if (!config) {
      return { ok: false, mensagem: 'Instancia nao encontrada.' };
    }

    // Quando a instancia consulta a licenca com chave valida, consideramos a conexao ativa.
    await this.prisma.camara_configuracoes.update({
      where: { id: config.id },
      data: {
        ultimo_heartbeat_em: new Date(),
        licenca_ultimo_sync_em: new Date(),
        atualizado_em: new Date(),
      } as any,
    });

    const { id, ...configSemId } = config as any;
    return { ok: true, config: configSemId };
  }

  async atualizarCamara(body: {
    nome_oficial?: string;
    nome_exibicao?: string | null;
    tenant_slug?: string | null;
    plano_nome?: string | null;
    backend_url?: string | null;
    brasao_url?: string | null;
    cidade?: string | null;
    uf?: string | null;
  }) {
    const atual = await this.obterCamara();
    const config = await this.prisma.camara_configuracoes.update({
      where: { id: atual.config.id },
      data: {
        nome_oficial: body.nome_oficial || atual.config.nome_oficial,
        nome_exibicao: body.nome_exibicao ?? null,
        tenant_slug: body.tenant_slug ?? null,
        plano_nome: body.plano_nome ?? atual.config.plano_nome,
        backend_url:
          this.resolverBackendUrlInstancia(
            body.backend_url,
            atual.config.backend_url,
            atual.config.codigo_instancia,
          ) || null,
        brasao_url: body.brasao_url ?? null,
        cidade: body.cidade ?? null,
        uf: body.uf?.toUpperCase() ?? null,
        atualizado_em: new Date(),
      },
    });
    return { ok: true, config };
  }

  async atualizarLicenca(body: {
    licenca_status?: licenca_status;
    licenca_expira_em?: string | null;
    licenca_offline_valor?: number | null;
    licenca_offline_unidade?: 'DIAS' | 'MESES' | 'ANOS' | null;
  }) {
    const atual = await this.obterCamara();
    const config = await this.prisma.camara_configuracoes.update({
      where: { id: atual.config.id },
      data: {
        licenca_status: body.licenca_status || atual.config.licenca_status,
        licenca_expira_em: body.licenca_expira_em
          ? new Date(body.licenca_expira_em)
          : null,
        licenca_offline_valor:
          typeof body.licenca_offline_valor === 'number'
            ? Math.max(1, body.licenca_offline_valor)
            : ((atual.config as any).licenca_offline_valor ?? 30),
        licenca_offline_unidade: (body.licenca_offline_unidade ||
          (atual.config as any).licenca_offline_unidade ||
          'DIAS') as any,
        licenca_ultimo_sync_em: new Date(),
        onboarding_status:
          (body.licenca_status || atual.config.licenca_status) ===
          licenca_status.ATIVA
            ? 'APROVADO'
            : (atual.config as any).onboarding_status || 'SOLICITADO',
        onboarding_aprovado_em:
          (body.licenca_status || atual.config.licenca_status) ===
          licenca_status.ATIVA
            ? new Date()
            : (atual.config as any).onboarding_aprovado_em || null,
        atualizado_em: new Date(),
      } as any,
    });
    return { ok: true, config };
  }

  async heartbeat() {
    const atual = await this.obterCamara();
    const config = await this.prisma.camara_configuracoes.update({
      where: { id: atual.config.id },
      data: {
        ultimo_heartbeat_em: new Date(),
      },
    });
    return { ok: true, config };
  }

  async listarCamaras() {
    const itens = await this.prisma.camara_configuracoes.findMany({
      orderBy: { atualizado_em: 'desc' },
    });
    const agora = Date.now();
    const itensMonitorados = itens.map((item) => {
      const hb = item.ultimo_heartbeat_em
        ? new Date(item.ultimo_heartbeat_em).getTime()
        : 0;
      const deltaSeg = hb ? Math.floor((agora - hb) / 1000) : null;
      const status_online =
        deltaSeg !== null && deltaSeg <= 90 ? 'ONLINE' : 'OFFLINE';
      return {
        ...item,
        status_online,
        heartbeat_segundos: deltaSeg,
      };
    });
    return { ok: true, itens: itensMonitorados };
  }

  async criarOuAtualizarInstancia(
    body: {
      codigo_instancia: string;
      nome_oficial: string;
      nome_exibicao?: string | null;
      tenant_slug?: string | null;
      plano_nome?: string | null;
      backend_url?: string | null;
      cidade?: string | null;
      uf?: string | null;
      licenca_status?: licenca_status;
      licenca_expira_em?: string | null;
      licenca_offline_valor?: number | null;
      licenca_offline_unidade?: 'DIAS' | 'MESES' | 'ANOS' | null;
    },
    contexto?: AuditoriaContexto,
  ) {
    const codigo = body.codigo_instancia.trim().toLowerCase();
    const existente = await this.prisma.camara_configuracoes.findUnique({
      where: { codigo_instancia: codigo },
      select: { id: true },
    });

    const config = await this.prisma.camara_configuracoes.upsert({
      where: { codigo_instancia: codigo },
      create: {
        codigo_instancia: codigo,
        nome_oficial: body.nome_oficial,
        nome_exibicao: body.nome_exibicao ?? null,
        tenant_slug: body.tenant_slug ?? null,
        plano_nome: body.plano_nome ?? 'Plano Basico',
        backend_url:
          this.resolverBackendUrlInstancia(body.backend_url, null, codigo) ||
          null,
        cidade: body.cidade ?? null,
        uf: body.uf?.toUpperCase() ?? null,
        licenca_status: body.licenca_status || licenca_status.TESTE,
        licenca_expira_em: body.licenca_expira_em
          ? new Date(body.licenca_expira_em)
          : null,
        licenca_offline_valor:
          typeof body.licenca_offline_valor === 'number'
            ? Math.max(1, body.licenca_offline_valor)
            : 30,
        licenca_offline_unidade: (body.licenca_offline_unidade ||
          'DIAS') as any,
        licenca_ultimo_sync_em: new Date(),
      } as any,
      update: {
        nome_oficial: body.nome_oficial,
        nome_exibicao: body.nome_exibicao ?? null,
        tenant_slug: body.tenant_slug ?? null,
        plano_nome: body.plano_nome ?? 'Plano Basico',
        backend_url:
          this.resolverBackendUrlInstancia(body.backend_url, null, codigo) ||
          null,
        cidade: body.cidade ?? null,
        uf: body.uf?.toUpperCase() ?? null,
        licenca_status: body.licenca_status || licenca_status.TESTE,
        licenca_expira_em: body.licenca_expira_em
          ? new Date(body.licenca_expira_em)
          : null,
        licenca_offline_valor:
          typeof body.licenca_offline_valor === 'number'
            ? Math.max(1, body.licenca_offline_valor)
            : undefined,
        licenca_offline_unidade: (body.licenca_offline_unidade ||
          undefined) as any,
        licenca_ultimo_sync_em: new Date(),
        atualizado_em: new Date(),
      } as any,
    });

    await this.auditoriaService.registrarEvento({
      acao: existente ? 'SAAS_CAMARA_EDITADA' : 'SAAS_CAMARA_CRIADA',
      entidade: 'camara_configuracao',
      entidadeId: config.id,
      detalhes: {
        codigo_instancia: config.codigo_instancia,
        nome_oficial: config.nome_oficial,
        plano_nome: config.plano_nome,
        licenca_status: config.licenca_status,
      },
      contexto,
    });

    if (!existente) {
      const envio = await this.notificarNovaCamaraPorEmail({
        codigoInstancia: config.codigo_instancia,
        nomeOficial: config.nome_oficial,
        cidade: (config as any).cidade || null,
        uf: (config as any).uf || null,
        responsavelNome: (config as any).onboarding_responsavel_nome || null,
        responsavelEmail: (config as any).onboarding_responsavel_email || null,
        responsavelTelefone:
          (config as any).onboarding_responsavel_telefone || null,
        backendUrl: (config as any).backend_url || null,
        origem: 'saas_manual',
      });
      await this.auditoriaService.registrarEvento({
        acao: envio.ok
          ? 'SAAS_ALERTA_EMAIL_NOVA_CAMARA_ENVIADO'
          : 'SAAS_ALERTA_EMAIL_NOVA_CAMARA_FALHA',
        entidade: 'camara_configuracao',
        entidadeId: config.id,
        detalhes: {
          codigo_instancia: config.codigo_instancia,
          envio,
        },
        contexto,
      });
    }

    return { ok: true, config };
  }

  async gerarTokenInstancia(
    codigoInstancia: string,
    contexto?: AuditoriaContexto,
  ) {
    const codigo = codigoInstancia.trim().toLowerCase();
    const config = await this.prisma.camara_configuracoes.findUnique({
      where: { codigo_instancia: codigo },
    });
    if (!config) {
      return { ok: false, mensagem: 'Instancia nao encontrada.' };
    }
    const token = randomBytes(24).toString('hex');
    const tokenHash = this.hashMonitorToken(token);
    await this.prisma.camara_configuracoes.update({
      where: { id: config.id },
      data: { monitor_token_hash: tokenHash, atualizado_em: new Date() },
    });

    await this.auditoriaService.registrarEvento({
      acao: 'SAAS_TOKEN_ROTACIONADO',
      entidade: 'camara_configuracao',
      entidadeId: config.id,
      detalhes: { codigo_instancia: codigo },
      contexto,
    });

    return { ok: true, codigo_instancia: codigo, monitor_token: token };
  }

  async revogarTokenInstancia(
    codigoInstancia: string,
    contexto?: AuditoriaContexto,
  ) {
    const codigo = codigoInstancia.trim().toLowerCase();
    const config = await this.prisma.camara_configuracoes.findUnique({
      where: { codigo_instancia: codigo },
    });
    if (!config) {
      return { ok: false, mensagem: 'Instancia nao encontrada.' };
    }

    await this.prisma.camara_configuracoes.update({
      where: { id: config.id },
      data: {
        monitor_token_hash: null,
        atualizado_em: new Date(),
      },
    });

    await this.auditoriaService.registrarEvento({
      acao: 'SAAS_TOKEN_REVOGADO',
      entidade: 'camara_configuracao',
      entidadeId: config.id,
      detalhes: { codigo_instancia: codigo },
      contexto,
    });

    return { ok: true, mensagem: 'Token de monitoramento revogado.' };
  }

  async excluirInstancia(
    codigoInstancia: string,
    contexto?: AuditoriaContexto,
  ) {
    const codigo = codigoInstancia.trim().toLowerCase();
    if (codigo === 'default') {
      return {
        ok: false,
        mensagem: 'A instancia padrao (default) nao pode ser excluida.',
      };
    }

    const existente = await this.prisma.camara_configuracoes.findUnique({
      where: { codigo_instancia: codigo },
      select: { id: true, codigo_instancia: true },
    });

    if (!existente) {
      return { ok: false, mensagem: 'Instancia nao encontrada.' };
    }

    await this.prisma.camara_configuracoes.delete({
      where: { id: existente.id },
    });

    await this.auditoriaService.registrarEvento({
      acao: 'SAAS_CAMARA_EXCLUIDA',
      entidade: 'camara_configuracao',
      entidadeId: existente.id,
      detalhes: { codigo_instancia: existente.codigo_instancia },
      contexto,
    });

    return { ok: true, mensagem: 'Instancia excluida com sucesso.' };
  }

  async receberHeartbeat(
    body: {
      codigo_instancia: string;
      monitor_token: string;
      versao?: string | null;
      latencia_ms?: number | null;
    },
    contexto?: { ip?: string | null; userAgent?: string | null },
  ) {
    const codigo = body.codigo_instancia.trim().toLowerCase();
    const config = await this.prisma.camara_configuracoes.findUnique({
      where: { codigo_instancia: codigo },
    });
    if (!config) return { ok: false, mensagem: 'Instancia nao cadastrada.' };
    const tokenHash = this.hashMonitorToken(body.monitor_token || '');

    // Pareamento automatico: se a instancia ainda nao tem token vinculado no SaaS,
    // aceitamos o primeiro heartbeat e gravamos o hash enviado.
    if (!config.monitor_token_hash) {
      await this.prisma.camara_configuracoes.update({
        where: { id: config.id },
        data: {
          monitor_token_hash: tokenHash,
          atualizado_em: new Date(),
        },
      });
      config.monitor_token_hash = tokenHash;
    }

    if (tokenHash !== config.monitor_token_hash) {
      return { ok: false, mensagem: 'Token de monitoramento invalido.' };
    }

    await this.prisma.camara_configuracoes.update({
      where: { id: config.id },
      data: {
        ultimo_heartbeat_em: new Date(),
        monitor_versao: body.versao ?? config.monitor_versao,
        monitor_latencia_ms:
          typeof body.latencia_ms === 'number'
            ? body.latencia_ms
            : config.monitor_latencia_ms,
        monitor_ip: contexto?.ip || null,
        monitor_user_agent: contexto?.userAgent || null,
      },
    });

    const licencaValidaParaSync =
      config.licenca_status === licenca_status.ATIVA &&
      (!config.licenca_expira_em ||
        new Date(config.licenca_expira_em).getTime() > Date.now());

    if (licencaValidaParaSync) {
      await this.prisma.camara_configuracoes.update({
        where: { id: config.id },
        data: { licenca_ultimo_sync_em: new Date() } as any,
      });
    }

    return {
      ok: true,
      codigo_instancia: codigo,
      recebido_em: new Date().toISOString(),
    };
  }

  async redefinirCredencialAdminInstancia(
    body: {
      codigo_instancia: string;
      novo_email?: string | null;
      nova_senha: string;
      novo_nome?: string | null;
    },
    contexto?: AuditoriaContexto,
  ) {
    if (this.isSaasSingleBackendMode()) {
      return {
        ok: false,
        mensagem:
          'Modo unificado ativo: redefinicao remota por instancia desabilitada para evitar alterar o login do SaaS Master.',
      };
    }

    const codigo = (body.codigo_instancia || '').trim().toLowerCase();
    const senha = (body.nova_senha || '').trim();
    if (!codigo) {
      return { ok: false, mensagem: 'Codigo da instancia obrigatorio.' };
    }
    if (senha.length < 6) {
      return {
        ok: false,
        mensagem: 'Nova senha deve ter pelo menos 6 caracteres.',
      };
    }

    const instanciaAlvo = await this.prisma.camara_configuracoes.findUnique({
      where: { codigo_instancia: codigo },
    });
    if (!instanciaAlvo) {
      return { ok: false, mensagem: 'Instancia nao encontrada.' };
    }

    const atual = await this.obterRegistroCamaraAtual();
    const codigoAtual = (atual.codigo_instancia || '').trim().toLowerCase();
    const isInstanciaLocal = codigoAtual === codigo;

    if (!isInstanciaLocal) {
      const backendUrl = this.resolverBackendUrlInstancia(
        instanciaAlvo.backend_url,
        null,
        codigo,
        { evitarFallbackGlobal: true },
      );
      if (!backendUrl) {
        return {
          ok: false,
          mensagem:
            'Backend da instancia nao encontrado. Configure backend_url da instancia ou INSTANCE_BACKEND_URL_TEMPLATE no SaaS Master.',
        };
      }
      if (this.backendApontaParaSaasMaster(backendUrl)) {
        return {
          ok: false,
          mensagem:
            'Backend da instancia aponta para o proprio SaaS Master. Configure a URL da API da camara.',
        };
      }

      const masterInstanceAdminKey = (
        process.env.MASTER_INSTANCE_ADMIN_KEY || ''
      ).trim();
      const onboardingSharedKey = (
        process.env.ONBOARDING_SHARED_KEY || ''
      ).trim();
      const chaveOperacao = masterInstanceAdminKey || onboardingSharedKey;
      const usarFallbackOnboarding =
        !masterInstanceAdminKey && !!onboardingSharedKey;
      if (!chaveOperacao) {
        return {
          ok: false,
          mensagem:
            'Configure MASTER_INSTANCE_ADMIN_KEY ou ONBOARDING_SHARED_KEY no SaaS Master.',
        };
      }

      try {
        const resp = await fetch(
          `${backendUrl.replace(/\/$/, '')}/configuracao/camaras/admin/redefinir-credencial-local`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-master-admin-key': chaveOperacao,
              ...(usarFallbackOnboarding
                ? { 'x-onboarding-key': onboardingSharedKey }
                : {}),
            },
            body: JSON.stringify({
              codigo_instancia: codigo,
              novo_email: body.novo_email || null,
              novo_nome: body.novo_nome || null,
              nova_senha: body.nova_senha,
            }),
          },
        );

        let data: any = null;
        try {
          data = await resp.json();
        } catch {
          data = null;
        }

        if (!resp.ok || data?.ok === false) {
          return {
            ok: false,
            mensagem:
              data?.mensagem ||
              `Falha ao redefinir credencial na instancia remota (HTTP ${resp.status}).`,
          };
        }

        await this.auditoriaService.registrarEvento({
          acao: 'SAAS_ADMIN_CREDENCIAL_REDEFINIDA_REMOTA',
          entidade: 'camara_configuracao',
          entidadeId: instanciaAlvo.id,
          detalhes: {
            codigo_instancia: codigo,
            backend_url: backendUrl,
          },
          contexto,
        });

        return {
          ok: true,
          mensagem: data?.mensagem || 'Credencial redefinida com sucesso.',
          admin: data?.admin || null,
        };
      } catch {
        return {
          ok: false,
          mensagem:
            'Falha de conexao com a instancia remota. Verifique conectividade e URL padrao da instancia.',
        };
      }
    }

    return this.executarResetAdminLocal(body, contexto);
  }

  async testarConexaoInstancia(codigoInstancia: string) {
    const codigo = (codigoInstancia || '').trim().toLowerCase();
    if (!codigo)
      return { ok: false, mensagem: 'Codigo da instancia obrigatorio.' };

    const instancia = await this.prisma.camara_configuracoes.findUnique({
      where: { codigo_instancia: codigo },
    });
    if (!instancia) return { ok: false, mensagem: 'Instancia nao encontrada.' };

    if (this.isSaasSingleBackendMode()) {
      return {
        ok: true,
        mensagem: 'Conexao OK (modo unificado)',
        detalhe: `onboarding_status: ${(instancia as any).onboarding_status || '-'} | licenca_status: ${(instancia as any).licenca_status || '-'}`,
      };
    }

    const backendUrl = this.resolverBackendUrlInstancia(
      instancia.backend_url,
      null,
      codigoInstancia,
      { evitarFallbackGlobal: true },
    );
    if (!backendUrl) {
      return {
        ok: false,
        mensagem:
          'Backend da instancia nao encontrado. Configure backend_url da instancia ou INSTANCE_BACKEND_URL_TEMPLATE no SaaS Master.',
      };
    }
    if (this.backendApontaParaSaasMaster(backendUrl)) {
      return {
        ok: false,
        mensagem:
          'Backend da instancia aponta para o proprio SaaS Master. Configure a URL da API da camara.',
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const started = Date.now();
      const res = await fetch(
        `${backendUrl.replace(/\/$/, '')}/configuracao/onboarding/status`,
        {
          method: 'GET',
          signal: controller.signal,
        },
      );
      const elapsed = Date.now() - started;
      const data: any = await res.json().catch(() => null);

      if (!res.ok) {
        return {
          ok: false,
          mensagem: `HTTP ${res.status} em ${elapsed}ms`,
          detalhe: data?.message || data?.mensagem || 'Resposta invalida.',
        };
      }

      return {
        ok: true,
        mensagem: `Conexao OK (${elapsed}ms)`,
        detalhe: `onboarding_status: ${data?.onboarding_status || '-'} | licenca_status: ${data?.licenca_status || '-'}`,
      };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return {
          ok: false,
          mensagem: 'Timeout (8s) ao conectar na instancia.',
        };
      }
      return {
        ok: false,
        mensagem: 'Falha de conexao com backend da instancia.',
        detalhe: err?.message || String(err),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async sincronizarLicencaInstanciaAgora(codigoInstancia: string) {
    const codigo = (codigoInstancia || '').trim().toLowerCase();
    if (!codigo)
      return { ok: false, mensagem: 'Codigo da instancia obrigatorio.' };

    const instancia = await this.prisma.camara_configuracoes.findUnique({
      where: { codigo_instancia: codigo },
    });
    if (!instancia) return { ok: false, mensagem: 'Instancia nao encontrada.' };

    if (this.isSaasSingleBackendMode()) {
      const atualizado = await this.prisma.camara_configuracoes.update({
        where: { codigo_instancia: codigo },
        data: {
          licenca_ultimo_sync_em: new Date(),
          atualizado_em: new Date(),
        } as any,
      });
      return {
        ok: true,
        mensagem: `Sync concluido: ${atualizado.licenca_status || '-'}`,
        detalhe: `onboarding: ${(atualizado as any).onboarding_status || '-'} | liberado_login: ${atualizado.licenca_status === licenca_status.ATIVA ? 'sim' : 'nao'}`,
      };
    }

    const backendUrl = this.resolverBackendUrlInstancia(
      instancia.backend_url,
      null,
      codigoInstancia,
      { evitarFallbackGlobal: true },
    );
    if (!backendUrl) {
      return {
        ok: false,
        mensagem:
          'Backend da instancia nao encontrado. Configure backend_url da instancia ou INSTANCE_BACKEND_URL_TEMPLATE no SaaS Master.',
      };
    }
    if (this.backendApontaParaSaasMaster(backendUrl)) {
      return {
        ok: false,
        mensagem:
          'Backend da instancia aponta para o proprio SaaS Master. Configure a URL da API da camara.',
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(
        `${backendUrl.replace(/\/$/, '')}/configuracao/licenca/sincronizar-agora`,
        {
          method: 'POST',
          signal: controller.signal,
        },
      );
      const data: any = await res.json().catch(() => null);

      if (!res.ok || data?.ok === false) {
        return {
          ok: false,
          mensagem: data?.mensagem || `Falha no sync (HTTP ${res.status}).`,
        };
      }

      return {
        ok: true,
        mensagem: `Sync concluido: ${data?.licenca_status || '-'}`,
        detalhe: `onboarding: ${data?.onboarding_status || '-'} | liberado_login: ${data?.liberado_login ? 'sim' : 'nao'}`,
      };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return { ok: false, mensagem: 'Timeout (10s) no sync da instancia.' };
      }
      return {
        ok: false,
        mensagem: 'Falha ao sincronizar licenca na instancia.',
        detalhe: err?.message || String(err),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async chamarApiPublicaRecuperacaoInstancia(
    backendUrl: string,
    path: '/auth/forgot-password' | '/auth/reset-password',
    payload: Record<string, any>,
  ) {
    const resp = await fetch(`${backendUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    let data: any = null;
    try {
      data = await resp.json();
    } catch {
      data = null;
    }

    if (!resp.ok) {
      return {
        ok: false,
        mensagem:
          data?.message ||
          data?.mensagem ||
          `Falha na recuperacao (HTTP ${resp.status}).`,
      };
    }
    return { ok: true, data };
  }

  async solicitarRecuperacaoAdminInstancia(
    body: { codigo_instancia: string; email: string },
    contexto?: AuditoriaContexto,
  ) {
    const codigo = (body.codigo_instancia || '').trim().toLowerCase();
    const email = (body.email || '').trim().toLowerCase();
    if (!codigo || !email) {
      return {
        ok: false,
        mensagem: 'Codigo da instancia e e-mail sao obrigatorios.',
      };
    }

    const instancia = await this.prisma.camara_configuracoes.findUnique({
      where: { codigo_instancia: codigo },
    });
    if (!instancia) return { ok: false, mensagem: 'Instancia nao encontrada.' };

    const backendUrl = this.resolverBackendUrlInstancia(
      instancia.backend_url,
      null,
      codigo,
      { evitarFallbackGlobal: true },
    );
    if (!backendUrl) {
      return {
        ok: false,
        mensagem:
          'Backend da instancia nao encontrado. Configure backend_url da instancia ou INSTANCE_BACKEND_URL_TEMPLATE no SaaS Master.',
      };
    }
    if (this.backendApontaParaSaasMaster(backendUrl)) {
      return {
        ok: false,
        mensagem:
          'Backend da instancia aponta para o proprio SaaS Master. Configure a URL da API da camara.',
      };
    }

    try {
      const chamada = await this.chamarApiPublicaRecuperacaoInstancia(
        backendUrl,
        '/auth/forgot-password',
        { email },
      );
      if (!chamada.ok) return chamada;

      await this.auditoriaService.registrarEvento({
        acao: 'SAAS_ADMIN_RECUPERACAO_SOLICITADA',
        entidade: 'camara_configuracao',
        entidadeId: instancia.id,
        detalhes: { codigo_instancia: codigo, email },
        contexto,
      });

      return {
        ok: true,
        mensagem: chamada.data?.message || 'Codigo de recuperacao solicitado.',
      };
    } catch {
      return { ok: false, mensagem: 'Falha de conexao com a instancia.' };
    }
  }

  async confirmarRecuperacaoAdminInstancia(
    body: {
      codigo_instancia: string;
      email: string;
      codigo: string;
      nova_senha: string;
    },
    contexto?: AuditoriaContexto,
  ) {
    const codigoInstancia = (body.codigo_instancia || '').trim().toLowerCase();
    const email = (body.email || '').trim().toLowerCase();
    const codigo = (body.codigo || '').trim();
    const novaSenha = (body.nova_senha || '').trim();
    if (!codigoInstancia || !email || !codigo || !novaSenha) {
      return {
        ok: false,
        mensagem: 'Dados incompletos para confirmar recuperacao.',
      };
    }

    const instancia = await this.prisma.camara_configuracoes.findUnique({
      where: { codigo_instancia: codigoInstancia },
    });
    if (!instancia) return { ok: false, mensagem: 'Instancia nao encontrada.' };

    const backendUrl = this.resolverBackendUrlInstancia(
      instancia.backend_url,
      null,
      codigoInstancia,
      { evitarFallbackGlobal: true },
    );
    if (!backendUrl) {
      return {
        ok: false,
        mensagem:
          'Backend da instancia nao encontrado. Configure backend_url da instancia ou INSTANCE_BACKEND_URL_TEMPLATE no SaaS Master.',
      };
    }
    if (this.backendApontaParaSaasMaster(backendUrl)) {
      return {
        ok: false,
        mensagem:
          'Backend da instancia aponta para o proprio SaaS Master. Configure a URL da API da camara.',
      };
    }

    try {
      const chamada = await this.chamarApiPublicaRecuperacaoInstancia(
        backendUrl,
        '/auth/reset-password',
        {
          email,
          codigo,
          novaSenha,
        },
      );
      if (!chamada.ok) return chamada;

      await this.auditoriaService.registrarEvento({
        acao: 'SAAS_ADMIN_RECUPERACAO_CONFIRMADA',
        entidade: 'camara_configuracao',
        entidadeId: instancia.id,
        detalhes: { codigo_instancia: codigoInstancia, email },
        contexto,
      });

      return {
        ok: true,
        mensagem: chamada.data?.message || 'Senha redefinida com sucesso.',
      };
    } catch {
      return { ok: false, mensagem: 'Falha de conexao com a instancia.' };
    }
  }

  async redefinirCredencialAdminLocal(
    body: {
      codigo_instancia: string;
      novo_email?: string | null;
      nova_senha: string;
      novo_nome?: string | null;
    },
    masterAdminKey?: string | null,
    onboardingKey?: string | null,
    contexto?: { ip?: string | null; userAgent?: string | null },
  ) {
    const localMasterKey = (process.env.LOCAL_MASTER_ADMIN_KEY || '').trim();
    const localOnboardingKey = (process.env.ONBOARDING_SHARED_KEY || '').trim();
    const autorizadoViaMaster =
      !!localMasterKey && !!masterAdminKey && masterAdminKey === localMasterKey;
    const autorizadoViaOnboarding =
      !!localOnboardingKey &&
      !!onboardingKey &&
      onboardingKey === localOnboardingKey;
    if (!autorizadoViaMaster && !autorizadoViaOnboarding) {
      return { ok: false, mensagem: 'Chave de administracao invalida.' };
    }

    const auditoriaContexto: AuditoriaContexto = {
      usuarioId: null,
      usuarioNome: 'SaaS Master',
      usuarioRole: 'ADMIN' as any,
      ip: contexto?.ip || null,
      userAgent: contexto?.userAgent || null,
    };

    return this.executarResetAdminLocal(body, auditoriaContexto);
  }

  private async executarResetAdminLocal(
    body: {
      codigo_instancia: string;
      novo_email?: string | null;
      nova_senha: string;
      novo_nome?: string | null;
    },
    contexto?: AuditoriaContexto,
  ) {
    const codigo = (body.codigo_instancia || '').trim().toLowerCase();
    const senha = (body.nova_senha || '').trim();
    const atual = await this.obterRegistroCamaraAtual();
    if ((atual.codigo_instancia || '').trim().toLowerCase() !== codigo) {
      return {
        ok: false,
        mensagem: 'Codigo da instancia nao corresponde a esta API local.',
      };
    }
    if (senha.length < 6) {
      return {
        ok: false,
        mensagem: 'Nova senha deve ter pelo menos 6 caracteres.',
      };
    }

    const admin = await this.prisma.usuarios.findFirst({
      where: { role: 'ADMIN', ativo: true },
      orderBy: { criado_em: 'asc' },
    });

    if (!admin) {
      return { ok: false, mensagem: 'Administrador local nao encontrado.' };
    }

    const novoEmail = body.novo_email?.trim().toLowerCase() || null;
    if (novoEmail && novoEmail !== admin.email) {
      const emailEmUso = await this.prisma.usuarios.findFirst({
        where: { email: novoEmail, id: { not: admin.id } },
        select: { id: true },
      });
      if (emailEmUso) {
        return {
          ok: false,
          mensagem: 'E-mail ja esta em uso por outro usuario.',
        };
      }
    }

    const senhaHash = await bcrypt.hash(senha, 10);
    await this.prisma.$transaction(async (tx) => {
      await tx.usuarios.update({
        where: { id: admin.id },
        data: {
          email: novoEmail || admin.email,
          nome: body.novo_nome?.trim() || admin.nome,
          senha_hash: senhaHash,
          atualizado_em: new Date(),
        },
      });

      await tx.auth_sessoes.updateMany({
        where: { usuario_id: admin.id, revogada_em: null },
        data: { revogada_em: new Date() },
      });
    });

    await this.auditoriaService.registrarEvento({
      acao: 'SAAS_ADMIN_CREDENCIAL_REDEFINIDA',
      entidade: 'usuarios',
      entidadeId: admin.id,
      detalhes: {
        codigo_instancia: codigo,
        email_anterior: admin.email,
        email_novo: novoEmail || admin.email,
      },
      contexto,
    });

    return {
      ok: true,
      mensagem: 'Credencial do administrador redefinida com sucesso.',
      admin: {
        id: admin.id,
        email: novoEmail || admin.email,
        nome: body.novo_nome?.trim() || admin.nome,
      },
    };
  }
}
