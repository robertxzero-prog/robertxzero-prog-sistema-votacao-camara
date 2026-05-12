import { Injectable } from '@nestjs/common';
import { licenca_status } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AuditoriaContexto } from '../auditoria/auditoria.types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ConfiguracaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

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

  async validarAcessoPorLicenca() {
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

  async solicitarPrimeiroAcesso(
    body: {
      codigo_instancia: string;
      nome_oficial: string;
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
    if (!config.monitor_token_hash) {
      return { ok: false, mensagem: 'Token de monitoramento nao configurado.' };
    }
    const tokenHash = this.hashMonitorToken(body.monitor_token || '');
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
}
