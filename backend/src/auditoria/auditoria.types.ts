import { user_role } from '@prisma/client';

export type AuditoriaContexto = {
  usuarioId?: string | null;
  usuarioNome?: string | null;
  usuarioRole?: user_role | null;
  ip?: string | null;
  userAgent?: string | null;
};

export type RegistrarEventoInput = {
  acao: string;
  entidade: string;
  entidadeId?: string | null;
  detalhes?: Record<string, any> | null;
  contexto?: AuditoriaContexto | null;
};

