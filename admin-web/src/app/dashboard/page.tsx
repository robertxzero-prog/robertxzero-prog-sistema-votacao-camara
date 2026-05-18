"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { api } from "@/services/api";

type SessaoAtiva = {
  id: string;
  titulo: string;
  etapa?: string | null;
  etapa_atual?: string | null;
  status?: string | null;
};

type Quorum = {
  presentes: number;
  total_vereadores: number;
  quorum_minimo: number;
  quorum_atingido: boolean;
};

type VotacaoAtiva = {
  id: string;
  status: string;
  pautas?: {
    titulo?: string;
    sessoes?: { titulo?: string };
  };
  votos?: unknown[];
};

type Pauta = { id: string };
type Vereador = { id: string };

const etapaTexto: Record<string, string> = {
  ABERTURA: "Abertura",
  LEITURA_BIBLICA: "Leitura bíblica",
  CHAMADA_VEREADORES: "Chamada dos vereadores",
  VERIFICACAO_QUORUM: "Verificação de quórum",
  LEITURA_EXPEDIENTE: "Leitura do expediente",
  PEQUENAS_COMUNICACOES: "Pequenas comunicações",
  GRANDE_EXPEDIENTE: "Grande expediente",
  ORDEM_DO_DIA: "Ordem do dia",
  RESULTADO: "Resultado",
  EXPLICACOES_PESSOAIS: "Explicações pessoais",
  ENCERRAMENTO: "Encerramento",
};

export default function Dashboard() {
  const [sessaoAtiva, setSessaoAtiva] = useState<SessaoAtiva | null>(null);
  const [votacao, setVotacao] = useState<VotacaoAtiva | null>(null);
  const [quorum, setQuorum] = useState<Quorum | null>(null);
  const [totalPautas, setTotalPautas] = useState(0);
  const [totalVereadores, setTotalVereadores] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mensagem, setMensagem] = useState("Carregando visão geral...");

  async function carregar() {
    try {
      setLoading(true);
      const [sessaoResponse, votacaoResponse, pautasResponse, usuariosResponse] =
        await Promise.all([
          api.get("/sessoes/ativa").catch(() => ({ data: null as SessaoAtiva | null })),
          api.get("/votacoes/ativa").catch(() => ({ data: null as VotacaoAtiva | null })),
          api.get("/pautas").catch(() => ({ data: [] as Pauta[] })),
          api.get("/usuarios").catch(() => ({ data: [] as Vereador[] })),
        ]);

      const sessao = sessaoResponse.data;
      setSessaoAtiva(sessao);
      setVotacao(votacaoResponse.data);
      setTotalPautas((pautasResponse.data || []).length);
      setTotalVereadores(
        (usuariosResponse.data || []).filter((usuario: any) => !!usuario.vereadores).length,
      );

      if (sessao?.id) {
        const quorumResponse = await api
          .get(`/presencas/${sessao.id}/quorum`)
          .catch(() => ({ data: null as Quorum | null }));
        setQuorum(quorumResponse.data);
      } else {
        setQuorum(null);
      }
      setMensagem("Visão geral atualizada");
    } catch (error) {
      console.error(error);
      setMensagem("Não foi possível atualizar a visão geral.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const etapaAtual = sessaoAtiva?.etapa || sessaoAtiva?.etapa_atual || "ABERTURA";
  const votosRegistrados = useMemo(() => votacao?.votos?.length || 0, [votacao]);

  return (
    <main className="flex min-h-screen bg-slate-100">
      <Sidebar />
      <section className="flex-1 p-8">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.25em] text-blue-700">
              Visão Geral
            </p>
            <h1 className="mt-1 text-4xl font-black tracking-tight text-slate-950">
              Painel administrativo
            </h1>
            <p className="mt-2 text-slate-600">
              Acompanhe o estado do plenário e acesse os fluxos principais do sistema.
            </p>
          </div>
          <button
            onClick={carregar}
            className="rounded-xl bg-slate-950 px-5 py-3 font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
            disabled={loading}
          >
            Atualizar
          </button>
        </div>

        <p className="mb-5 text-sm font-semibold text-slate-500">{mensagem}</p>

        <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="bg-gradient-to-r from-slate-950 via-blue-950 to-slate-900 p-6 text-white">
            <p className="text-sm font-black uppercase tracking-[0.3em] text-blue-200">
              Sessão em foco
            </p>
            <h2 className="mt-2 text-3xl font-black">
              {sessaoAtiva?.titulo || "Nenhuma sessão ativa"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              O Dashboard é apenas acompanhamento. A operação ao vivo fica em Controle da Sessão.
            </p>
          </div>

          <div className="grid gap-4 p-5 md:grid-cols-4">
            <Indicador
              titulo="Etapa atual"
              valor={etapaTexto[etapaAtual] || etapaAtual}
              tom="blue"
            />
            <Indicador
              titulo="Quórum"
              valor={quorum?.quorum_atingido ? "Atingido" : "Aguardando"}
              detalhe={
                quorum
                  ? `${quorum.presentes}/${quorum.total_vereadores} presentes`
                  : "Sem sessão ativa"
              }
              tom={quorum?.quorum_atingido ? "green" : "amber"}
            />
            <Indicador
              titulo="Votação"
              valor={votacao ? "Aberta" : "Sem votação"}
              detalhe={votacao?.pautas?.titulo || "Nenhuma pauta em votação"}
              tom={votacao ? "rose" : "slate"}
            />
            <Indicador
              titulo="Votos"
              valor={String(votosRegistrados)}
              detalhe="registrados na votação atual"
              tom="slate"
            />
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Atalho
            titulo="Controle da Sessão"
            descricao="Operar etapas, chamada, quórum, falas, votação, telão e tablets."
            href="/controle-da-sessao"
            acao="Abrir controle"
            destaque
          />
          <Atalho
            titulo="Preparar Sessões"
            descricao="Criar a sessão plenária e planejar oradores antes da operação."
            href="/sessoes"
            acao="Ir para sessões"
          />
          <Atalho
            titulo="Organizar Pautas"
            descricao="Cadastrar matérias e definir a ordem do dia."
            href="/pautas"
            acao="Ir para pautas"
          />
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-4">
          <Indicador titulo="Pautas cadastradas" valor={String(totalPautas)} tom="slate" />
          <Indicador titulo="Vereadores" valor={String(totalVereadores)} tom="slate" />
          <Atalho
            titulo="Atas"
            descricao="Consultar documentos gerados após as votações."
            href="/atas"
            acao="Ver atas"
          />
          <Atalho
            titulo="Relatórios"
            descricao="Analisar presença, sessões e histórico de votação."
            href="/relatorios"
            acao="Ver relatórios"
          />
        </section>
      </section>
    </main>
  );
}

function Indicador({
  titulo,
  valor,
  detalhe,
  tom,
}: {
  titulo: string;
  valor: string;
  detalhe?: string;
  tom: "blue" | "green" | "amber" | "rose" | "slate";
}) {
  const cores = {
    blue: "border-blue-200 bg-blue-50 text-blue-950",
    green: "border-emerald-200 bg-emerald-50 text-emerald-950",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    rose: "border-rose-200 bg-rose-50 text-rose-950",
    slate: "border-slate-200 bg-slate-50 text-slate-950",
  }[tom];

  return (
    <div className={`rounded-2xl border p-5 ${cores}`}>
      <p className="text-xs font-black uppercase tracking-[0.18em] opacity-70">{titulo}</p>
      <p className="mt-2 text-2xl font-black leading-tight">{valor}</p>
      {detalhe && <p className="mt-2 text-sm font-semibold opacity-75">{detalhe}</p>}
    </div>
  );
}

function Atalho({
  titulo,
  descricao,
  href,
  acao,
  destaque,
}: {
  titulo: string;
  descricao: string;
  href: string;
  acao: string;
  destaque?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-2xl border p-5 shadow-lg transition hover:-translate-y-0.5 ${
        destaque
          ? "border-blue-300 bg-blue-700 text-white shadow-blue-100"
          : "border-slate-200 bg-white text-slate-950"
      }`}
    >
      <p className="text-xl font-black">{titulo}</p>
      <p className={`mt-2 text-sm ${destaque ? "text-blue-50" : "text-slate-600"}`}>
        {descricao}
      </p>
      <p className={`mt-5 text-sm font-black ${destaque ? "text-white" : "text-blue-700"}`}>
        {acao}
      </p>
    </Link>
  );
}

