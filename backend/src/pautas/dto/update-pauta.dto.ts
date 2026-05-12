import { tipo_maioria } from '@prisma/client';

export class UpdatePautaDto {
  sessao_id!: string;
  numero_ordem!: number;
  titulo!: string;
  descricao?: string;
  tipo_maioria?: tipo_maioria;
}
