'use client';

import { useEffect, useState } from 'react';
import { api } from '@/services/api';

type Usuario = {
  id: string;
  nome: string;
  email: string;
};

type Vereador = {
  id: string;
  partido?: string;
  usuarios?: Usuario;
};

type Voto = {
  id: string;
  vereador_id: string;
  voto: 'SIM' | 'NAO' | 'ABSTENCAO';
};

type VotacaoAtiva = {
  id: string;
  status: string;
  aberta_em: string;
  pautas?: {
    id: string;
    titulo: string;
    descricao?: string;
    numero_ordem: number;
    sessoes?: {
      id: string;
      titulo: string;
    };
  };
  votos?: Voto[];
};

export default function VotacaoPage() {
  const [votacao, setVotacao] = useState<VotacaoAtiva | null>(null);
  const [vereadores, setVereadores] = useState<Vereador[]>([]);
  const [vereadorId, setVereadorId] = useState('');
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);

  async function carregarDados() {
    try {
      setLoading(true);

      const [votacaoResponse, usuariosResponse] = await Promise.all([
        api.get('/votacoes/ativa'),
        api.get('/usuarios'),
      ]);

      setVotacao(votacaoResponse.data);

      const listaVereadores = usuariosResponse.data
        .map((item: any) => {
          if (item.vereadores) {
            return {
              id: item.vereadores.id,
              partido: item.vereadores.partido,
              usuarios: {
                id: item.id,
                nome: item.nome,
                email: item.email,
              },
            };
          }

          if (item.usuarios) {
            return {
              id: item.id,
              partido: item.partido,
              usuarios: item.usuarios,
            };
          }

          return null;
        })
        .filter(Boolean);

      setVereadores(listaVereadores);
    } catch (error) {
      console.error(error);
      alert('Erro ao carregar votação.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarDados();
  }, []);

  async function registrarVoto(voto: 'SIM' | 'NAO' | 'ABSTENCAO') {
    if (!votacao) {
      alert('Nenhuma votação ativa.');
      return;
    }

    if (!vereadorId) {
      alert('Selecione o vereador.');
      return;
    }

    try {
      setEnviando(true);

      await api.post(`/votacoes/${votacao.id}/votar`, {
        vereador_id: vereadorId,
        voto,
      });

      alert('Voto registrado com sucesso.');

      setVereadorId('');
      await carregarDados();
    } catch (error: any) {
      console.error(error);
      alert(error?.response?.data?.message || 'Erro ao registrar voto.');
    } finally {
      setEnviando(false);
    }
  }

  function vereadorJaVotou(id: string) {
    return votacao?.votos?.some((voto) => voto.vereador_id === id);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-lg font-semibold text-slate-700">
          Carregando votação...
        </p>
      </main>
    );
  }

  if (!votacao) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="w-full max-w-xl rounded-2xl bg-white p-8 text-center shadow">
          <h1 className="text-3xl font-bold text-slate-900">
            Nenhuma votação aberta
          </h1>

          <p className="mt-3 text-slate-600">
            Aguarde o presidente abrir uma votação para uma pauta.
          </p>

          <button
            onClick={carregarDados}
            className="mt-6 rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white hover:bg-blue-700"
          >
            Atualizar
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 rounded-2xl bg-white p-6 shadow">
          <p className="text-sm font-semibold uppercase tracking-wide text-green-700">
            Votação aberta
          </p>

          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            {votacao.pautas?.titulo}
          </h1>

          {votacao.pautas?.descricao && (
            <p className="mt-3 text-slate-600">{votacao.pautas.descricao}</p>
          )}

          <div className="mt-4 grid gap-3 text-sm text-slate-700 md:grid-cols-3">
            <div className="rounded-lg bg-slate-100 p-3">
              <strong>Ordem:</strong> {votacao.pautas?.numero_ordem}
            </div>

            <div className="rounded-lg bg-slate-100 p-3">
              <strong>Sessão:</strong> {votacao.pautas?.sessoes?.titulo || '-'}
            </div>

            <div className="rounded-lg bg-slate-100 p-3">
              <strong>Votos registrados:</strong> {votacao.votos?.length || 0}
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow">
          <h2 className="text-xl font-bold text-slate-900">
            Registrar voto do vereador
          </h2>

          <div className="mt-5">
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Selecione o vereador
            </label>

            <select
              value={vereadorId}
              onChange={(event) => setVereadorId(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-3 text-slate-900 outline-none focus:border-blue-600"
            >
              <option value="">Selecione...</option>

              {vereadores.map((vereador) => (
                <option
                  key={vereador.id}
                  value={vereador.id}
                  disabled={vereadorJaVotou(vereador.id)}
                >
                  {vereador.usuarios?.nome || 'Vereador sem nome'}
                  {vereador.partido ? ` - ${vereador.partido}` : ''}
                  {vereadorJaVotou(vereador.id) ? ' - JÁ VOTOU' : ''}
                </option>
              ))}
            </select>

            {vereadores.length === 0 && (
              <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">
                Nenhum vereador encontrado na rota /usuarios.
              </p>
            )}
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <button
              disabled={enviando}
              onClick={() => registrarVoto('SIM')}
              className="rounded-2xl bg-green-600 px-6 py-8 text-3xl font-bold text-white shadow hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              SIM
            </button>

            <button
              disabled={enviando}
              onClick={() => registrarVoto('NAO')}
              className="rounded-2xl bg-red-600 px-6 py-8 text-3xl font-bold text-white shadow hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              NÃO
            </button>

            <button
              disabled={enviando}
              onClick={() => registrarVoto('ABSTENCAO')}
              className="rounded-2xl bg-yellow-500 px-6 py-8 text-3xl font-bold text-white shadow hover:bg-yellow-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              ABSTER
            </button>
          </div>

          <button
            onClick={carregarDados}
            className="mt-6 rounded-lg bg-slate-800 px-5 py-2 font-semibold text-white hover:bg-slate-900"
          >
            Atualizar votação
          </button>
        </div>
      </div>
    </main>
  );
}