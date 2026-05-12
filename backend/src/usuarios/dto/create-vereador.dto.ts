export class CreateVereadorDto {
  nome!: string;
  email!: string;
  senha!: string;
  partido!: string;
  cadeiraNumero!: number;
  role?: 'VEREADOR' | 'PRESIDENTE';
  cargo_mesa?: 'PRESIDENTE' | 'VICE_PRESIDENTE' | 'SECRETARIO_GERAL' | null;
}
