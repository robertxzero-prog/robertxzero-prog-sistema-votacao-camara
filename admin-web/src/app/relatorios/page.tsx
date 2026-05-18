"use client";

import { useEffect, useState } from "react";

import { Sidebar } from "@/components/Sidebar";
import { api } from "@/services/api";

type TotaisVotos = {
  sim: number;
  nao: number;
  abstencao: number;
  ausente: number;
  total: number;
};

type RelatorioSessao = {
  id: string;
  titulo: string;
  data_sessao: string;
  status: string;
  total_pautas: number;
  total_votacoes: number;
  votacoes_encerradas: number;
  presencas: number;
  totais_votos: TotaisVotos;
};

type RelatorioVereador = {
  vereador_id: string;
  nome: string;
  email: string;
  partido: string | null;
  cadeira: number;
  presencas: number;
  total_votacoes_participadas: number;
  votos: TotaisVotos;
};

function formatarData(data: string) {
  return new Date(data).toLocaleDateString("pt-BR");
}

export default function RelatoriosPage() {
  const [sessoes, setSessoes] = useState<RelatorioSessao[]>([]);
  const [vereadores, setVereadores] = useState<RelatorioVereador[]>([]);
  const [loading, setLoading] = useState(true);

  async function carregarRelatorios() {
    try {
      setLoading(true);

      const [sessoesResponse, vereadoresResponse] = await Promise.all([
        api.get("/relatorios/sessoes"),
        api.get("/relatorios/vereadores"),
      ]);

      setSessoes(sessoesResponse.data);
      setVereadores(vereadoresResponse.data);
    } catch (error) {
      console.error(error);
      alert("Erro ao carregar relatórios.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarRelatorios();
  }, []);

  function abrirPdf(path: string) {
    const base = api.defaults.baseURL || "http://localhost:3000";
    window.open(`${base}${path}`, "_blank", "noopener,noreferrer");
  }

  const totalSessoes = sessoes.length;
  const totalPautas = sessoes.reduce(
    (total, sessao) => total + sessao.total_pautas,
    0,
  );
  const totalVotacoes = sessoes.reduce(
    (total, sessao) => total + sessao.total_votacoes,
    0,
  );
  const totalPresencas = sessoes.reduce(
    (total, sessao) => total + sessao.presencas,
    0,
  );

  return (
    <main className="admin-page">
      <Sidebar />

      <section className="admin-content">
        <div className="admin-container">
        <div className="admin-header">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-blue-600">
              Sistema legislativo
            </p>
            <h1 className="admin-title">
              Relatórios
            </h1>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => abrirPdf("/relatorios/sessoes/pdf")}
              className="btn btn-dark"
            >
              PDF Sessoes
            </button>
            <button
              onClick={() => abrirPdf("/relatorios/vereadores/pdf")}
              className="btn btn-dark"
            >
              PDF Vereadores
            </button>
            <button
              onClick={carregarRelatorios}
              className="btn btn-primary"
            >
              Atualizar
            </button>
          </div>
        </div>

        {loading ? (
          <div className="card-shell p-8 text-center font-semibold text-slate-700">
            Carregando relatórios...
          </div>
        ) : (
          <div className="grid gap-6">
            <section className="grid gap-4 md:grid-cols-4">
              <Indicador titulo="Sessões" valor={totalSessoes} />
              <Indicador titulo="Pautas" valor={totalPautas} />
              <Indicador titulo="Votações" valor={totalVotacoes} />
              <Indicador titulo="Presenças" valor={totalPresencas} />
            </section>

            <section className="card-shell p-6">
              <h2 className="text-2xl font-black text-slate-900">
                Sessões e votações
              </h2>

              {sessoes.length === 0 ? (
                <p className="mt-4 rounded-lg bg-slate-100 p-4 text-slate-600">
                  Nenhuma sessão encontrada.
                </p>
              ) : (
                <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full border-collapse">
                    <thead className="table-head">
                      <tr>
                        <th className="table-th">
                          Sessão
                        </th>
                        <th className="table-th">
                          Data
                        </th>
                        <th className="table-th">
                          Pautas
                        </th>
                        <th className="table-th">
                          Votações
                        </th>
                        <th className="table-th">
                          Presenças
                        </th>
                        <th className="table-th">
                          Votos
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessoes.map((sessao) => (
                        <tr key={sessao.id} className="border-b last:border-0">
                          <td className="table-td font-semibold text-slate-900">
                            {sessao.titulo}
                          </td>
                          <td className="table-td">
                            {formatarData(sessao.data_sessao)}
                          </td>
                          <td className="table-td">
                            {sessao.total_pautas}
                          </td>
                          <td className="table-td">
                            {sessao.votacoes_encerradas}/{sessao.total_votacoes}
                          </td>
                          <td className="table-td">
                            {sessao.presencas}
                          </td>
                          <td className="table-td">
                            {sessao.totais_votos.total}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card-shell p-6">
              <h2 className="text-2xl font-black text-slate-900">Vereadores</h2>

              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {vereadores.map((vereador) => (
                  <div
                    key={vereador.vereador_id}
                    className="rounded-xl border border-slate-200 p-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-black text-slate-900">
                          {vereador.nome}
                        </h3>
                        <p className="mt-1 text-sm text-slate-600">
                          Cadeira {vereador.cadeira} |{" "}
                          {vereador.partido || "Sem partido"}
                        </p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700">
                        {vereador.presencas} presença(s)
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                      <MiniIndicador titulo="SIM" valor={vereador.votos.sim} />
                      <MiniIndicador titulo="NÃO" valor={vereador.votos.nao} />
                      <MiniIndicador
                        titulo="ABS"
                        valor={vereador.votos.abstencao}
                      />
                      <MiniIndicador
                        titulo="TOTAL"
                        valor={vereador.total_votacoes_participadas}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
        </div>
      </section>
    </main>
  );
}

function Indicador({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <div className="card-shell p-6">
      <p className="text-sm font-bold uppercase text-slate-500">{titulo}</p>
      <p className="admin-title">{valor}</p>
    </div>
  );
}

function MiniIndicador({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <div className="rounded-lg bg-slate-100 p-3">
      <p className="text-xs font-black text-slate-500">{titulo}</p>
      <p className="mt-1 text-xl font-black text-slate-900">{valor}</p>
    </div>
  );
}


