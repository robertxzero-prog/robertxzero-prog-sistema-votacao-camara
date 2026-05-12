'use client';

import { useEffect, useState } from 'react';
import { api } from '@/services/api';

type UsuarioLogado = {
  id: string;
  nome: string;
  email: string;
  role: string;
  foto_url?: string | null;
  vereador?: {
    id: string;
    partido?: string;
    cadeira?: {
      numero: number;
      linha: number;
      coluna: number;
      descricao?: string | null;
    };
  } | null;
};

export default function MePage() {
  const [usuario, setUsuario] = useState<UsuarioLogado | null>(null);
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(true);

  async function carregarUsuario() {
    try {
      setLoading(true);
      setErro('');

      const response = await api.get('/auth/me');

      setUsuario(response.data);
    } catch (error: any) {
      console.error(error);

      setErro(
        error?.response?.data?.message ||
          'Erro ao carregar usuário logado.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarUsuario();
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-lg font-semibold text-slate-700">
          Carregando usuário...
        </p>
      </main>
    );
  }

  if (erro) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="max-w-xl rounded-2xl bg-white p-8 text-center shadow">
          <h1 className="text-2xl font-bold text-red-600">
            Erro
          </h1>

          <p className="mt-3 text-slate-700">
            {erro}
          </p>

          <p className="mt-5 text-sm text-slate-500">
            Faça login novamente para gerar um token válido.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-2xl rounded-2xl bg-white p-8 shadow">
        <h1 className="text-3xl font-bold text-slate-900">
          Usuário logado
        </h1>

        <div className="mt-6 space-y-3 text-slate-700">
          <p>
            <strong>ID:</strong> {usuario?.id}
          </p>

          <p>
            <strong>Nome:</strong> {usuario?.nome}
          </p>

          <p>
            <strong>Email:</strong> {usuario?.email}
          </p>

          <p>
            <strong>Perfil:</strong> {usuario?.role}
          </p>

          {usuario?.vereador ? (
            <div className="mt-6 rounded-xl bg-green-50 p-5 text-green-800">
              <h2 className="text-xl font-bold">
                Dados do vereador
              </h2>

              <p className="mt-3">
                <strong>ID vereador:</strong>{' '}
                {usuario.vereador.id}
              </p>

              <p>
                <strong>Partido:</strong>{' '}
                {usuario.vereador.partido || '-'}
              </p>

              <p>
                <strong>Cadeira:</strong>{' '}
                {usuario.vereador.cadeira?.numero || '-'}
              </p>
            </div>
          ) : (
            <div className="mt-6 rounded-xl bg-yellow-50 p-5 text-yellow-800">
              Este usuário não é vereador.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}