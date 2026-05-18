import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { user_role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
} from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ConfiguracaoService } from '../configuracao/configuracao.service';

type LoginContexto = {
  ip?: string | null;
  userAgent?: string | null;
  deviceId?: string | null;
  deviceName?: string | null;
};

type TentativaLogin = {
  falhas: number;
  primeiraFalhaEm: number;
  bloqueadoAte?: number;
};

@Injectable()
export class AuthService {
  private tentativasLogin = new Map<string, TentativaLogin>();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private auditoriaService: AuditoriaService,
    private configuracaoService: ConfiguracaoService,
  ) {}

  private chaveTentativa(email: string, ip?: string | null) {
    return `${(email || '').toLowerCase()}|${ip || 'sem-ip'}`;
  }

  private montarFotoUrlPublica(filename: string) {
    const base =
      process.env.PUBLIC_API_BASE_URL ||
      process.env.BACKEND_PUBLIC_URL ||
      'http://localhost:3000';
    return `${base.replace(/\/$/, '')}/uploads/${filename}`;
  }

  private normalizarFotoUrl(fotoUrl?: string | null) {
    if (!fotoUrl) return null;
    const match = fotoUrl.match(/\/uploads\/([^/?#]+)/);
    if (match?.[1]) {
      return this.montarFotoUrlPublica(match[1]);
    }
    return fotoUrl;
  }

  private verificarBloqueioLogin(email: string, ip?: string | null) {
    const limiteFalhas = Number(process.env.AUTH_MAX_FALHAS || 5);
    const janelaMinutos = Number(process.env.AUTH_JANELA_MINUTOS || 10);
    const bloqueioMinutos = Number(process.env.AUTH_BLOQUEIO_MINUTOS || 15);
    const chave = this.chaveTentativa(email, ip);
    const atual = this.tentativasLogin.get(chave);
    const agora = Date.now();
    if (!atual) return { bloqueado: false };

    if (atual.bloqueadoAte && atual.bloqueadoAte > agora) {
      return {
        bloqueado: true,
        restanteSeg: Math.ceil((atual.bloqueadoAte - agora) / 1000),
      };
    }

    const janelaMs = janelaMinutos * 60 * 1000;
    if (agora - atual.primeiraFalhaEm > janelaMs) {
      this.tentativasLogin.delete(chave);
      return { bloqueado: false };
    }

    if (atual.falhas >= limiteFalhas) {
      atual.bloqueadoAte = agora + bloqueioMinutos * 60 * 1000;
      this.tentativasLogin.set(chave, atual);
      return {
        bloqueado: true,
        restanteSeg: bloqueioMinutos * 60,
      };
    }

    return { bloqueado: false };
  }

  private registrarFalhaLogin(email: string, ip?: string | null) {
    const janelaMinutos = Number(process.env.AUTH_JANELA_MINUTOS || 10);
    const chave = this.chaveTentativa(email, ip);
    const agora = Date.now();
    const atual = this.tentativasLogin.get(chave);
    const janelaMs = janelaMinutos * 60 * 1000;

    if (!atual || agora - atual.primeiraFalhaEm > janelaMs) {
      this.tentativasLogin.set(chave, { falhas: 1, primeiraFalhaEm: agora });
      return;
    }

    atual.falhas += 1;
    this.tentativasLogin.set(chave, atual);
  }

  private limparFalhasLogin(email: string, ip?: string | null) {
    const chave = this.chaveTentativa(email, ip);
    this.tentativasLogin.delete(chave);
  }

  private limparFalhasLoginPorEmail(email: string) {
    const emailNormalizado = (email || '').toLowerCase();
    if (!emailNormalizado) return;
    for (const chave of this.tentativasLogin.keys()) {
      if (chave.startsWith(`${emailNormalizado}|`)) {
        this.tentativasLogin.delete(chave);
      }
    }
  }

  private base32Encode(buffer: Buffer) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    let output = '';
    for (const byte of buffer) {
      bits += byte.toString(2).padStart(8, '0');
    }
    for (let i = 0; i < bits.length; i += 5) {
      const chunk = bits.slice(i, i + 5).padEnd(5, '0');
      output += alphabet[parseInt(chunk, 2)];
    }
    return output;
  }

  private base32Decode(input: string) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const sanitized = input.toUpperCase().replace(/=+$/g, '');
    let bits = '';
    for (const char of sanitized) {
      const index = alphabet.indexOf(char);
      if (index === -1) {
        throw new BadRequestException('Secret 2FA invalido.');
      }
      bits += index.toString(2).padStart(5, '0');
    }
    const bytes: number[] = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
      bytes.push(parseInt(bits.slice(i, i + 8), 2));
    }
    return Buffer.from(bytes);
  }

  private gerarTotp(secret: string, timestampMs = Date.now()) {
    const key = this.base32Decode(secret);
    const timestep = 30;
    const counter = Math.floor(timestampMs / 1000 / timestep);
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));
    const hmac = createHmac('sha1', key).update(counterBuffer).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);
    return (binary % 1000000).toString().padStart(6, '0');
  }

  private validarTotp(secret: string, code: string) {
    const normalized = (code || '').replace(/\s/g, '');
    if (!/^\d{6}$/.test(normalized)) {
      return false;
    }
    const janelas = [-1, 0, 1];
    return janelas.some((janela) => {
      const ts = Date.now() + janela * 30000;
      return this.gerarTotp(secret, ts) === normalized;
    });
  }

  private hashResetCodigo(codigo: string) {
    return createHash('sha256').update(codigo).digest('hex');
  }

  private async enviarCodigoRecuperacaoPorEmail(input: {
    codigo: string;
    emailAdminLocal: string;
    nomeAdminLocal?: string | null;
    expiraMinutos: number;
  }) {
    const resendApiKey = (process.env.RESEND_API_KEY || '').trim();
    const to = (
      process.env.ADMIN_RESET_ALERT_EMAIL_TO ||
      process.env.SAAS_ALERT_EMAIL_TO ||
      'robertxzero@gmail.com'
    )
      .trim()
      .toLowerCase();
    const from = (
      process.env.SAAS_ALERT_EMAIL_FROM || 'onboarding@votacam.local'
    ).trim();

    if (!resendApiKey || !to || !from) {
      return {
        ok: false,
        skipped: true,
        motivo: 'email_nao_configurado' as const,
      };
    }

    const assunto = '[VotaCam] Codigo de recuperacao do admin local';
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#0f172a">
        <h2>Recuperacao de senha solicitada</h2>
        <p>Foi solicitada uma redefinicao de senha para o administrador local da camara.</p>
        <ul>
          <li><strong>Admin local:</strong> ${input.nomeAdminLocal || '-'}</li>
          <li><strong>E-mail do admin local:</strong> ${input.emailAdminLocal}</li>
          <li><strong>Codigo de recuperacao:</strong> <span style="font-size:20px;font-weight:700;letter-spacing:1px">${input.codigo}</span></li>
          <li><strong>Validade:</strong> ${input.expiraMinutos} minutos</li>
        </ul>
        <p>Repasse este codigo ao administrador da camara para concluir a redefinicao.</p>
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
          from,
          to: [to],
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

  private expiraEmData() {
    const raw = process.env.JWT_EXPIRES_IN || '8h';
    const now = Date.now();
    const match = /^(\d+)([smhd])$/.exec(raw);
    if (!match) {
      return new Date(now + 8 * 60 * 60 * 1000);
    }
    const value = Number(match[1]);
    const unit = match[2];
    const mult =
      unit === 's'
        ? 1000
        : unit === 'm'
          ? 60 * 1000
          : unit === 'h'
            ? 60 * 60 * 1000
            : 24 * 60 * 60 * 1000;
    return new Date(now + value * mult);
  }

  private exige2fa(role: user_role, twofaEnabled: boolean) {
    const enforce = process.env.ENFORCE_2FA === 'true';
    if (!enforce) return false;
    return (
      (role === user_role.ADMIN || role === user_role.PRESIDENTE) &&
      twofaEnabled
    );
  }

  private async criarSessaoToken(usuario: any, contexto?: LoginContexto) {
    const jti = randomUUID();
    const expiraEm = this.expiraEmData();
    const maxSessoes = Number(process.env.MAX_ACTIVE_SESSIONS_PER_USER || 3);

    const token = this.jwtService.sign({
      sub: usuario.id,
      userId: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      role: usuario.role,
      jti,
    });

    await this.prisma.auth_sessoes.create({
      data: {
        usuario_id: usuario.id,
        jwt_id: jti,
        device_id: contexto?.deviceId || null,
        device_nome: contexto?.deviceName || null,
        ip: contexto?.ip || null,
        user_agent: contexto?.userAgent || null,
        expira_em: expiraEm,
      },
    });

    const ativas = await this.prisma.auth_sessoes.findMany({
      where: { usuario_id: usuario.id, revogada_em: null },
      orderBy: { criado_em: 'desc' },
    });

    if (ativas.length > maxSessoes) {
      const excedentes = ativas.slice(maxSessoes);
      await this.prisma.auth_sessoes.updateMany({
        where: { id: { in: excedentes.map((s) => s.id) } },
        data: { revogada_em: new Date() },
      });
    }

    return token;
  }

  async login(
    email: string,
    senha: string,
    contexto?: LoginContexto & { twoFactorCode?: string },
  ) {
    const bloqueio = this.verificarBloqueioLogin(email, contexto?.ip);
    if (bloqueio.bloqueado) {
      throw new UnauthorizedException(
        `Muitas tentativas de login. Tente novamente em ${Math.max(1, bloqueio.restanteSeg || 0)}s.`,
      );
    }

    const registrarFalha = async (motivo: string) => {
      this.registrarFalhaLogin(email, contexto?.ip);
      await this.auditoriaService.registrarEvento({
        acao: 'AUTH_LOGIN_FALHA',
        entidade: 'auth',
        detalhes: { email, motivo },
        contexto: {
          ip: contexto?.ip || null,
          userAgent: contexto?.userAgent || null,
        },
      });
    };

    const usuario = await this.prisma.usuarios.findUnique({
      where: { email },
      include: {
        vereadores: { include: { cadeiras: true } },
      },
    });

    if (!usuario) {
      await registrarFalha('usuario_invalido');
      throw new UnauthorizedException('Usuario invalido');
    }
    if (!usuario.ativo) {
      await registrarFalha('usuario_inativo');
      throw new UnauthorizedException('Usuario inativo');
    }

    const acessoLicenca =
      await this.configuracaoService.validarAcessoPorLicenca();
    if (!acessoLicenca.ok) {
      await registrarFalha(`licenca_${acessoLicenca.motivo}`);
      const mensagem =
        acessoLicenca.motivo === 'nao_ativado'
          ? 'Sistema nao ativado. Solicite liberacao no SaaS Master.'
          : acessoLicenca.motivo === 'expirada'
            ? 'Licenca expirada. Entre em contato com o suporte.'
            : acessoLicenca.motivo === 'offline_expirado'
              ? 'Prazo offline excedido. Conecte a internet para sincronizar a licenca.'
              : acessoLicenca.motivo === 'inadimplente'
                ? 'Licenca marcada como inadimplente.'
                : 'Sistema bloqueado por licenca.';
      throw new UnauthorizedException(mensagem);
    }

    const confCamara = await this.configuracaoService.obterCamara();
    if (
      (confCamara.config.licenca_status === 'BLOQUEADA' ||
        confCamara.config.licenca_status === 'INADIMPLENTE') &&
      usuario.role !== user_role.ADMIN
    ) {
      await registrarFalha('licenca_bloqueada');
      throw new UnauthorizedException(
        'Sistema temporariamente bloqueado por licenca.',
      );
    }

    const senhaValida = bcrypt.compareSync(senha, usuario.senha_hash);
    if (!senhaValida) {
      await registrarFalha('senha_invalida');
      throw new UnauthorizedException('Senha invalida');
    }

    const precisa2fa = this.exige2fa(usuario.role, !!usuario.twofa_enabled);
    if (precisa2fa) {
      if (!usuario.twofa_secret) {
        await registrarFalha('2fa_nao_configurado');
        throw new UnauthorizedException(
          '2FA nao configurado para este usuario.',
        );
      }
      if (!contexto?.twoFactorCode) {
        return {
          requires_2fa: true,
          message: 'Codigo 2FA obrigatorio para este perfil.',
        };
      }
      const ok = this.validarTotp(usuario.twofa_secret, contexto.twoFactorCode);
      if (!ok) {
        await registrarFalha('2fa_codigo_invalido');
        throw new UnauthorizedException('Codigo 2FA invalido.');
      }
    }

    const token = await this.criarSessaoToken(usuario, contexto);
    this.limparFalhasLogin(email, contexto?.ip);
    await this.auditoriaService.registrarEvento({
      acao: 'AUTH_LOGIN_SUCESSO',
      entidade: 'auth',
      entidadeId: usuario.id,
      detalhes: {
        email: usuario.email,
        device_id: contexto?.deviceId || null,
        device_nome: contexto?.deviceName || null,
      },
      contexto: {
        usuarioId: usuario.id,
        usuarioNome: usuario.nome,
        usuarioRole: usuario.role,
        ip: contexto?.ip || null,
        userAgent: contexto?.userAgent || null,
      },
    });

    return {
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        role: usuario.role,
        foto_url: this.normalizarFotoUrl(usuario.foto_url),
        twofa_enabled: !!usuario.twofa_enabled,
        vereador: usuario.vereadores
          ? {
              id: usuario.vereadores.id,
              partido: usuario.vereadores.partido,
              partido_logo_url: this.normalizarFotoUrl(usuario.vereadores.partido_logo_url),
              cadeira: usuario.vereadores.cadeiras,
            }
          : null,
      },
    };
  }

  async logout(authorization: string) {
    const payload = this.validarToken(authorization);
    const jti = payload.jti;
    if (jti) {
      await this.prisma.auth_sessoes.updateMany({
        where: { jwt_id: jti, revogada_em: null },
        data: { revogada_em: new Date() },
      });
    }
    await this.auditoriaService.registrarEvento({
      acao: 'AUTH_LOGOUT',
      entidade: 'auth',
      entidadeId: payload.userId || payload.sub || null,
      contexto: {
        usuarioId: payload.userId || payload.sub || null,
        usuarioNome: payload.nome || null,
        usuarioRole: payload.role || null,
      },
    });
    return { ok: true };
  }

  async logoutAll(authorization: string) {
    const payload = this.validarToken(authorization);
    const usuarioId = payload.userId || payload.sub;
    await this.prisma.auth_sessoes.updateMany({
      where: { usuario_id: usuarioId, revogada_em: null },
      data: { revogada_em: new Date() },
    });
    await this.auditoriaService.registrarEvento({
      acao: 'AUTH_LOGOUT_ALL',
      entidade: 'auth',
      entidadeId: usuarioId || null,
      contexto: {
        usuarioId: usuarioId || null,
        usuarioNome: payload.nome || null,
        usuarioRole: payload.role || null,
      },
    });
    return { ok: true };
  }

  async refresh(authorization: string, contexto?: LoginContexto) {
    const payload = this.validarToken(authorization);
    const usuarioId = payload.userId || payload.sub;
    const jti = payload.jti;
    if (!jti) throw new UnauthorizedException('Sessao invalida');

    const sessao = await this.prisma.auth_sessoes.findUnique({
      where: { jwt_id: jti },
    });
    if (!sessao || sessao.revogada_em || sessao.expira_em < new Date()) {
      throw new UnauthorizedException('Sessao expirada ou revogada');
    }

    const usuario = await this.prisma.usuarios.findUnique({
      where: { id: usuarioId },
      include: { vereadores: { include: { cadeiras: true } } },
    });
    if (!usuario || !usuario.ativo) {
      throw new UnauthorizedException('Usuario inativo ou nao encontrado');
    }

    await this.prisma.auth_sessoes.update({
      where: { id: sessao.id },
      data: { revogada_em: new Date() },
    });

    const token = await this.criarSessaoToken(usuario, {
      ip: contexto?.ip || sessao.ip,
      userAgent: contexto?.userAgent || sessao.user_agent,
      deviceId: contexto?.deviceId || sessao.device_id,
      deviceName: contexto?.deviceName || sessao.device_nome,
    });

    await this.auditoriaService.registrarEvento({
      acao: 'AUTH_REFRESH',
      entidade: 'auth',
      entidadeId: usuario.id,
      detalhes: { antigo_jti: jti },
      contexto: {
        usuarioId: usuario.id,
        usuarioNome: usuario.nome,
        usuarioRole: usuario.role,
        ip: contexto?.ip || null,
        userAgent: contexto?.userAgent || null,
      },
    });

    return { ok: true, token };
  }

  async iniciarConfig2fa(authorization: string) {
    const payload = this.validarToken(authorization);
    const usuarioId = payload.userId || payload.sub;
    const usuario = await this.prisma.usuarios.findUnique({
      where: { id: usuarioId },
    });
    if (!usuario) throw new UnauthorizedException('Usuario nao encontrado');

    const secret = this.base32Encode(randomBytes(20));
    await this.prisma.usuarios.update({
      where: { id: usuario.id },
      data: {
        twofa_secret: secret,
        twofa_enabled: false,
      },
    });

    const issuer = encodeURIComponent('Sistema Camara Municipal');
    const account = encodeURIComponent(usuario.email);
    const otpauth = `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

    return { secret, otpauth_url: otpauth };
  }

  async confirmarConfig2fa(authorization: string, code: string) {
    const payload = this.validarToken(authorization);
    const usuarioId = payload.userId || payload.sub;
    const usuario = await this.prisma.usuarios.findUnique({
      where: { id: usuarioId },
    });
    if (!usuario || !usuario.twofa_secret) {
      throw new BadRequestException('2FA nao iniciado.');
    }
    const ok = this.validarTotp(usuario.twofa_secret, code);
    if (!ok) throw new UnauthorizedException('Codigo 2FA invalido.');

    await this.prisma.usuarios.update({
      where: { id: usuario.id },
      data: {
        twofa_enabled: true,
        twofa_configurada_em: new Date(),
      },
    });

    return { ok: true, twofa_enabled: true };
  }

  async desativar2fa(authorization: string) {
    const payload = this.validarToken(authorization);
    const usuarioId = payload.userId || payload.sub;
    await this.prisma.usuarios.update({
      where: { id: usuarioId },
      data: {
        twofa_enabled: false,
        twofa_secret: null,
        twofa_configurada_em: null,
      },
    });
    return { ok: true, twofa_enabled: false };
  }

  async solicitarResetSenha(email: string, contexto?: LoginContexto) {
    const emailNormalizado = (email || '').trim().toLowerCase();
    const usuarioPorEmail = emailNormalizado
      ? await this.prisma.usuarios.findUnique({
          where: { email: emailNormalizado },
        })
      : null;

    const usuario =
      usuarioPorEmail &&
      usuarioPorEmail.ativo &&
      usuarioPorEmail.role === user_role.ADMIN
        ? usuarioPorEmail
        : await this.prisma.usuarios.findFirst({
            where: { role: user_role.ADMIN, ativo: true },
            orderBy: { criado_em: 'asc' },
          });

    // Ao entrar no fluxo de recuperação, libera tentativas bloqueadas desse e-mail.
    this.limparFalhasLoginPorEmail(emailNormalizado);

    if (usuario) {
      const codigo = randomInt(100000, 999999).toString();
      const expiraEm = new Date(Date.now() + 15 * 60 * 1000);

      await this.prisma.$executeRawUnsafe(
        `
        UPDATE auth_password_resets
        SET usado_em = NOW()
        WHERE usuario_id = $1::uuid AND usado_em IS NULL
        `,
        usuario.id,
      );

      await this.prisma.$executeRawUnsafe(
        `
        INSERT INTO auth_password_resets (
          usuario_id,
          codigo_hash,
          expira_em
        )
        VALUES ($1::uuid, $2, $3)
        `,
        usuario.id,
        this.hashResetCodigo(codigo),
        expiraEm,
      );

      await this.auditoriaService.registrarEvento({
        acao: 'AUTH_RESET_SOLICITADO',
        entidade: 'auth',
        entidadeId: usuario.id,
        detalhes: { email: usuario.email },
        contexto: {
          usuarioId: usuario.id,
          usuarioNome: usuario.nome,
          usuarioRole: usuario.role,
          ip: contexto?.ip || null,
          userAgent: contexto?.userAgent || null,
        },
      });

      const envioEmail = await this.enviarCodigoRecuperacaoPorEmail({
        codigo,
        emailAdminLocal: usuario.email,
        nomeAdminLocal: usuario.nome,
        expiraMinutos: 15,
      });
      await this.auditoriaService.registrarEvento({
        acao: envioEmail.ok
          ? 'AUTH_RESET_EMAIL_ENVIADO'
          : 'AUTH_RESET_EMAIL_FALHA',
        entidade: 'auth',
        entidadeId: usuario.id,
        detalhes: {
          email_admin_local: usuario.email,
          destino_alerta:
            process.env.ADMIN_RESET_ALERT_EMAIL_TO ||
            process.env.SAAS_ALERT_EMAIL_TO ||
            'robertxzero@gmail.com',
          envio_email: envioEmail,
        },
        contexto: {
          usuarioId: usuario.id,
          usuarioNome: usuario.nome,
          usuarioRole: usuario.role,
          ip: contexto?.ip || null,
          userAgent: contexto?.userAgent || null,
        },
      });

      if (!envioEmail.ok) {
        return {
          ok: false,
          message:
            'Nao foi possivel enviar o codigo de recuperacao por e-mail. Verifique a configuracao do Resend.',
        };
      }

      return {
        ok: true,
        message: 'Se o e-mail existir, um codigo de recuperacao foi enviado.',
      };
    }

    return {
      ok: true,
      message: 'Se o e-mail existir, um codigo de recuperacao foi enviado.',
    };
  }

  async redefinirSenha(
    email: string,
    codigo: string,
    novaSenha: string,
    contexto?: LoginContexto,
  ) {
    const codigoHash = this.hashResetCodigo((codigo || '').trim());
    const emailNormalizado = (email || '').trim().toLowerCase();

    const usuarioPorEmail = emailNormalizado
      ? await this.prisma.usuarios.findUnique({
          where: { email: emailNormalizado },
        })
      : null;

    let usuario =
      usuarioPorEmail &&
      usuarioPorEmail.ativo &&
      usuarioPorEmail.role === user_role.ADMIN
        ? usuarioPorEmail
        : null;

    let resetRows: Array<{ id: string }> = [];

    if (usuario) {
      resetRows = await this.prisma.$queryRawUnsafe(
        `
        SELECT id
        FROM auth_password_resets
        WHERE usuario_id = $1::uuid
          AND codigo_hash = $2
          AND usado_em IS NULL
          AND expira_em > NOW()
        ORDER BY criado_em DESC
        LIMIT 1
        `,
        usuario.id,
        codigoHash,
      );
    }

    if (!resetRows.length) {
      const fallbackRows: Array<{ id: string; usuario_id: string }> =
        await this.prisma.$queryRawUnsafe(
          `
          SELECT r.id, r.usuario_id
          FROM auth_password_resets r
          INNER JOIN usuarios u ON u.id = r.usuario_id
          WHERE r.codigo_hash = $1
            AND r.usado_em IS NULL
            AND r.expira_em > NOW()
            AND u.ativo = true
            AND u.role = 'ADMIN'
          ORDER BY r.criado_em DESC
          LIMIT 1
          `,
          codigoHash,
        );

      if (!fallbackRows.length) {
        throw new UnauthorizedException('Codigo invalido ou expirado.');
      }

      const row = fallbackRows[0];
      const usuarioFallback = await this.prisma.usuarios.findUnique({
        where: { id: row.usuario_id },
      });
      if (
        !usuarioFallback ||
        !usuarioFallback.ativo ||
        usuarioFallback.role !== user_role.ADMIN
      ) {
        throw new UnauthorizedException('Codigo invalido ou expirado.');
      }
      usuario = usuarioFallback;
      resetRows = [{ id: row.id }];
    }

    if (!usuario) {
      throw new UnauthorizedException('Codigo invalido ou expirado.');
    }

    const resetId = resetRows[0].id;

    const senhaHash = await bcrypt.hash(novaSenha, 10);
    await this.prisma.$transaction(async (tx) => {
      await tx.usuarios.update({
        where: { id: usuario.id },
        data: { senha_hash: senhaHash, atualizado_em: new Date() },
      });
      await tx.$executeRawUnsafe(
        `UPDATE auth_password_resets SET usado_em = NOW() WHERE id = $1::uuid`,
        resetId,
      );
      await tx.auth_sessoes.updateMany({
        where: { usuario_id: usuario.id, revogada_em: null },
        data: { revogada_em: new Date() },
      });
    });

    await this.auditoriaService.registrarEvento({
      acao: 'AUTH_RESET_CONFIRMADO',
      entidade: 'auth',
      entidadeId: usuario.id,
      detalhes: { email: usuario.email },
      contexto: {
        usuarioId: usuario.id,
        usuarioNome: usuario.nome,
        usuarioRole: usuario.role,
        ip: contexto?.ip || null,
        userAgent: contexto?.userAgent || null,
      },
    });

    return { ok: true, message: 'Senha redefinida com sucesso.' };
  }
  validarToken(authorization: string) {
    if (!authorization) throw new UnauthorizedException('Token nao informado');
    const [, token] = authorization.split(' ');
    if (!token) throw new UnauthorizedException('Token invalido');
    try {
      return this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Token invalido ou expirado');
    }
  }

  async me(authorization: string) {
    const payload = this.validarToken(authorization);
    const usuarioId = payload.userId || payload.sub;
    const jti = payload.jti;

    if (jti) {
      const sessao = await this.prisma.auth_sessoes.findUnique({
        where: { jwt_id: jti },
      });
      if (!sessao || sessao.revogada_em || sessao.expira_em < new Date()) {
        throw new UnauthorizedException('Sessao invalida ou revogada');
      }
      await this.prisma.auth_sessoes.update({
        where: { id: sessao.id },
        data: { ultimo_acesso_em: new Date() },
      });
    }

    const usuario = await this.prisma.usuarios.findUnique({
      where: { id: usuarioId },
      include: {
        vereadores: { include: { cadeiras: true } },
      },
    });

    if (!usuario) throw new UnauthorizedException('Usuario nao encontrado');
    if (!usuario.ativo) throw new UnauthorizedException('Usuario inativo');

    return {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      role: usuario.role,
      foto_url: this.normalizarFotoUrl(usuario.foto_url),
      twofa_enabled: !!usuario.twofa_enabled,
      vereador: usuario.vereadores
        ? {
            id: usuario.vereadores.id,
            partido: usuario.vereadores.partido,
            partido_logo_url: this.normalizarFotoUrl(usuario.vereadores.partido_logo_url),
            cadeira: usuario.vereadores.cadeiras,
          }
        : null,
    };
  }
}
