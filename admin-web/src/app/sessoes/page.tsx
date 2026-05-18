'use client';

import { useEffect, useState } from 'react';

import { EditSessaoModal } from '@/components/EditSessaoModal';
import { CreateSessaoModal } from '@/components/CreateSessaoModal';
import { Sidebar } from '@/components/Sidebar';
import { api } from '@/services/api';

type Sessao = {
  id: string;
  titulo: string;
  descricao: string | null;
  data_sessao: string;
  status: 'ABERTA' | 'ENCERRADA' | null;
  usuarios?: {
    nome: string;
  };
  _count?: {
    pautas: number;
  };
};

export default function SessoesPage() {
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modalCadastroAberto, setModalCadastroAberto] = useState(false);
  const [modalEdicaoAberto, setModalEdicaoAberto] = useState(false);
  const [sessaoSelecionada, setSessaoSelecionada] = useState<Sessao | null>(
    null,
  );

  async function carregarSessoes() {
    setCarregando(true);
    try {
      const response = await api.get('/sessoes');
      setSessoes(response.data);
    } finally {
      setCarregando(false);
    }
  }

  async function excluirSessao(sessao: Sessao) {
    const confirmou = confirm(
      `Tem certeza que deseja excluir a sessão "${sessao.titulo}"?`,
    );
    if (!confirmou) return;

    try {
      await api.delete(`/sessoes/${sessao.id}`);
      await carregarSessoes();
    } catch (error: any) {
      alert(
        error?.response?.data?.mensagem ||
          error?.response?.data?.message ||
          'Não foi possível excluir a sessão.',
      );
    }
  }

  function abrirEdicao(sessao: Sessao) {
    setSessaoSelecionada(sessao);
    setModalEdicaoAberto(true);
  }

  function formatarData(data: string) {
    return new Date(data).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  }

  useEffect(() => {
    carregarSessoes();
  }, []);

  return (
    <main className="admin-page">
      <Sidebar />
      <section className="admin-content">
        <div className="admin-container">
          <div className="admin-header">
            <div>
              <h1 className="admin-title">Sessões</h1>
              <p className="admin-subtitle">
                Gerencie as sessões legislativas da Câmara.
              </p>
            </div>
            <button
              onClick={() => setModalCadastroAberto(true)}
              className="btn btn-primary"
            >
              Criar sessão
            </button>
          </div>

          <div className="table-shell">
            {carregando ? (
              <p className="p-6 text-slate-600">Carregando sessões...</p>
            ) : (
              <table className="w-full">
                <thead className="table-head">
                  <tr>
                    <th className="table-th">Título</th>
                    <th className="table-th">Data</th>
                    <th className="table-th">Status</th>
                    <th className="table-th">Pautas</th>
                    <th className="table-th">Criada por</th>
                    <th className="table-th">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {sessoes.map((sessao) => (
                    <tr key={sessao.id} className="table-row">
                      <td className="table-td">
                        <p className="font-semibold text-slate-900">
                          {sessao.titulo}
                        </p>
                        <p className="text-sm text-slate-500">
                          {sessao.descricao || '-'}
                        </p>
                      </td>
                      <td className="table-td">
                        {formatarData(sessao.data_sessao)}
                      </td>
                      <td className="table-td">
                        {sessao.status === 'ABERTA' ? (
                          <span className="pill pill-green">Aberta</span>
                        ) : (
                          <span className="pill pill-red">Encerrada</span>
                        )}
                      </td>
                      <td className="table-td">{sessao._count?.pautas ?? 0}</td>
                      <td className="table-td">{sessao.usuarios?.nome ?? '-'}</td>
                      <td className="table-td">
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            onClick={() => abrirEdicao(sessao)}
                            className="action-link"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => excluirSessao(sessao)}
                            className="action-link-danger"
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {sessoes.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-600">
                        Nenhuma sessão cadastrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>

      <CreateSessaoModal
        aberto={modalCadastroAberto}
        fechar={() => setModalCadastroAberto(false)}
        aoCadastrar={carregarSessoes}
      />
      <EditSessaoModal
        aberto={modalEdicaoAberto}
        sessao={sessaoSelecionada}
        fechar={() => setModalEdicaoAberto(false)}
        aoAtualizar={carregarSessoes}
      />
    </main>
  );
}

