'use client';

import { useEffect, useState } from 'react';
import { api } from '@/services/api';

type Usuario = {
  id: string;
  nome: string;
  email: string;
  role: string;
  foto_url: string | null;
  ativo: boolean;
  partido?: string;
  cadeiraNumero?: number | null;
  cargo_mesa?: 'PRESIDENTE' | 'VICE_PRESIDENTE' | 'SECRETARIO_GERAL' | null;
};

type Props = {
  aberto: boolean;
  vereador: Usuario | null;
  fechar: () => void;
  aoAtualizar: () => void;
};

export function EditVereadorModal({
  aberto,
  vereador,
  fechar,
  aoAtualizar,
}: Props) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [partido, setPartido] = useState('');
  const [senha, setSenha] = useState('');
  const [cadeiraNumero, setCadeiraNumero] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [role, setRole] = useState<'VEREADOR' | 'PRESIDENTE'>('VEREADOR');
  const [cargoMesa, setCargoMesa] = useState<'PRESIDENTE' | 'VICE_PRESIDENTE' | 'SECRETARIO_GERAL' | ''>('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (vereador) {
      setNome(vereador.nome);
      setEmail(vereador.email);
      setPartido(vereador.partido ?? '');
      setSenha('');
      setCadeiraNumero(
        vereador.cadeiraNumero ? String(vereador.cadeiraNumero) : '',
      );
      setAtivo(vereador.ativo);
      setRole(vereador.role === 'PRESIDENTE' ? 'PRESIDENTE' : 'VEREADOR');
      setCargoMesa((vereador.cargo_mesa as any) || '');
      setErro('');
    }
  }, [vereador]);

  if (!aberto || !vereador) {
    return null;
  }

  async function editarVereador(event: React.FormEvent) {
    event.preventDefault();

    if (!vereador) {
      return;
    }

    setErro('');
    setCarregando(true);

    try {
      const response = await api.put(`/usuarios/vereador/${vereador.id}`, {
        nome,
        email,
        partido,
        senha: senha.trim() || undefined,
        cadeiraNumero: Number(cadeiraNumero),
        ativo,
        role,
        cargo_mesa: cargoMesa || null,
      });

      if (!response.data.ok) {
        setErro(response.data.mensagem || 'Erro ao atualizar vereador.');
        return;
      }

      aoAtualizar();
      fechar();
    } catch {
      setErro('Erro ao atualizar vereador. Verifique os dados.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">
          Editar Vereador
        </h2>

        <form onSubmit={editarVereador} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="Nome completo"
            className="border border-gray-300 rounded-lg p-3 text-gray-800 placeholder:text-gray-500"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
          />

          <input
            type="email"
            placeholder="Email"
            className="border border-gray-300 rounded-lg p-3 text-gray-800 placeholder:text-gray-500"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <input
            type="text"
            placeholder="Partido"
            className="border border-gray-300 rounded-lg p-3 text-gray-800 placeholder:text-gray-500"
            value={partido}
            onChange={(event) => setPartido(event.target.value)}
          />

          <input
            type="number"
            placeholder="Número da cadeira"
            className="border border-gray-300 rounded-lg p-3 text-gray-800 placeholder:text-gray-500"
            value={cadeiraNumero}
            onChange={(event) => setCadeiraNumero(event.target.value)}
          />

          <input
            type="password"
            placeholder="Nova senha do tablet (opcional)"
            className="border border-gray-300 rounded-lg p-3 text-gray-800 placeholder:text-gray-500"
            value={senha}
            onChange={(event) => setSenha(event.target.value)}
          />

          <select
            className="border border-gray-300 rounded-lg p-3 text-gray-800"
            value={role}
            onChange={(event) =>
              setRole(event.target.value as 'VEREADOR' | 'PRESIDENTE')
            }
          >
            <option value="VEREADOR">Vereador</option>
            <option value="PRESIDENTE">Presidente</option>
          </select>

          <select
            className="border border-gray-300 rounded-lg p-3 text-gray-800"
            value={cargoMesa}
            onChange={(event) =>
              setCargoMesa(event.target.value as 'PRESIDENTE' | 'VICE_PRESIDENTE' | 'SECRETARIO_GERAL' | '')
            }
          >
            <option value="">Sem cargo de mesa</option>
            <option value="PRESIDENTE">Presidente da Mesa</option>
            <option value="VICE_PRESIDENTE">Vice-presidente</option>
            <option value="SECRETARIO_GERAL">Secretário-geral</option>
          </select>

          <label className="flex items-center gap-3 text-gray-700">
            <input
              type="checkbox"
              checked={ativo}
              onChange={(event) => setAtivo(event.target.checked)}
            />
            Vereador ativo
          </label>

          {erro && (
            <p className="text-red-600 text-sm">
              {erro}
            </p>
          )}

          <div className="flex gap-3 justify-end mt-4">
            <button
              type="button"
              onClick={fechar}
              className="px-5 py-3 rounded-lg border border-gray-300 text-gray-700"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={carregando}
              className="px-5 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold"
            >
              {carregando ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
