"use client";

import { useEffect, useState } from "react";
import { api } from "@/services/api";
import { CreatePautaModal } from "@/components/CreatePautaModal";
import { EditPautaModal } from "@/components/EditPautaModal";
import { Sidebar } from "@/components/Sidebar";

type Sessao = {
  id: string;
  titulo: string;
};

type Usuario = {
  id: string;
  nome: string;
  email: string;
};

type Votacao = {
  id: string;
  status: string;
};

type TipoMaioria = "SIMPLES" | "ABSOLUTA" | "DOIS_TERCOS";

type Pauta = {
  id: string;
  sessao_id: string;
  numero_ordem: number;
  titulo: string;
  descricao: string | null;
  tipo_maioria: TipoMaioria;
  criada_em: string;
  sessoes?: Sessao;
  usuarios?: Usuario;
  votacoes?: Votacao[];
};

export default function PautasPage() {
  const [pautas, setPautas] = useState<Pauta[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalCriarAberto, setModalCriarAberto] = useState(false);
  const [pautaEditando, setPautaEditando] = useState<Pauta | null>(null);

  async function carregarPautas() {
    try {
      setLoading(true);
      const response = await api.get("/pautas");
      setPautas(response.data);
    } catch (error) {
      console.error(error);
      alert("Erro ao carregar pautas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarPautas();
  }, []);

  async function excluirPauta(id: string) {
    const confirmar = confirm("Deseja realmente excluir esta pauta?");

    if (!confirmar) {
      return;
    }

    try {
      await api.delete(`/pautas/${id}`);
      await carregarPautas();
    } catch (error) {
      console.error(error);
      alert("Erro ao excluir pauta.");
    }
  }

  async function abrirVotacao(pautaId: string) {
    try {
      await api.post(`/votacoes/abrir/${pautaId}`);
      alert("Votação aberta com sucesso.");
      await carregarPautas();
    } catch (error: any) {
      console.error(error);
      alert(error?.response?.data?.message || "Erro ao abrir votação.");
    }
  }

  async function encerrarVotacao(votacaoId: string) {
    const confirmar = confirm("Deseja realmente encerrar esta votação?");

    if (!confirmar) {
      return;
    }

    try {
      const response = await api.patch(`/votacoes/${votacaoId}/encerrar`);

      const totais = response.data.totais;
      const resultado = response.data.resultado;

      alert(
        `Votação encerrada.\n\nResultado: ${resultado}\nSIM: ${totais.sim}\nNÃO: ${totais.nao}\nABSTENÇÃO: ${totais.abstencao}\nTOTAL: ${totais.total}`,
      );

      await carregarPautas();
    } catch (error: any) {
      console.error(error);
      alert(error?.response?.data?.message || "Erro ao encerrar votação.");
    }
  }

  function formatarData(data: string) {
    return new Date(data).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  function buscarVotacaoAberta(pauta: Pauta) {
    return pauta.votacoes?.find((votacao) => votacao.status === "ABERTA");
  }

  function possuiVotacaoEncerrada(pauta: Pauta) {
    return pauta.votacoes?.some((votacao) => votacao.status === "ENCERRADA");
  }

  function textoTipoMaioria(tipo: TipoMaioria) {
    const textos: Record<TipoMaioria, string> = {
      SIMPLES: "Simples",
      ABSOLUTA: "Absoluta",
      DOIS_TERCOS: "Dois terços",
    };

    return textos[tipo] || "Simples";
  }

  return (
    <main className="flex min-h-screen bg-slate-100">
      <Sidebar />

      <section className="flex-1 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Pautas</h1>
            <p className="mt-1 text-sm text-slate-600">
              Gerencie as pautas das sessões e abra votações automaticamente.
            </p>
          </div>

          <button
            onClick={() => setModalCriarAberto(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
          >
            Nova pauta
          </button>
        </div>

        <div className="overflow-hidden rounded-xl bg-white shadow">
          {loading ? (
            <div className="p-6 text-center text-slate-600">
              Carregando pautas...
            </div>
          ) : pautas.length === 0 ? (
            <div className="p-6 text-center text-slate-600">
              Nenhuma pauta cadastrada.
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead className="bg-slate-900 text-white">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    Ordem
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    Título
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    Sessão
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    Autor
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    Maioria
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    Votações
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    Criada em
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    Ações
                  </th>
                </tr>
              </thead>

              <tbody>
                {pautas.map((pauta) => {
                  const votacaoAberta = buscarVotacaoAberta(pauta);
                  const votacaoEncerrada = possuiVotacaoEncerrada(pauta);

                  return (
                    <tr key={pauta.id} className="border-b hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {pauta.numero_ordem}
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">
                          {pauta.titulo}
                        </div>
                        {pauta.descricao && (
                          <div className="mt-1 text-sm text-slate-500">
                            {pauta.descricao}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-700">
                        {pauta.sessoes?.titulo || "-"}
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-700">
                        {pauta.usuarios?.nome || "-"}
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-700">
                        {textoTipoMaioria(pauta.tipo_maioria)}
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-700">
                        {pauta.votacoes?.length || 0}
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-700">
                        {formatarData(pauta.criada_em)}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => setPautaEditando(pauta)}
                            className="rounded bg-yellow-500 px-3 py-1 text-sm font-semibold text-white hover:bg-yellow-600"
                          >
                            Editar
                          </button>

                          {!votacaoAberta && !votacaoEncerrada && (
                            <button
                              onClick={() => abrirVotacao(pauta.id)}
                              className="rounded bg-green-600 px-3 py-1 text-sm font-semibold text-white hover:bg-green-700"
                            >
                              Abrir votação
                            </button>
                          )}

                          {votacaoAberta && (
                            <button
                              onClick={() => encerrarVotacao(votacaoAberta.id)}
                              className="rounded bg-red-600 px-3 py-1 text-sm font-semibold text-white hover:bg-red-700"
                            >
                              Encerrar votação
                            </button>
                          )}

                          {votacaoEncerrada && (
                            <span className="rounded bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-700">
                              Encerrada
                            </span>
                          )}

                          <button
                            onClick={() => excluirPauta(pauta.id)}
                            className="rounded bg-slate-700 px-3 py-1 text-sm font-semibold text-white hover:bg-slate-800"
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <CreatePautaModal
        aberto={modalCriarAberto}
        fechar={() => setModalCriarAberto(false)}
        aoCadastrar={() => {
          setModalCriarAberto(false);
          carregarPautas();
        }}
      />

      {pautaEditando && (
        <EditPautaModal
          aberto={!!pautaEditando}
          pauta={pautaEditando}
          fechar={() => setPautaEditando(null)}
          aoAtualizar={() => {
            setPautaEditando(null);
            carregarPautas();
          }}
        />
      )}
      </section>
    </main>
  );
}
