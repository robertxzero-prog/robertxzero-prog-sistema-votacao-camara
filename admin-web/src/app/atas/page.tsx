"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Sidebar } from "@/components/Sidebar";
import { api } from "@/services/api";

const API_BASE_URL = "http://localhost:3000";

type Votacao = {
  id: string;
  status: string;
  aberta_em: string;
  encerrada_em?: string;

  pautas?: {
    titulo: string;
    numero_ordem: number;

    sessoes?: {
      titulo: string;
    };
  };
};

export default function AtasPage() {
  const [votacoes, setVotacoes] = useState<Votacao[]>([]);
  const [loading, setLoading] = useState(true);

  async function carregarVotacoes() {
    try {
      setLoading(true);

      const response = await api.get("/votacoes");

      const encerradas = response.data.filter(
        (votacao: Votacao) => votacao.status === "ENCERRADA",
      );

      setVotacoes(encerradas);
    } catch (error) {
      console.error(error);
      alert("Erro ao carregar atas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarVotacoes();
  }, []);

  function formatarData(data?: string) {
    if (!data) {
      return "-";
    }

    return new Date(data).toLocaleString("pt-BR");
  }

  return (
    <main className="flex min-h-screen bg-slate-100">
      <Sidebar />

      <section className="flex-1 p-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-blue-600">
              Sistema legislativo
            </p>

            <h1 className="mt-2 text-5xl font-black text-slate-900">
              Atas de Votação
            </h1>
          </div>

          <button
            onClick={carregarVotacoes}
            className="rounded-2xl bg-blue-600 px-6 py-4 text-lg font-bold text-white hover:bg-blue-700"
          >
            Atualizar
          </button>
        </div>

        {loading ? (
          <div className="rounded-3xl bg-white p-10 text-center shadow">
            <p className="text-2xl font-bold text-slate-700">
              Carregando atas...
            </p>
          </div>
        ) : votacoes.length === 0 ? (
          <div className="rounded-3xl bg-white p-10 text-center shadow">
            <p className="text-2xl font-bold text-slate-700">
              Nenhuma votação encerrada.
            </p>
          </div>
        ) : (
          <div className="grid gap-6">
            {votacoes.map((votacao) => (
              <div key={votacao.id} className="rounded-3xl bg-white p-8 shadow">
                <div className="flex flex-wrap items-start justify-between gap-6">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-widest text-green-600">
                      Votação encerrada
                    </p>

                    <h2 className="mt-2 text-4xl font-black text-slate-900">
                      {votacao.pautas?.titulo}
                    </h2>

                    <div className="mt-5 grid gap-3 text-lg text-slate-700">
                      <p>
                        <strong>Sessão:</strong>{" "}
                        {votacao.pautas?.sessoes?.titulo}
                      </p>

                      <p>
                        <strong>Ordem:</strong> {votacao.pautas?.numero_ordem}
                      </p>

                      <p>
                        <strong>Aberta em:</strong>{" "}
                        {formatarData(votacao.aberta_em)}
                      </p>

                      <p>
                        <strong>Encerrada em:</strong>{" "}
                        {formatarData(votacao.encerrada_em)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <Link
                      href={`/atas/${votacao.id}`}
                      className="rounded-2xl bg-slate-900 px-6 py-4 text-center text-lg font-bold text-white hover:bg-slate-800"
                    >
                      Ver ata
                    </Link>

                    <a
                      href={`${API_BASE_URL}/atas/votacao/${votacao.id}/pdf`}
                      target="_blank"
                      className="rounded-2xl bg-blue-600 px-6 py-4 text-center text-lg font-bold text-white hover:bg-blue-700"
                    >
                      Abrir PDF
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
