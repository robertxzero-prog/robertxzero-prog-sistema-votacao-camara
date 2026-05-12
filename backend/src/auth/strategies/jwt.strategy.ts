import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'camara-secret-key',
    });
  }

  async validate(payload: any) {
    const jti = payload.jti;
    if (jti) {
      const sessao = await this.prisma.auth_sessoes.findUnique({
        where: { jwt_id: jti },
      });
      if (!sessao || sessao.revogada_em || sessao.expira_em < new Date()) {
        throw new UnauthorizedException('Sessão inválida ou revogada.');
      }
      await this.prisma.auth_sessoes.update({
        where: { id: sessao.id },
        data: { ultimo_acesso_em: new Date() },
      });
    }

    return {
      userId: payload.sub,
      nome: payload.nome,
      role: payload.role,
      jti: payload.jti,
    };
  }
}
