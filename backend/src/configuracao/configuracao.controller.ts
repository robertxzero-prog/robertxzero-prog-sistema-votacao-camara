import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { licenca_status } from '@prisma/client';
import { ConfiguracaoService } from './configuracao.service';
import { extrairContextoAuditoria } from '../common/request-context';

@Controller('configuracao')
export class ConfiguracaoController {
  constructor(private readonly configuracaoService: ConfiguracaoService) {}

  private exigirAdmin(req: any) {
    const role = req?.user?.role;
    if (role !== 'ADMIN') {
      throw new ForbiddenException('Acesso restrito ao administrador do SaaS Master.');
    }
  }

  @Get('camara')
  obterCamara() {
    return this.configuracaoService.obterCamara();
  }

  @Get('onboarding/status')
  obterStatusOnboarding() {
    return this.configuracaoService.obterStatusOnboarding();
  }

  @Post('licenca/sincronizar-agora')
  sincronizarLicencaAgora() {
    return this.configuracaoService.sincronizarLicencaAgora();
  }

  @Post('onboarding/solicitar')
  solicitarPrimeiroAcesso(
    @Body()
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
    @Req() req: any,
  ) {
    const ip =
      req?.headers?.['x-forwarded-for']?.split?.(',')?.[0]?.trim?.() ||
      req?.ip ||
      req?.socket?.remoteAddress ||
      null;
    return this.configuracaoService.solicitarPrimeiroAcesso(body, {
      ip,
      userAgent: req?.headers?.['user-agent'] || null,
    });
  }

  @Post('onboarding/registro-publico')
  registrarOnboardingPublico(
    @Body()
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
    @Headers('x-onboarding-key') onboardingKey?: string,
  ) {
    return this.configuracaoService.registrarOnboardingPublico(
      body,
      onboardingKey || null,
    );
  }

  @Post('licenca/sync-publico')
  sincronizarLicencaPublica(
    @Body() body: { codigo_instancia: string },
    @Headers('x-onboarding-key') onboardingKey?: string,
  ) {
    return this.configuracaoService.obterLicencaPublica(
      body?.codigo_instancia || '',
      onboardingKey || null,
    );
  }

  @Get('camaras')
  @UseGuards(AuthGuard('jwt'))
  listarCamaras(@Req() req: any) {
    this.exigirAdmin(req);
    return this.configuracaoService.listarCamaras();
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('camara')
  atualizarCamara(
    @Body()
    body: {
      nome_oficial?: string;
      nome_exibicao?: string | null;
      tenant_slug?: string | null;
      plano_nome?: string | null;
      backend_url?: string | null;
      brasao_url?: string | null;
      cidade?: string | null;
      uf?: string | null;
    },
  ) {
    return this.configuracaoService.atualizarCamara(body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('licenca')
  atualizarLicenca(
    @Body()
    body: {
      licenca_status?: licenca_status;
      licenca_expira_em?: string | null;
      licenca_offline_valor?: number | null;
      licenca_offline_unidade?: 'DIAS' | 'MESES' | 'ANOS' | null;
    },
  ) {
    return this.configuracaoService.atualizarLicenca(body);
  }

  @Post('heartbeat')
  heartbeat() {
    return this.configuracaoService.heartbeat();
  }

  @Post('monitor/heartbeat')
  monitorHeartbeat(
    @Body()
    body: {
      codigo_instancia: string;
      monitor_token: string;
      versao?: string | null;
      latencia_ms?: number | null;
    },
    @Req() req: any,
  ) {
    const ip =
      req?.headers?.['x-forwarded-for']?.split?.(',')?.[0]?.trim?.() ||
      req?.ip ||
      req?.socket?.remoteAddress ||
      null;
    return this.configuracaoService.receberHeartbeat(body, {
      ip,
      userAgent: req?.headers?.['user-agent'] || null,
    });
  }

  @Patch('camaras/upsert')
  @UseGuards(AuthGuard('jwt'))
  criarOuAtualizarInstancia(
    @Body()
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
    @Req() req: any,
  ) {
    this.exigirAdmin(req);
    return this.configuracaoService.criarOuAtualizarInstancia(
      body,
      extrairContextoAuditoria(req),
    );
  }

  @Post('camaras/token')
  @UseGuards(AuthGuard('jwt'))
  gerarToken(@Body() body: { codigo_instancia: string }, @Req() req: any) {
    this.exigirAdmin(req);
    return this.configuracaoService.gerarTokenInstancia(
      body.codigo_instancia,
      extrairContextoAuditoria(req),
    );
  }

  @Post('camaras/token/revogar')
  @UseGuards(AuthGuard('jwt'))
  revogarToken(@Body() body: { codigo_instancia: string }, @Req() req: any) {
    this.exigirAdmin(req);
    return this.configuracaoService.revogarTokenInstancia(
      body.codigo_instancia,
      extrairContextoAuditoria(req),
    );
  }

  @Delete('camaras/:codigoInstancia')
  @UseGuards(AuthGuard('jwt'))
  excluirInstancia(
    @Param('codigoInstancia') codigoInstancia: string,
    @Req() req: any,
  ) {
    this.exigirAdmin(req);
    return this.configuracaoService.excluirInstancia(
      codigoInstancia,
      extrairContextoAuditoria(req),
    );
  }

  @Post('camaras/admin/redefinir-credencial')
  @UseGuards(AuthGuard('jwt'))
  redefinirCredencialAdmin(
    @Body()
    body: {
      codigo_instancia: string;
      novo_email?: string | null;
      nova_senha: string;
      novo_nome?: string | null;
    },
    @Req() req: any,
  ) {
    this.exigirAdmin(req);
    return this.configuracaoService.redefinirCredencialAdminInstancia(
      body,
      extrairContextoAuditoria(req),
    );
  }

  @Post('camaras/admin/recuperacao/solicitar')
  @UseGuards(AuthGuard('jwt'))
  solicitarRecuperacaoAdmin(
    @Body()
    body: {
      codigo_instancia: string;
      email: string;
    },
    @Req() req: any,
  ) {
    this.exigirAdmin(req);
    return this.configuracaoService.solicitarRecuperacaoAdminInstancia(
      body,
      extrairContextoAuditoria(req),
    );
  }

  @Post('camaras/admin/recuperacao/confirmar')
  @UseGuards(AuthGuard('jwt'))
  confirmarRecuperacaoAdmin(
    @Body()
    body: {
      codigo_instancia: string;
      email: string;
      codigo: string;
      nova_senha: string;
    },
    @Req() req: any,
  ) {
    this.exigirAdmin(req);
    return this.configuracaoService.confirmarRecuperacaoAdminInstancia(
      body,
      extrairContextoAuditoria(req),
    );
  }

  @Post('camaras/admin/redefinir-credencial-local')
  redefinirCredencialAdminLocal(
    @Body()
    body: {
      codigo_instancia: string;
      novo_email?: string | null;
      nova_senha: string;
      novo_nome?: string | null;
    },
    @Headers('x-master-admin-key') masterAdminKey?: string,
    @Headers('x-onboarding-key') onboardingKey?: string,
    @Req() req?: any,
  ) {
    return this.configuracaoService.redefinirCredencialAdminLocal(
      body,
      masterAdminKey || null,
      onboardingKey || null,
      {
        ip:
          req?.headers?.['x-forwarded-for']?.split?.(',')?.[0]?.trim?.() ||
          req?.ip ||
          req?.socket?.remoteAddress ||
          null,
        userAgent: req?.headers?.['user-agent'] || null,
      },
    );
  }
}
