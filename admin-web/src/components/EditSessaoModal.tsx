'use client';

import { useEffect, useState } from 'react';
import { api } from '@/services/api';

type Sessao = {
  id: string;
  titulo: string;
  descricao: string | null;
  data_sessao: string;
  status: 'ABERTA' | 'ENCERRADA' | null;
};

type Props = {
  aberto: boolean;
  sessao: Sessao | null;
  fechar: () => void;
  aoAtualizar: () => void;
};

export function EditSessaoModal({ aberto, sessao, fechar, aoAtualizar }: Props) {
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dataSessao, setDataSessao] = useState('');
  const [status, setStatus] = useState<'ABERTA' | 'ENCERRADA'>('ABERTA');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!sessao) return;
    setTitulo(sessao.titulo);
    setDescricao(sessao.descricao || '');
    setDataSessao(new Date(sessao.data_sessao).toISOString().slice(0, 10));
    setStatus(sessao.status === 'ENCERRADA' ? 'ENCERRADA' : 'ABERTA');
    setErro('');
  }, [sessao]);

  if (!aberto || !sessao) return null;

  async function salvar(event: React.FormEvent) {
    event.preventDefault();
    if (!sessao) return;
    setErro('');
    setCarregando(true);
    try {
      const response = await api.put(`/sessoes/${sessao.id}`, {
        titulo,
        descricao,
        data_sessao: dataSessao,
        status,
      });
      if (!response.data?.ok) {
        setErro(response.data?.mensagem || 'Erro ao atualizar sessão.');
        return;
      }
      aoAtualizar();
      fechar();
    } catch {
      setErro('Erro ao atualizar sessão.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl">
        <h2 className="mb-6 text-2xl font-bold text-gray-800">Editar Sessão</h2>
        <form onSubmit={salvar} className="flex flex-col gap-4">
          <input
            type="text"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className="rounded-lg border border-gray-300 p-3 text-gray-800"
            placeholder="Título da sessão"
          />
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className="min-h-24 rounded-lg border border-gray-300 p-3 text-gray-800"
            placeholder="Descrição"
          />
          <input
            type="date"
            value={dataSessao}
            onChange={(e) => setDataSessao(e.target.value)}
            className="rounded-lg border border-gray-300 p-3 text-gray-800"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as 'ABERTA' | 'ENCERRADA')}
            className="rounded-lg border border-gray-300 p-3 text-gray-800"
          >
            <option value="ABERTA">Aberta</option>
            <option value="ENCERRADA">Encerrada</option>
          </select>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          <div className="mt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={fechar}
              className="rounded-lg border border-gray-300 px-5 py-3 text-gray-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={carregando}
              className="rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
            >
              {carregando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
