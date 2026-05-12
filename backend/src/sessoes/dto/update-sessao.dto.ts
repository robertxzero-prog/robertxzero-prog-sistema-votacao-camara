export class UpdateSessaoDto {
  titulo!: string;
  descricao?: string;
  data_sessao!: string;
  status?: 'ABERTA' | 'ENCERRADA';
}