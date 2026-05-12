"use client";

import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { api } from "@/services/api";

type EtapaSessao =
  | "ABERTURA"
  | "LEITURA_BIBLICA"
  | "CHAMADA_VEREADORES"
  | "VERIFICACAO_QUORUM"
  | "LEITURA_EXPEDIENTE"
  | "PEQUENAS_COMUNICACOES"
  | "GRANDE_EXPEDIENTE"
  | "ORDEM_DO_DIA"
  | "RESULTADO"
  | "EXPLICACOES_PESSOAIS"
  | "ENCERRAMENTO";

type Sessao = { id: string };
type Pauta = { sessao_id: string };
type VotacaoAtiva = { pautas?: { sessao_id?: string } };
type FilaItem = {
  id: string;
  status: string;
  tipo_fala: string;
  vereador: { nome: string; partido?: string | null; cadeira?: number | null };
};

const ETAPAS: Array<[EtapaSessao, string]> = [
  ["ABERTURA", "Abertura"],
  ["LEITURA_BIBLICA", "Leitura bíblica"],
  ["CHAMADA_VEREADORES", "Chamada dos vereadores"],
  ["VERIFICACAO_QUORUM", "Verificação de quórum"],
  ["LEITURA_EXPEDIENTE", "Leitura do expediente"],
  ["PEQUENAS_COMUNICACOES", "Pequenas comunicações"],
  ["GRANDE_EXPEDIENTE", "Grande expediente"],
  ["ORDEM_DO_DIA", "Ordem do dia e votação"],
  ["RESULTADO", "Resultado"],
  ["EXPLICACOES_PESSOAIS", "Explicações pessoais"],
  ["ENCERRAMENTO", "Encerramento"],
];

const PRESETS: Record<EtapaSessao, { titulo: string; descricao: string }> = {
  ABERTURA: {
    titulo: "Abertura da sessão",
    descricao: "Os trabalhos legislativos serão iniciados.",
  },
  LEITURA_BIBLICA: {
    titulo: "Leitura bíblica",
    descricao: "Momento da leitura bíblica da sessão.",
  },
  CHAMADA_VEREADORES: {
    titulo: "Chamada dos vereadores",
    descricao: "Registro nominal de presença dos vereadores.",
  },
  VERIFICACAO_QUORUM: {
    titulo: "Verificação de quórum",
    descricao: "Conferência de quórum regimental para andamento.",
  },
  LEITURA_EXPEDIENTE: {
    titulo: "Leitura do expediente",
    descricao: "Leitura do expediente pela mesa diretora.",
  },
  PEQUENAS_COMUNICACOES: {
    titulo: "Pequenas comunicações",
    descricao: "Uso da palavra em comunicações breves (até 5 minutos).",
  },
  GRANDE_EXPEDIENTE: {
    titulo: "Grande expediente",
    descricao: "Pronunciamentos dos vereadores (até 15 minutos).",
  },
  ORDEM_DO_DIA: {
    titulo: "Ordem do dia e votação",
    descricao: "Discussão e votação das matérias em pauta.",
  },
  RESULTADO: {
    titulo: "Resultado da votação",
    descricao: "Apuração e proclamação do resultado.",
  },
  EXPLICACOES_PESSOAIS: {
    titulo: "Explicações pessoais",
    descricao: "Pronunciamentos finais dos vereadores (até 3 minutos).",
  },
  ENCERRAMENTO: {
    titulo: "Encerramento da sessão",
    descricao: "Encerramento formal dos trabalhos.",
  },
};

export default function Dashboard() {
  const [sessaoId, setSessaoId] = useState<string>();
  const [etapa, setEtapa] = useState<EtapaSessao>("ABERTURA");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [filaOradores, setFilaOradores] = useState<FilaItem[]>([]);
  const [confirmarReordenacao, setConfirmarReordenacao] = useState(true);

  const etapaIndex = useMemo(
    () => ETAPAS.findIndex(([key]) => key === etapa),
    [etapa],
  );

  async function carregar() {
    const [votacaoAtivaResponse, pautasResponse, sessoesResponse] =
      await Promise.all([
        api.get("/votacoes/ativa").catch(() => ({ data: null as VotacaoAtiva | null })),
        api.get("/pautas"),
        api.get("/sessoes"),
      ]);

    const pautas = pautasResponse.data as Pauta[];
    const id =
      votacaoAtivaResponse.data?.pautas?.sessao_id ||
      pautas?.[0]?.sessao_id ||
      (sessoesResponse.data?.[0] as Sessao | undefined)?.id;

    setSessaoId(id);
    if (!id) {
      setEtapa("ABERTURA");
      setTitulo("");
      setDescricao("");
      setFilaOradores([]);
      return;
    }

    const [etapaResponse, filaResponse] = await Promise.all([
      api.get(`/sessoes/${id}/etapa`),
      api.get(`/sessoes/${id}/fila-oradores`),
    ]);
    const etapaAtual = (etapaResponse.data?.etapa as EtapaSessao) || "ABERTURA";
    setEtapa(etapaAtual);
    setTitulo(etapaResponse.data?.etapa_titulo || PRESETS[etapaAtual].titulo);
    setDescricao(
      etapaResponse.data?.etapa_descricao || PRESETS[etapaAtual].descricao,
    );
    setFilaOradores(filaResponse.data?.itens || []);
  }

  async function salvarEtapa(etapaAlvo: EtapaSessao, usarPreset = false) {
    if (!sessaoId) return;
    const preset = PRESETS[etapaAlvo];
    const tituloFinal = usarPreset ? preset.titulo : titulo;
    const descricaoFinal = usarPreset ? preset.descricao : descricao;
    try {
      setSalvando(true);
      await api.patch(`/sessoes/${sessaoId}/etapa`, {
        etapa: etapaAlvo,
        titulo: tituloFinal,
        descricao: descricaoFinal,
      });
      setEtapa(etapaAlvo);
      setTitulo(tituloFinal);
      setDescricao(descricaoFinal);
    } finally {
      setSalvando(false);
    }
  }

  async function avancar(delta: -1 | 1) {
    if (etapaIndex < 0) return;
    const next = etapaIndex + delta;
    if (next < 0 || next >= ETAPAS.length) return;
    await salvarEtapa(ETAPAS[next][0], true);
  }

  async function encerrarSessao() {
    if (!sessaoId) return;
    if (etapa !== "ENCERRAMENTO") {
      alert("A sessão só pode ser encerrada na etapa Encerramento.");
      return;
    }
    if (!confirm("Confirmar encerramento definitivo da sessão?")) return;
    try {
      setSalvando(true);
      const response = await api.post(`/sessoes/${sessaoId}/encerrar`);
      alert(response.data?.mensagem || "Sessão encerrada com sucesso.");
      await carregar();
    } catch (error: any) {
      alert(error?.response?.data?.mensagem || "Erro ao encerrar sessão.");
    } finally {
      setSalvando(false);
    }
  }

  async function moverItemFila(itemId: string, direcao: "CIMA" | "BAIXO") {
    if (!sessaoId) return;
    if (confirmarReordenacao && !confirm("Confirmar reordenação da fila?")) return;
    await api.post(`/sessoes/${sessaoId}/fila-oradores/${itemId}/mover`, { direcao });
    const filaResponse = await api.get(`/sessoes/${sessaoId}/fila-oradores`);
    setFilaOradores(filaResponse.data?.itens || []);
  }

  async function removerItemFila(itemId: string) {
    if (!sessaoId) return;
    if (confirmarReordenacao && !confirm("Confirmar remoção do item?")) return;
    await api.delete(`/sessoes/${sessaoId}/fila-oradores/${itemId}`);
    const filaResponse = await api.get(`/sessoes/${sessaoId}/fila-oradores`);
    setFilaOradores(filaResponse.data?.itens || []);
  }

  useEffect(() => {
    carregar();
    try {
      const raw = localStorage.getItem("config_confirmar_reordenacao_fila");
      if (raw !== null) setConfirmarReordenacao(raw === "true");
    } catch {}
  }, []);

  return (
    <main className="flex min-h-screen bg-gray-100">
      <Sidebar />
      <section className="flex-1 p-8">
        <h1 className="mb-2 text-4xl font-bold text-gray-800">Dashboard Administrativo</h1>
        <p className="mb-8 text-gray-600">Controle geral da sessão e do telão.</p>

        <div className="mb-6 flex gap-3">
          <a
            href="/telao"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800"
          >
            Abrir Telão
          </a>
          <button
            onClick={carregar}
            className="rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-800"
          >
            Atualizar
          </button>
        </div>

        <section className="rounded-xl bg-white p-6 shadow">
          <p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Etapas da sessão</p>
          <p className="mt-1 text-sm text-slate-600">Controle manual do que aparece no telão.</p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              disabled={salvando || !sessaoId || etapaIndex <= 0}
              onClick={() => avancar(-1)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
            >
              Etapa anterior
            </button>
            <button
              disabled={salvando || !sessaoId || etapaIndex >= ETAPAS.length - 1}
              onClick={() => avancar(1)}
              className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-800 disabled:opacity-60"
            >
              Próxima etapa
            </button>
            <button
              disabled={salvando || !sessaoId}
              onClick={() => {
                setTitulo(PRESETS[etapa].titulo);
                setDescricao(PRESETS[etapa].descricao);
              }}
              className="rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
            >
              Aplicar modelo da etapa
            </button>
            {etapa === "ENCERRAMENTO" && (
              <button
                disabled={salvando || !sessaoId}
                onClick={encerrarSessao}
                className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-bold text-white hover:bg-rose-800 disabled:opacity-60"
              >
                Encerrar sessão
              </button>
            )}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[320px_1fr]">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">
                Etapa oficial da sessão
              </label>
              <select
                value={etapa}
                onChange={(e) => salvarEtapa(e.target.value as EtapaSessao, true)}
                disabled={salvando || !sessaoId}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-800 disabled:opacity-60"
              >
                {ETAPAS.map(([value, label], index) => (
                  <option key={value} value={value}>
                    {String(index + 1).padStart(2, "0")} - {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Resumo da etapa atual</p>
              <p className="mt-2 text-lg font-bold text-slate-900">{PRESETS[etapa].titulo}</p>
              <p className="mt-1 text-sm text-slate-700">{PRESETS[etapa].descricao}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Título da etapa no telão"
              className="rounded-lg border border-slate-300 px-3 py-3"
            />
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descrição da etapa no telão"
              className="min-h-24 rounded-lg border border-slate-300 px-3 py-3"
            />
            <button
              disabled={salvando || !sessaoId}
              onClick={() => salvarEtapa(etapa)}
              className="w-fit rounded-lg bg-indigo-700 px-4 py-2 font-semibold text-white hover:bg-indigo-800 disabled:opacity-60"
            >
              Salvar texto da etapa
            </button>
          </div>

          <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-violet-700">Fila de oradores</p>
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={confirmarReordenacao}
                onChange={(e) => {
                  setConfirmarReordenacao(e.target.checked);
                  localStorage.setItem("config_confirmar_reordenacao_fila", String(e.target.checked));
                }}
              />
              Exigir confirmação para reordenar/remover
            </label>
            <p className="mt-1 text-sm text-slate-600">
              O planejamento inicial da fila é feito no cadastro da sessão. Aqui é acompanhamento e ajuste fino.
            </p>

            <div className="mt-3 grid gap-2">
              {filaOradores.length === 0 ? (
                <p className="rounded-lg bg-white p-3 text-sm text-slate-600">Sem oradores na fila.</p>
              ) : (
                filaOradores.map((item, idx) => (
                  <div key={item.id} className="rounded-lg bg-white p-3 text-sm text-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <b>{idx + 1}. {item.vereador.nome}</b> | {item.tipo_fala.replaceAll("_", " ")} | {item.status} |{" "}
                        {item.vereador.partido || "-"} | Cadeira {item.vereador.cadeira || "-"}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          disabled={idx === 0}
                          onClick={() => moverItemFila(item.id, "CIMA")}
                          className="rounded border border-slate-300 px-2 py-1 font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                        >
                          ↑
                        </button>
                        <button
                          disabled={idx === filaOradores.length - 1}
                          onClick={() => moverItemFila(item.id, "BAIXO")}
                          className="rounded border border-slate-300 px-2 py-1 font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => removerItemFila(item.id)}
                          className="rounded bg-rose-600 px-2 py-1 font-bold text-white hover:bg-rose-700"
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
