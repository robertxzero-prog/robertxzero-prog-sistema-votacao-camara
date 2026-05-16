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

  private async obterRegistroCamaraAtual() {
    const prefer = (process.env.CAMARA_INSTANCE_CODE || 'default').trim().toLowerCase();
    let config = await this.prisma.camara_configuracoes.findUnique({
      where: { codigo_instancia: prefer },
    });
    if (!config) {
      config = await this.prisma.camara_configuracoes.findFirst({
        orderBy: { atualizado_em: 'desc' },
      });
    }
    if (!config) {
      config = await this.prisma.camara_configuracoes.create({
        data: {
          codigo_instancia: 'default',
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
              : (atual as any).licenca_offline_valor ?? 30,
          licenca_offline_unidade:
            (data.config.licenca_offline_unidade ||
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

      await fetch(`${masterApi.replace(/\/$/, '')}/configuracao/monitor/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo_instancia: codigo,
          monitor_token: monitorToken,
          versao: process.env.APP_VERSION || 'local-dev',
          latencia_ms: 0,
        }),
      });
    } finally {
      this.heartbeatRodando = false;
    }
  }

  async validarAcessoPorLicenca() {
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
    const offlineUnidade = (config.licenca_offline_unidade || 'DIAS').toUpperCase();
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

    const atualizado = await this.prisma.camara_configuracoes.update({
      where: { id: atual.id },
      data: {
        codigo_instancia: codigo,
        nome_oficial: body.nome_oficial.trim(),
        backend_url:
          body.backend_url?.trim() ||
          process.env.PUBLIC_API_BASE_URL?.trim() ||
          null,
        cidade: body.cidade?.trim() || null,
        uf: body.uf?.trim().toUpperCase() || null,
        licenca_status: licenca_status.TESTE,
        onboarding_status: 'SOLICITADO',
        onboarding_responsavel_nome: body.responsavel_nome.trim(),
        onboarding_responsavel_email: body.responsavel_email.trim().toLowerCase(),
        onboarding_responsavel_telefone: body.responsavel_telefone?.trim() || null,
        onboarding_enviado_em: new Date(),
        atualizado_em: new Date(),
      } as any,
    });

    let sincronizadoNoSaas = false;
    const masterApi = (process.env.MASTER_API_URL || '').trim();
    const sharedKey = (process.env.ONBOARDING_SHARED_KEY || '').trim();
    if (masterApi && sharedKey) {
      try {
        const resp = await fetch(`${masterApi.replace(/\/$/, '')}/configuracao/onboarding/registro-publico`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-onboarding-key': sharedKey,
          },
          body: JSON.stringify({
            codigo_instancia: codigo,
            nome_oficial: body.nome_oficial,
            backend_url:
              body.backend_url?.trim() ||
              process.env.PUBLIC_API_BASE_URL?.trim() ||
              null,
            cidade: body.cidade || null,
            uf: body.uf || null,
            responsavel_nome: body.responsavel_nome,
            responsavel_email: body.responsavel_email,
            responsavel_telefone: body.responsavel_telefone || null,
            origem_ip: contexto?.ip || null,
            origem_user_agent: contexto?.userAgent || null,
          }),
        });
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
  ) {
    const esperado = (process.env.ONBOARDING_SHARED_KEY || '').trim();
    if (!esperado || !onboardingKey || onboardingKey !== esperado) {
      return { ok: false, mensagem: 'Chave de onboarding invalida.' };
    }
    const codigo = body.codigo_instancia.trim().toLowerCase();
    const config = await this.prisma.camara_configuracoes.upsert({
      where: { codigo_instancia: codigo },
      create: {
        codigo_instancia: codigo,
        nome_oficial: body.nome_oficial,
        backend_url: body.backend_url?.trim() || null,
        cidade: body.cidade?.trim() || null,
        uf: body.uf?.trim().toUpperCase() || null,
        licenca_status: licenca_status.TESTE,
        onboarding_status: 'SOLICITADO',
        onboarding_responsavel_nome: body.responsavel_nome.trim(),
        onboarding_responsavel_email: body.responsavel_email.trim().toLowerCase(),
        onboarding_responsavel_telefone: body.responsavel_telefone?.trim() || null,
        onboarding_enviado_em: new Date(),
      } as any,
      update: {
        nome_oficial: body.nome_oficial,
        backend_url: body.backend_url?.trim() || null,
        cidade: body.cidade?.trim() || null,
        uf: body.uf?.trim().toUpperCase() || null,
        onboarding_status: 'SOLICITADO',
        onboarding_responsavel_nome: body.responsavel_nome.trim(),
        onboarding_responsavel_email: body.responsavel_email.trim().toLowerCase(),
        onboarding_responsavel_telefone: body.responsavel_telefone?.trim() || null,
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
        backend_url: body.backend_url ?? atual.config.backend_url,
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
            : (atual.config as any).licenca_offline_valor ?? 30,
        licenca_offline_unidade:
          (body.licenca_offline_unidade || (atual.config as any).licenca_offline_unidade || 'DIAS') as any,
        licenca_ultimo_sync_em: new Date(),
        onboarding_status:
          (body.licenca_status || atual.config.licenca_status) === licenca_status.ATIVA
            ? 'APROVADO'
            : (atual.config as any).onboarding_status || 'SOLICITADO',
        onboarding_aprovado_em:
          (body.licenca_status || atual.config.licenca_status) === licenca_status.ATIVA
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
        backend_url: body.backend_url ?? null,
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
        licenca_offline_unidade: (body.licenca_offline_unidade || 'DIAS') as any,
        licenca_ultimo_sync_em: new Date(),
      } as any,
      update: {
        nome_oficial: body.nome_oficial,
        nome_exibicao: body.nome_exibicao ?? null,
        tenant_slug: body.tenant_slug ?? null,
        plano_nome: body.plano_nome ?? 'Plano Basico',
        backend_url: body.backend_url ?? null,
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
        licenca_offline_unidade: (body.licenca_offline_unidade || undefined) as any,
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

  async excluirInstancia(codigoInstancia: string, contexto?: AuditoriaContexto) {
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
    const codigo = (body.codigo_instancia || '').trim().toLowerCase();
    const senha = (body.nova_senha || '').trim();
    if (!codigo) {
      return { ok: false, mensagem: 'Codigo da instancia obrigatorio.' };
    }
    if (senha.length < 6) {
      return { ok: false, mensagem: 'Nova senha deve ter pelo menos 6 caracteres.' };
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
      const backendUrl = (instanciaAlvo.backend_url || '').trim();
      if (!backendUrl) {
        return {
          ok: false,
          mensagem:
            'Instancia sem backend_url configurado. Cadastre a URL da API da camara.',
        };
      }

      const masterInstanceAdminKey = (
        process.env.MASTER_INSTANCE_ADMIN_KEY || ''
      ).trim();
      if (!masterInstanceAdminKey) {
        return {
          ok: false,
          mensagem:
            'MASTER_INSTANCE_ADMIN_KEY nao configurado no SaaS Master.',
        };
      }

      try {
        const resp = await fetch(
          `${backendUrl.replace(/\/$/, '')}/configuracao/camaras/admin/redefinir-credencial-local`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-master-admin-key': masterInstanceAdminKey,
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
            'Falha de conexao com a instancia remota. Verifique backend_url e conectividade.',
        };
      }
    }

    return this.executarResetAdminLocal(body, contexto);
  }

  async redefinirCredencialAdminLocal(
    body: {
      codigo_instancia: string;
      novo_email?: string | null;
      nova_senha: string;
      novo_nome?: string | null;
    },
    masterAdminKey?: string | null,
    contexto?: { ip?: string | null; userAgent?: string | null },
  ) {
    const localMasterKey = (process.env.LOCAL_MASTER_ADMIN_KEY || '').trim();
    if (!localMasterKey || !masterAdminKey || masterAdminKey !== localMasterKey) {
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
      return { ok: false, mensagem: 'Nova senha deve ter pelo menos 6 caracteres.' };
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
        return { ok: false, mensagem: 'E-mail ja esta em uso por outro usuario.' };
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
