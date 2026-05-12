"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Sidebar } from "@/components/Sidebar";
import { api } from "@/services/api";

const API_BASE_URL = "http://localhost:3000";

type TipoVoto = "SIM" | "NAO" | "ABSTENCAO" | "AUSENTE";
type Resultado = "APROVADA" | "REJEITADA" | "EMPATE" | "SEM_QUORUM";

type VereadorAta = {
  vereador_id: string;
  nome: string;
  partido: string | null;
  cadeira: number;
  presente_em?: string;
};

type VotoAta = VereadorAta & {
  voto: TipoVoto;
  votado_em: string | null;
};

type Ata = {
  votacao_id: string;
  status: string;
  aberta_em: string | null;
  encerrada_em: string | null;
  sessao: {
    titulo: string;
    descricao: string | null;
    data_sessao: string;
  };
  pauta: {
    numero_ordem: number;
    titulo: string;
    descricao: string | null;
    tipo_maioria: "SIMPLES" | "ABSOLUTA" | "DOIS_TERCOS";
  };
  quorum: {
    total_vereadores: number;
    quorum_minimo: number;
    presentes: number;
    ausentes: number;
    quorum_atingido: boolean;
    votos_necessarios: number;
  };
  totais: {
    sim: number;
    nao: number;
    abstencao: number;
    total: number;
  };
  resultado: Resultado;
  presentes: VereadorAta[];
  ausentes: VereadorAta[];
  votos: VotoAta[];
  texto_resumo: string;
  integridade?: {
    algoritmo_hash: string;
    hash: string;
    assinatura_hmac: string;
    assinada_em: string;
  };
};

type Verificacao = {
  valido: boolean;
  hash_confere: boolean;
  assinatura_confere: boolean;
};

function formatarData(data?: string | null) {
  if (!data) {
    return "-";
  }

  return new Date(data).toLocaleDateString("pt-BR");
}

function formatarDataHora(data?: string | null) {
  if (!data) {
    return "-";
  }

  return new Date(data).toLocaleString("pt-BR");
}

function textoResultado(resultado: Resultado) {
  const textos: Record<Resultado, string> = {
    APROVADA: "Aprovada",
    REJEITADA: "Rejeitada",
    EMPATE: "Empate",
    SEM_QUORUM: "Sem quórum",
  };

  return textos[resultado] || resultado;
}

function textoTipoMaioria(tipo: Ata["pauta"]["tipo_maioria"]) {
  const textos: Record<Ata["pauta"]["tipo_maioria"], string> = {
    SIMPLES: "Maioria simples",
    ABSOLUTA: "Maioria absoluta",
    DOIS_TERCOS: "Dois terços",
  };

  return textos[tipo] || "Maioria simples";
}

function textoVoto(voto: TipoVoto) {
  const textos: Record<TipoVoto, string> = {
    SIM: "SIM",
    NAO: "NÃO",
    ABSTENCAO: "ABSTENÇÃO",
    AUSENTE: "AUSENTE",
  };

  return textos[voto] || voto;
}

function corResultado(resultado: Resultado) {
  if (resultado === "APROVADA") {
    return "bg-green-100 text-green-800";
  }

  if (resultado === "REJEITADA") {
    return "bg-red-100 text-red-800";
  }

  if (resultado === "SEM_QUORUM") {
    return "bg-orange-100 text-orange-800";
  }

  return "bg-yellow-100 text-yellow-800";
}

export default function AtaDetalhePage() {
  const params = useParams<{ id: string }>();
  const [ata, setAta] = useState<Ata | null>(null);
  const [verificacao, setVerificacao] = useState<Verificacao | null>(null);
  const [loading, setLoading] = useState(true);

  async function carregarAta() {
    try {
      setLoading(true);

      const response = await api.get(`/atas/votacao/${params.id}`);
      setAta(response.data);
      const verificacaoResponse = await api
        .get(`/atas/votacao/${params.id}/verificar`)
        .catch(() => null);
      if (verificacaoResponse?.data) {
        setVerificacao(verificacaoResponse.data);
      }
    } catch (error) {
      console.error(error);
      alert("Erro ao carregar ata.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarAta();
  }, [params.id]);

  return (
    <main className="flex min-h-screen bg-slate-100">
      <Sidebar />

      <section className="flex-1 p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              href="/atas"
              className="text-sm font-bold text-blue-700 hover:underline"
            >
              Voltar para atas
            </Link>
            <h1 className="mt-2 text-4xl font-black text-slate-900">
              Ata de Votação
            </h1>
          </div>

          <a
            href={`${API_BASE_URL}/atas/votacao/${params.id}/pdf`}
            target="_blank"
            className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-700"
          >
            Abrir PDF
          </a>
        </div>

        {loading ? (
          <div className="rounded-xl bg-white p-8 text-center font-semibold text-slate-700 shadow">
            Carregando ata...
          </div>
        ) : !ata ? (
          <div className="rounded-xl bg-white p-8 text-center font-semibold text-slate-700 shadow">
            Ata não encontrada.
          </div>
        ) : (
          <div className="grid gap-6">
            <section className="rounded-xl bg-white p-6 shadow">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div>
                  <p className="text-sm font-bold uppercase tracking-widest text-blue-600">
                    Sessão {formatarData(ata.sessao.data_sessao)}
                  </p>
                  <h2 className="mt-2 text-3xl font-black text-slate-900">
                    {ata.pauta.numero_ordem} - {ata.pauta.titulo}
                  </h2>
                  <p className="mt-2 text-slate-600">
                    {ata.sessao.titulo} |{" "}
                    {textoTipoMaioria(ata.pauta.tipo_maioria)}
                  </p>
                </div>

                <span
                  className={`rounded-full px-5 py-2 text-sm font-black uppercase ${corResultado(
                    ata.resultado,
                  )}`}
                >
                  {textoResultado(ata.resultado)}
                </span>
              </div>

              <p className="mt-6 rounded-lg bg-slate-100 p-4 text-slate-700">
                {ata.texto_resumo}
              </p>
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  Integridade da ata
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  Hash: <span className="font-mono">{ata.integridade?.hash || "-"}</span>
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  Assinatura HMAC: <span className="font-mono">{ata.integridade?.assinatura_hmac || "-"}</span>
                </p>
                {verificacao && (
                  <p
                    className={`mt-2 text-sm font-bold ${
                      verificacao.valido ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {verificacao.valido ? "Assinatura oficial validada" : "Divergência detectada na assinatura oficial"}
                  </p>
                )}
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-4">
              <div className="rounded-xl bg-white p-5 shadow">
                <p className="text-sm font-bold uppercase text-slate-500">
                  Presentes
                </p>
                <p className="mt-2 text-4xl font-black text-slate-900">
                  {ata.quorum.presentes}
                </p>
              </div>
              <div className="rounded-xl bg-white p-5 shadow">
                <p className="text-sm font-bold uppercase text-slate-500">
                  Ausentes
                </p>
                <p className="mt-2 text-4xl font-black text-slate-900">
                  {ata.quorum.ausentes}
                </p>
              </div>
              <div className="rounded-xl bg-white p-5 shadow">
                <p className="text-sm font-bold uppercase text-slate-500">
                  Quórum
                </p>
                <p
                  className={`mt-2 text-2xl font-black ${
                    ata.quorum.quorum_atingido
                      ? "text-green-700"
                      : "text-red-700"
                  }`}
                >
                  {ata.quorum.quorum_atingido ? "Atingido" : "Insuficiente"}
                </p>
              </div>
              <div className="rounded-xl bg-white p-5 shadow">
                <p className="text-sm font-bold uppercase text-slate-500">
                  Votos necessários
                </p>
                <p className="mt-2 text-4xl font-black text-slate-900">
                  {ata.quorum.votos_necessarios}
                </p>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-4">
              <div className="rounded-xl bg-green-600 p-5 text-white shadow">
                <p className="font-bold">SIM</p>
                <p className="mt-2 text-5xl font-black">{ata.totais.sim}</p>
              </div>
              <div className="rounded-xl bg-red-600 p-5 text-white shadow">
                <p className="font-bold">NÃO</p>
                <p className="mt-2 text-5xl font-black">{ata.totais.nao}</p>
              </div>
              <div className="rounded-xl bg-yellow-500 p-5 text-white shadow">
                <p className="font-bold">ABSTENÇÃO</p>
                <p className="mt-2 text-5xl font-black">
                  {ata.totais.abstencao}
                </p>
              </div>
              <div className="rounded-xl bg-slate-900 p-5 text-white shadow">
                <p className="font-bold">TOTAL</p>
                <p className="mt-2 text-5xl font-black">{ata.totais.total}</p>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <ListaVereadores titulo="Presentes" vereadores={ata.presentes} />
              <ListaVereadores titulo="Ausentes" vereadores={ata.ausentes} />
            </section>

            <section className="rounded-xl bg-white p-6 shadow">
              <h2 className="text-2xl font-black text-slate-900">
                Votos nominais
              </h2>

              {ata.votos.length === 0 ? (
                <p className="mt-4 rounded-lg bg-slate-100 p-4 text-slate-600">
                  Nenhum voto registrado.
                </p>
              ) : (
                <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full border-collapse">
                    <thead className="bg-slate-900 text-white">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-bold">
                          Vereador
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-bold">
                          Cadeira
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-bold">
                          Voto
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-bold">
                          Horário
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ata.votos.map((voto) => (
                        <tr
                          key={voto.vereador_id}
                          className="border-b border-slate-200 last:border-0"
                        >
                          <td className="px-4 py-3 text-slate-800">
                            <strong>{voto.nome}</strong>
                            <span className="text-slate-500">
                              {" "}
                              ({voto.partido || "Sem partido"})
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {voto.cadeira}
                          </td>
                          <td className="px-4 py-3 font-black text-slate-900">
                            {textoVoto(voto.voto)}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {formatarDataHora(voto.votado_em)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

function ListaVereadores({
  titulo,
  vereadores,
}: {
  titulo: string;
  vereadores: VereadorAta[];
}) {
  return (
    <section className="rounded-xl bg-white p-6 shadow">
      <h2 className="text-2xl font-black text-slate-900">{titulo}</h2>

      {vereadores.length === 0 ? (
        <p className="mt-4 rounded-lg bg-slate-100 p-4 text-slate-600">
          Nenhum registro.
        </p>
      ) : (
        <div className="mt-5 grid gap-3">
          {vereadores.map((vereador) => (
            <div
              key={vereador.vereador_id}
              className="rounded-lg border border-slate-200 p-4"
            >
              <p className="font-bold text-slate-900">{vereador.nome}</p>
              <p className="mt-1 text-sm text-slate-600">
                Cadeira {vereador.cadeira} | {vereador.partido || "Sem partido"}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
