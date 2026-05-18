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
  const [logoPartido, setLogoPartido] = useState<File | null>(null);
  const [logoPartidoPreview, setLogoPartidoPreview] = useState<string | null>(null);
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
      const response = await api.post('/usuarios/vereador', {
        nome,
        email,
        senha,
        partido,
        cadeiraNumero: Number(cadeiraNumero),
        role,
        cargo_mesa: cargoMesa || null,
      });

      const usuarioId = response.data?.usuario?.id as string | undefined;
      if (logoPartido && usuarioId) {
        const formData = new FormData();
        formData.append('logo', logoPartido);
        await api.post(`/usuarios/${usuarioId}/logo-partido`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      setNome('');
      setEmail('');
      setSenha('123456');
      setPartido('');
      setLogoPartido(null);
      setLogoPartidoPreview(null);
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

          <div className="rounded-lg border border-gray-300 p-3">
            <p className="mb-2 text-sm font-semibold text-gray-700">Logo do partido (opcional)</p>
            <div className="flex items-center gap-3">
              {logoPartidoPreview ? (
                <img
                  src={logoPartidoPreview}
                  alt="Logo do partido"
                  className="h-12 w-12 rounded-md border border-gray-200 object-contain"
                />
              ) : (
                <div className="h-12 w-12 rounded-md bg-gray-100 border border-gray-200" />
              )}
              <label className="cursor-pointer rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                Selecionar
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    setLogoPartido(file);
                    if (!file) {
                      setLogoPartidoPreview(null);
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => setLogoPartidoPreview(String(reader.result || ''));
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
              {logoPartidoPreview && (
                <button
                  type="button"
                  className="rounded-md border border-rose-200 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
                  onClick={() => {
                    setLogoPartido(null);
                    setLogoPartidoPreview(null);
                  }}
                >
                  Remover
                </button>
              )}
            </div>
          </div>

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
