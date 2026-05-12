'use client';

import { useState } from 'react';
import { api } from '@/services/api';

type Props = {
  aberto: boolean;
  fechar: () => void;
  aoCadastrar: () => void;
};

export function CreateVereadorModal({
  aberto,
  fechar,
  aoCadastrar,
}: Props) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('123456');
  const [partido, setPartido] = useState('');
  const [cadeiraNumero, setCadeiraNumero] = useState('');
  const [role, setRole] = useState<'VEREADOR' | 'PRESIDENTE'>('VEREADOR');
  const [cargoMesa, setCargoMesa] = useState<'PRESIDENTE' | 'VICE_PRESIDENTE' | 'SECRETARIO_GERAL' | ''>('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  if (!aberto) {
    return null;
  }

  async function cadastrarVereador(event: React.FormEvent) {
    event.preventDefault();

    setErro('');
    setCarregando(true);

    try {
      await api.post('/usuarios/vereador', {
        nome,
        email,
        senha,
        partido,
        cadeiraNumero: Number(cadeiraNumero),
        role,
        cargo_mesa: cargoMesa || null,
      });

      setNome('');
      setEmail('');
      setSenha('123456');
      setPartido('');
      setCadeiraNumero('');
      setRole('VEREADOR');
      setCargoMesa('');

      aoCadastrar();
      fechar();
    } catch {
      setErro('Erro ao cadastrar vereador. Verifique os dados.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">
          Cadastrar Vereador
        </h2>

        <form onSubmit={cadastrarVereador} className="flex flex-col gap-4">
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
            type="password"
            placeholder="Senha inicial"
            className="border border-gray-300 rounded-lg p-3 text-gray-800 placeholder:text-gray-500"
            value={senha}
            onChange={(event) => setSenha(event.target.value)}
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
              {carregando ? 'Cadastrando...' : 'Cadastrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
