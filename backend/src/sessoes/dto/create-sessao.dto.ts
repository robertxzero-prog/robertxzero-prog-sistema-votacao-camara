import { TipoFalaSessaoDto } from './update-orador-sessao.dto';

export class FilaPlanejadaItemDto {
  vereador_id!: string;
  tipo_fala!: TipoFalaSessaoDto;
}

export class CreateSessaoDto {
  titulo!: string;
  descricao?: string;
  data_sessao!: string;
  fila_planejada?: FilaPlanejadaItemDto[];
}
