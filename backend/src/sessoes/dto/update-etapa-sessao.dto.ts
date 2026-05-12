export type EtapaSessaoDto =
  | 'ABERTURA'
  | 'LEITURA_BIBLICA'
  | 'CHAMADA_VEREADORES'
  | 'VERIFICACAO_QUORUM'
  | 'LEITURA_EXPEDIENTE'
  | 'PEQUENAS_COMUNICACOES'
  | 'GRANDE_EXPEDIENTE'
  | 'ORDEM_DO_DIA'
  | 'RESULTADO'
  | 'EXPLICACOES_PESSOAIS'
  | 'ENCERRAMENTO';

export class UpdateEtapaSessaoDto {
  etapa!: EtapaSessaoDto;
  titulo?: string;
  descricao?: string;
}
