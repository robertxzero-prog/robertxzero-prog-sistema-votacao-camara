import { AuditoriaContexto } from '../auditoria/auditoria.types';

export function extrairContextoAuditoria(req: any): AuditoriaContexto {
  const forwardedFor = req?.headers?.['x-forwarded-for'];
  const ip =
    (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)?.split?.(',')?.[0]?.trim?.() ||
    req?.ip ||
    req?.socket?.remoteAddress ||
    null;

  return {
    usuarioId: req?.user?.userId || req?.user?.sub || req?.user?.id || null,
    usuarioNome: req?.user?.nome || req?.user?.name || null,
    usuarioRole: req?.user?.role || null,
    ip,
    userAgent: req?.headers?.['user-agent'] || null,
  };
}

