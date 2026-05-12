export type TipoFalaSessaoDto =
  | 'PEQUENAS_COMUNICACOES'
  | 'GRANDE_EXPEDIENTE'
  | 'ORDEM_DO_DIA'
  | 'EXPLICACOES_PESSOAIS';

export class UpdateOradorSessaoDto {
  vereador_id!: string;
  tipo_fala!: TipoFalaSessaoDto;
  duracao_segundos?: number;
}
