export class SolicitarFalaDto {
  tipo_fala!:
    | 'PEQUENAS_COMUNICACOES'
    | 'GRANDE_EXPEDIENTE'
    | 'ORDEM_DO_DIA'
    | 'EXPLICACOES_PESSOAIS';
}
