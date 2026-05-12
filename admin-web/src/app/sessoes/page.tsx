'use client';

import { useEffect, useState } from 'react';

import { Sidebar } from '@/components/Sidebar';
import { api } from '@/services/api';
import { CreateSessaoModal } from '@/components/CreateSessaoModal';
import { EditSessaoModal } from '@/components/EditSessaoModal';

type Sessao = {
  id: string;
  titulo: string;
  descricao: string | null;
  data_sessao: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  status: 'ABERTA' | 'ENCERRADA' | null;
  criada_por: string;
  criado_em: string;
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
  const [sessaoSelecionada, setSessaoSelecionada] = useState<Sessao | null>(null);

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

    if (!confirmou) {
      return;
    }

    try {
      await api.delete(`/sessoes/${sessao.id}`);
    } catch (error: any) {
      alert(
        error?.response?.data?.mensagem ||
          error?.response?.data?.message ||
          "Não foi possível excluir a sessão.",
      );
      return;
    }

    await carregarSessoes();
  }

  function abrirEdicao(sessao: Sessao) {
    setSessaoSelecionada(sessao);
    setModalEdicaoAberto(true);
  }

  function formatarData(data: string) {
    return new Date(data).toLocaleDateString('pt-BR', {
      timeZone: 'UTC',
    });
  }

  useEffect(() => {
    carregarSessoes();
  }, []);

  return (
    <main className="flex min-h-screen bg-gray-100">
      <Sidebar />

      <section className="flex-1 p-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-800">
              Sessões
            </h1>

            <p className="text-gray-600 mt-2">
              Gerencie as sessões legislativas da Câmara.
            </p>
          </div>

          <button
            onClick={() => setModalCadastroAberto(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-lg font-semibold"
          >
            Criar Sessão
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow overflow-hidden">
          {carregando ? (
            <p className="p-6 text-gray-600">
              Carregando sessões...
            </p>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-200">
                <tr>
                  <th className="text-left p-4 text-gray-700">
                    Título
                  </th>

                  <th className="text-left p-4 text-gray-700">
                    Data
                  </th>

                  <th className="text-left p-4 text-gray-700">
                    Status
                  </th>

                  <th className="text-left p-4 text-gray-700">
                    Pautas
                  </th>

                  <th className="text-left p-4 text-gray-700">
                    Criada por
                  </th>

                  <th className="text-left p-4 text-gray-700">
                    Ações
                  </th>
                </tr>
              </thead>

              <tbody>
                {sessoes.map((sessao) => (
                  <tr
                    key={sessao.id}
                    className="border-t border-gray-200"
                  >
                    <td className="p-4">
                      <p className="text-gray-800 font-medium">
                        {sessao.titulo}
                      </p>

                      <p className="text-gray-500 text-sm">
                        {sessao.descricao || '-'}
                      </p>
                    </td>

                    <td className="p-4 text-gray-600">
                      {formatarData(sessao.data_sessao)}
                    </td>

                    <td className="p-4">
                      {sessao.status === 'ABERTA' ? (
                        <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm">
                          Aberta
                        </span>
                      ) : (
                        <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm">
                          Encerrada
                        </span>
                      )}
                    </td>

                    <td className="p-4 text-gray-600">
                      {sessao._count?.pautas ?? 0}
                    </td>

                    <td className="p-4 text-gray-600">
                      {sessao.usuarios?.nome ?? '-'}
                    </td>

                    <td className="p-4 flex gap-3">
                      <button
                        onClick={() => abrirEdicao(sessao)}
                        className="text-blue-600 hover:underline"
                      >
                        Editar
                      </button>

                      <button
                        onClick={() => excluirSessao(sessao)}
                        className="text-red-700 hover:underline font-medium"
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}

                {sessoes.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="p-6 text-gray-600 text-center"
                    >
                      Nenhuma sessão cadastrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
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
