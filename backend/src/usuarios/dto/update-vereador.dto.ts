export class UpdateVereadorDto {
  nome!: string;
  email!: string;
  partido!: string;
  cadeiraNumero!: number;
  ativo!: boolean;
  role?: 'VEREADOR' | 'PRESIDENTE';
  cargo_mesa?: 'PRESIDENTE' | 'VICE_PRESIDENTE' | 'SECRETARIO_GERAL' | null;
  senha?: string;
}
