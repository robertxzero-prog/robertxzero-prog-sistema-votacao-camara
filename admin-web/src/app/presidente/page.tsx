"use client";

import { useEffect, useMemo, useState } from "react";
import { io, Socket } from "socket.io-client";

import { Sidebar } from "@/components/Sidebar";
import { api } from "@/services/api";

type TipoMaioria = "SIMPLES" | "ABSOLUTA" | "DOIS_TERCOS";
type StatusVotacao = "ABERTA" | "ENCERRADA" | "CANCELADA";

type Voto = {
  id: string;
  voto: "SIM" | "NAO" | "ABSTENCAO";
  vereador_id: string;
  vereadores?: {
    usuarios?: {
      nome: string;
    };
    partido?: string | null;
  };
};

type Pauta = {
  id: string;
  sessao_id: string;
  numero_ordem: number;
  titulo: string;
  descricao: string | null;
  tipo_maioria: TipoMaioria;
  sessoes?: {
    titulo: string;
  };
  votacoes?: Array<{
    id: string;
    status: StatusVotacao;
  }>;
};

type VotacaoAtiva = {
  id: string;
  status: StatusVotacao;
  aberta_em: string;
  pautas?: Pauta;
  votos?: Voto[];
};

type Quorum = {
  presentes: number;
  ausentes: number;
  total_vereadores: number;
  quorum_minimo: number;
  quorum_atingido: boolean;
};

type PresencaAtualizada = {
  sessao_id: string;
  quorum: Quorum;
};

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

type EtapaAtualizada = {
  sessao_id: string;
  titulo?: string;
  etapa: EtapaSessao;
};

type TipoFalaSessao =
  | "PEQUENAS_COMUNICACOES"
  | "GRANDE_EXPEDIENTE"
  | "ORDEM_DO_DIA"
  | "EXPLICACOES_PESSOAIS";

type VereadorItem = {
  id: string;
  nome: string;
  partido: string;
  cadeiraNumero: number | null;
  foto_url?: string | null;
  ativo?: boolean;
  vereadores?: {
    id: string;
  } | null;
};

type OradorAtual = {
  sessao_id: string;
  tipo_fala?: TipoFalaSessao | null;
  duracao_segundos?: number | null;
  inicio_em?: string | null;
  orador?: {
    vereador_id: string;
    usuario_id: string;
    nome: string;
    foto_url?: string | null;
    partido?: string | null;
    cadeira?: number | null;
  } | null;
};

type FilaOradorItem = {
  id: string;
  status: "PENDENTE" | "CHAMADO" | "ENCERRADO" | "CANCELADO";
  tipo_fala: TipoFalaSessao;
  solicitada_em?: string;
  vereador: {
    vereador_id: string;
    nome: string;
    foto_url?: string | null;
    partido?: string | null;
    cadeira?: number | null;
  };
};

type ResultadoEncerramento = {
  resultado: "APROVADA" | "REJEITADA" | "EMPATE" | "SEM_QUORUM";
  regra: {
    tipo_maioria: TipoMaioria;
    votos_necessarios: number;
    presentes: number;
    ausentes: number;
    quorum_atingido: boolean;
  };
  totais: {
    sim: number;
    nao: number;
    abstencao: number;
    total: number;
  };
};

function textoTipoMaioria(tipo?: TipoMaioria) {
  const textos: Record<TipoMaioria, string> = {
    SIMPLES: "Maioria simples",
    ABSOLUTA: "Maioria absoluta",
    DOIS_TERCOS: "Dois terços",
  };

  return tipo ? textos[tipo] : "Maioria simples";
}

function textoResultado(resultado?: ResultadoEncerramento["resultado"]) {
  const textos: Record<ResultadoEncerramento["resultado"], string> = {
    APROVADA: "Aprovada",
    REJEITADA: "Rejeitada",
    EMPATE: "Empate",
    SEM_QUORUM: "Sem quórum",
  };

  return resultado ? textos[resultado] : "-";
}

function votosNecessarios(tipo?: TipoMaioria, presentes = 0) {
  if (tipo === "ABSOLUTA") {
    return 5;
  }

  if (tipo === "DOIS_TERCOS") {
    return 6;
  }

  return Math.floor(presentes / 2) + 1;
}

export default function PresidentePage() {
  const [pautas, setPautas] = useState<Pauta[]>([]);
  const [votacao, setVotacao] = useState<VotacaoAtiva | null>(null);
  const [quorum, setQuorum] = useState<Quorum | null>(null);
  const [resultado, setResultado] = useState<ResultadoEncerramento | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [conectado, setConectado] = useState(false);
  const [mensagem, setMensagem] = useState("Carregando painel...");
  const [etapaSessao, setEtapaSessao] = useState<EtapaSessao>("ABERTURA");
  const [vereadores, setVereadores] = useState<VereadorItem[]>([]);
  const [oradorAtual, setOradorAtual] = useState<OradorAtual | null>(null);
  const [oradorVereadorId, setOradorVereadorId] = useState("");
  const [oradorTipoFala, setOradorTipoFala] =
    useState<TipoFalaSessao>("PEQUENAS_COMUNICACOES");
  const [oradorDuracao, setOradorDuracao] = useState("300");
  const [filaOradores, setFilaOradores] = useState<FilaOradorItem[]>([]);

  const votos = votacao?.votos || [];
  const totais = useMemo(
    () => ({
      sim: votos.filter((voto) => voto.voto === "SIM").length,
      nao: votos.filter((voto) => voto.voto === "NAO").length,
      abstencao: votos.filter((voto) => voto.voto === "ABSTENCAO").length,
      total: votos.length,
    }),
    [votos],
  );

  const pautasDisponiveis = pautas.filter(
    (pauta) =>
      !pauta.votacoes?.some((item) => item.status === "ABERTA") &&
      !pauta.votacoes?.some((item) => item.status === "ENCERRADA"),
  );
  const sessaoAtualId = votacao?.pautas?.sessao_id || pautas[0]?.sessao_id;
  const tiposFalaPermitidos =
    etapaSessao === "ORDEM_DO_DIA"
      ? (["ORDEM_DO_DIA"] as TipoFalaSessao[])
      : etapaSessao === "PEQUENAS_COMUNICACOES"
        ? (["PEQUENAS_COMUNICACOES"] as TipoFalaSessao[])
        : etapaSessao === "GRANDE_EXPEDIENTE"
          ? (["GRANDE_EXPEDIENTE"] as TipoFalaSessao[])
          : etapaSessao === "EXPLICACOES_PESSOAIS"
            ? (["EXPLICACOES_PESSOAIS"] as TipoFalaSessao[])
            : ([] as TipoFalaSessao[]);

  function duracaoPadraoPorFala(tipo: TipoFalaSessao) {
    const mapa: Record<TipoFalaSessao, number> = {
      PEQUENAS_COMUNICACOES: 5 * 60,
      GRANDE_EXPEDIENTE: 15 * 60,
      ORDEM_DO_DIA: 5 * 60,
      EXPLICACOES_PESSOAIS: 3 * 60,
    };
    return mapa[tipo];
  }

  async function carregarQuorum(sessaoId?: string) {
    if (!sessaoId) {
      setQuorum(null);
      return;
    }

    const response = await api.get(`/presencas/${sessaoId}/quorum`);
    setQuorum(response.data);
  }

  async function carregarEtapa(sessaoId?: string) {
    if (!sessaoId) {
      setEtapaSessao("ABERTURA");
      return;
    }

    const response = await api.get(`/sessoes/${sessaoId}/etapa`);
    setEtapaSessao((response.data?.etapa as EtapaSessao) || "ABERTURA");
  }

  async function carregarVereadores() {
    const response = await api.get("/usuarios");
    const lista = (response.data || [])
      .filter((u: VereadorItem) => !!u.vereadores && u.ativo !== false)
      .map((u: VereadorItem) => ({
        ...u,
        partido: u.partido || "-",
      }));
    setVereadores(lista);
    if (!oradorVereadorId && lista[0]?.vereadores?.id) {
      setOradorVereadorId(lista[0].vereadores.id);
    }
  }

  async function carregarOrador(sessaoId?: string) {
    if (!sessaoId) {
      setOradorAtual(null);
      return;
    }

    const response = await api.get(`/sessoes/${sessaoId}/orador`);
    setOradorAtual(response.data || null);
  }

  async function carregarFilaOradores(sessaoId?: string) {
    if (!sessaoId) {
      setFilaOradores([]);
      return;
    }
    const response = await api.get(`/sessoes/${sessaoId}/fila-oradores`);
    setFilaOradores(response.data?.itens || []);
  }

  async function carregarPainel() {
    try {
      setLoading(true);

      const [votacaoResponse, pautasResponse] = await Promise.all([
        api.get("/votacoes/ativa"),
        api.get("/pautas"),
      ]);

      setVotacao(votacaoResponse.data);
      setPautas(pautasResponse.data);
      setResultado(null);

      await carregarQuorum(votacaoResponse.data?.pautas?.sessao_id);
      await carregarEtapa(votacaoResponse.data?.pautas?.sessao_id);
      await carregarVereadores();
      await carregarOrador(votacaoResponse.data?.pautas?.sessao_id);
      await carregarFilaOradores(votacaoResponse.data?.pautas?.sessao_id);
      setMensagem("Painel atualizado");
    } catch (error) {
      console.error(error);
      alert("Erro ao carregar painel do presidente.");
    } finally {
      setLoading(false);
    }
  }

  async function abrirVotacao(pautaId: string) {
    try {
      setProcessando(true);
      await api.post(`/votacoes/abrir/${pautaId}`);
      await carregarPainel();
      setMensagem("Votação aberta");
    } catch (error: any) {
      console.error(error);
      alert(error?.response?.data?.message || "Erro ao abrir votação.");
    } finally {
      setProcessando(false);
    }
  }

  async function encerrarVotacao() {
    if (!votacao) {
      return;
    }

    const confirmar = confirm("Deseja realmente encerrar esta votação?");

    if (!confirmar) {
      return;
    }

    try {
      setProcessando(true);
      const response = await api.patch(`/votacoes/${votacao.id}/encerrar`);
      setResultado(response.data);
      setVotacao(null);
      await carregarPainel();
      setResultado(response.data);
      if (response.data?.votacao?.pautas?.sessao_id) {
        await atualizarEtapaSessao(
          response.data.votacao.pautas.sessao_id,
          "RESULTADO",
        );
      }
      setMensagem("Votação encerrada");
    } catch (error: any) {
      console.error(error);
      alert(error?.response?.data?.message || "Erro ao encerrar votação.");
    } finally {
      setProcessando(false);
    }
  }

  async function atualizarEtapaSessao(sessaoId: string, etapa: EtapaSessao) {
    try {
      setProcessando(true);
      await api.patch(`/sessoes/${sessaoId}/etapa`, { etapa });
      setEtapaSessao(etapa);
      setMensagem("Etapa da sessão atualizada");
    } catch (error: any) {
      console.error(error);
      alert(error?.response?.data?.message || "Erro ao atualizar etapa.");
    } finally {
      setProcessando(false);
    }
  }

  async function iniciarFalaOrador() {
    if (!sessaoAtualId) {
      alert("Nenhuma sessão disponível para controlar fala.");
      return;
    }
    if (!oradorVereadorId) {
      alert("Selecione um vereador para falar.");
      return;
    }
    if (!tiposFalaPermitidos.includes(oradorTipoFala)) {
      alert("Tipo de fala incompatível com a etapa atual da sessão.");
      return;
    }

    try {
      setProcessando(true);
      const duracao = Number(oradorDuracao) || duracaoPadraoPorFala(oradorTipoFala);
      const response = await api.patch(`/sessoes/${sessaoAtualId}/orador`, {
        vereador_id: oradorVereadorId,
        tipo_fala: oradorTipoFala,
        duracao_segundos: duracao,
      });
      setOradorAtual(response.data);
      setMensagem("Fala do vereador iniciada");
    } catch (error: any) {
      console.error(error);
      alert(error?.response?.data?.message || "Erro ao iniciar fala.");
    } finally {
      setProcessando(false);
    }
  }

  async function limparFalaOrador() {
    if (!sessaoAtualId) {
      return;
    }
    try {
      setProcessando(true);
      const response = await api.delete(`/sessoes/${sessaoAtualId}/orador`);
      setOradorAtual(response.data);
      await carregarFilaOradores(sessaoAtualId);
      setMensagem("Fala encerrada");
    } catch (error: any) {
      console.error(error);
      alert(error?.response?.data?.message || "Erro ao encerrar fala.");
    } finally {
      setProcessando(false);
    }
  }

  useEffect(() => {
    carregarPainel();

    const socket: Socket = io("http://localhost:3000", {
      transports: ["websocket", "polling"],
      timeout: 12000,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1200,
      reconnectionDelayMax: 5000,
    });

    socket.on("connect", () => {
      setConectado(true);
      setMensagem("Realtime conectado");
      carregarPainel();
    });

    socket.on("disconnect", () => {
      setConectado(false);
      setMensagem("Realtime desconectado");
    });

    socket.on("connect_error", () => {
      setConectado(false);
      setMensagem("Reconectando");
    });

    socket.on("votacao_atualizada", async (data: VotacaoAtiva | null) => {
      setVotacao(data);
      setResultado(null);
      await carregarQuorum(data?.pautas?.sessao_id);
      await carregarEtapa(data?.pautas?.sessao_id);
      setMensagem(data ? "Votação atualizada" : "Aguardando votação");
    });

    socket.on("voto_registrado", async () => {
      await carregarPainel();
      setMensagem("Novo voto registrado");
    });

    socket.on("presenca_atualizada", (data: PresencaAtualizada) => {
      setQuorum(data.quorum);
      setMensagem("Presença atualizada");
    });

    socket.on("sessao_etapa_atualizada", (data: EtapaAtualizada) => {
      if (data?.etapa) {
        setEtapaSessao(data.etapa);
        setMensagem("Etapa da sessão atualizada");
      }
    });

    socket.on("sessao_orador_atualizado", (data: OradorAtual) => {
      setOradorAtual(data);
      setMensagem(data?.orador ? "Orador da sessão atualizado" : "Fala encerrada");
    });

    socket.on("sessao_fila_oradores_atualizada", (data: any) => {
      setFilaOradores(data?.itens || []);
      setMensagem("Fila de oradores atualizada");
    });

    socket.on("votacao_encerrada", async (data: ResultadoEncerramento) => {
      setResultado(data);
      setVotacao(null);
      await carregarPainel();
      setResultado(data);
      setMensagem("Votação encerrada");
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (
      tiposFalaPermitidos.length > 0 &&
      !tiposFalaPermitidos.includes(oradorTipoFala)
    ) {
      setOradorTipoFala(tiposFalaPermitidos[0]);
      setOradorDuracao(String(duracaoPadraoPorFala(tiposFalaPermitidos[0])));
    }
  }, [etapaSessao]);

  const presentes = quorum?.presentes || 0;
  const necessarios = votosNecessarios(
    votacao?.pautas?.tipo_maioria,
    presentes,
  );

  async function chamarProximoDaFila() {
    if (!sessaoAtualId) return;
    try {
      setProcessando(true);
      await api.post(`/sessoes/${sessaoAtualId}/fila-oradores/chamar-proximo`);
      await carregarOrador(sessaoAtualId);
      await carregarFilaOradores(sessaoAtualId);
      setMensagem("Próximo orador chamado");
    } catch (error: any) {
      alert(error?.response?.data?.message || "Erro ao chamar próximo.");
    } finally {
      setProcessando(false);
    }
  }

  async function encerrarFalaDaFila() {
    if (!sessaoAtualId) return;
    try {
      setProcessando(true);
      await api.post(`/sessoes/${sessaoAtualId}/fila-oradores/encerrar-fala`);
      await carregarOrador(sessaoAtualId);
      await carregarFilaOradores(sessaoAtualId);
      setMensagem("Fala encerrada");
    } catch (error: any) {
      alert(error?.response?.data?.message || "Erro ao encerrar fala.");
    } finally {
      setProcessando(false);
    }
  }

  return (
    <main className="flex min-h-screen bg-gradient-to-b from-slate-100 to-slate-200">
      <Sidebar />

      <section className="flex-1 p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-slate-900">
              Painel do Presidente
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Controle a votação atual, acompanhe quórum e abra a próxima pauta.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`rounded-full px-4 py-2 text-sm font-bold text-white shadow ${
                conectado ? "bg-emerald-600" : "bg-amber-600"
              }`}
            >
              {conectado ? "Online" : "Reconectando"}
            </span>
            <button
              onClick={carregarPainel}
              className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-800"
            >
              Atualizar
            </button>
          </div>
        </div>

        <p className="mb-4 text-sm text-slate-600">{mensagem}</p>

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center font-semibold text-slate-700 shadow-lg">
            Carregando painel...
          </div>
        ) : (
          <div className="grid gap-6">
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div>
                  <p className="text-sm font-bold uppercase tracking-widest text-blue-600">
                    Votação atual
                  </p>

                  {votacao ? (
                    <>
                      <h2 className="mt-2 text-3xl font-black text-slate-900">
                        {votacao.pautas?.titulo}
                      </h2>
                      <p className="mt-2 text-slate-600">
                        {votacao.pautas?.descricao || "Sem descrição."}
                      </p>
                    </>
                  ) : (
                    <h2 className="mt-2 text-2xl font-bold text-slate-700">
                      Nenhuma votação aberta
                    </h2>
                  )}
                </div>

                {votacao && (
                  <button
                    disabled={processando}
                    onClick={encerrarVotacao}
                    className="rounded-lg bg-red-600 px-5 py-3 font-bold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    Encerrar votação
                  </button>
                )}
              </div>

              {votacao && (
                <div className="mt-6 grid gap-4 md:grid-cols-4">
                  <div className="rounded-lg bg-slate-100 p-4">
                    <p className="text-sm font-semibold text-slate-500">
                      Tipo de maioria
                    </p>
                    <p className="mt-1 text-xl font-bold text-slate-900">
                      {textoTipoMaioria(votacao.pautas?.tipo_maioria)}
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-100 p-4">
                    <p className="text-sm font-semibold text-slate-500">
                      Presentes
                    </p>
                    <p className="mt-1 text-3xl font-black text-slate-900">
                      {presentes}
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-100 p-4">
                    <p className="text-sm font-semibold text-slate-500">
                      Quórum
                    </p>
                    <p
                      className={`mt-1 text-xl font-black ${
                        quorum?.quorum_atingido
                          ? "text-green-700"
                          : "text-red-700"
                      }`}
                    >
                      {quorum?.quorum_atingido ? "Atingido" : "Insuficiente"}
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-100 p-4">
                    <p className="text-sm font-semibold text-slate-500">
                      Votos necessários
                    </p>
                    <p className="mt-1 text-3xl font-black text-slate-900">
                      {necessarios}
                    </p>
                  </div>
                </div>
              )}
            </section>

            {false && sessaoAtualId && (
              <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
                <p className="text-sm font-bold uppercase tracking-widest text-indigo-600">
                  Etapa da sessão
                </p>
                <h2 className="mt-1 text-2xl font-bold text-slate-900">
                  Controle de linha do tempo
                </h2>
                <div className="mt-4 grid gap-2 md:grid-cols-5">
                  {(
                    [
                      ["ABERTURA", "Abertura"],
                      ["LEITURA_BIBLICA", "Leitura bíblica"],
                      ["CHAMADA_VEREADORES", "Chamada dos vereadores"],
                      ["VERIFICACAO_QUORUM", "Verificação de quórum"],
                      ["LEITURA_EXPEDIENTE", "Leitura do expediente"],
                      ["PEQUENAS_COMUNICACOES", "Pequenas comunicações"],
                      ["GRANDE_EXPEDIENTE", "Grande expediente"],
                      ["ORDEM_DO_DIA", "Ordem do dia / votação"],
                      ["RESULTADO", "Resultado"],
                      ["EXPLICACOES_PESSOAIS", "Explicações pessoais"],
                      ["ENCERRAMENTO", "Encerramento"],
                    ] as Array<[EtapaSessao, string]>
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      disabled={
                        processando || !tiposFalaPermitidos.includes(oradorTipoFala)
                      }
                      onClick={() => atualizarEtapaSessao(sessaoAtualId, key)}
                      className={`rounded-lg border px-4 py-3 text-sm font-bold ${
                        etapaSessao === key
                          ? "border-indigo-700 bg-indigo-700 text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {sessaoAtualId && (
              <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
                <p className="text-sm font-bold uppercase tracking-widest text-purple-600">
                  Ordem de fala
                </p>
                <h2 className="mt-1 text-2xl font-bold text-slate-900">
                  Pequenas comunicações, grande expediente, ordem do dia e explicações pessoais
                </h2>

                <p className="mt-1 text-sm text-slate-600">
                  Etapa atual: <b>{etapaSessao}</b>
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <select
                    value={oradorVereadorId}
                    onChange={(e) => setOradorVereadorId(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-3"
                  >
                    <option value="">Selecione vereador</option>
                    {vereadores.map((v) => (
                      <option key={v.id} value={v.vereadores?.id}>
                        {v.nome} - {v.partido} - Cadeira {v.cadeiraNumero ?? "-"}
                      </option>
                    ))}
                  </select>

                  <select
                    value={oradorTipoFala}
                    onChange={(e) => {
                      const tipo = e.target.value as TipoFalaSessao;
                      setOradorTipoFala(tipo);
                      setOradorDuracao(String(duracaoPadraoPorFala(tipo)));
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-3"
                  >
                    <option value="PEQUENAS_COMUNICACOES" disabled={!tiposFalaPermitidos.includes("PEQUENAS_COMUNICACOES")}>Pequenas comunicações</option>
                    <option value="GRANDE_EXPEDIENTE" disabled={!tiposFalaPermitidos.includes("GRANDE_EXPEDIENTE")}>Grande expediente</option>
                    <option value="ORDEM_DO_DIA" disabled={!tiposFalaPermitidos.includes("ORDEM_DO_DIA")}>Ordem do dia / votação</option>
                    <option value="EXPLICACOES_PESSOAIS" disabled={!tiposFalaPermitidos.includes("EXPLICACOES_PESSOAIS")}>Explicações pessoais</option>
                  </select>

                  <input
                    type="number"
                    min={30}
                    step={30}
                    value={oradorDuracao}
                    onChange={(e) => setOradorDuracao(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-3"
                    placeholder="Duração (segundos)"
                  />

                  <div className="flex gap-2">
                    <button
                      onClick={iniciarFalaOrador}
                      disabled={processando}
                      className="flex-1 rounded-lg bg-purple-700 px-4 py-3 font-bold text-white hover:bg-purple-800 disabled:opacity-60"
                    >
                      Iniciar fala
                    </button>
                    <button
                      onClick={limparFalaOrador}
                      disabled={processando}
                      className="flex-1 rounded-lg bg-slate-700 px-4 py-3 font-bold text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      Encerrar fala
                    </button>
                  </div>
                </div>

                {oradorAtual?.orador && (
                  <div className="mt-4 rounded-lg border border-purple-200 bg-purple-50 p-4 text-sm text-slate-700">
                    Orador atual: <b>{oradorAtual.orador.nome}</b> | Partido{" "}
                    <b>{oradorAtual.orador.partido || "-"}</b> | Cadeira{" "}
                    <b>{oradorAtual.orador.cadeira || "-"}</b>
                  </div>
                )}
              </section>
            )}

            {sessaoAtualId && (
              <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
                <p className="text-sm font-bold uppercase tracking-widest text-violet-600">
                  Fila de oradores
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={chamarProximoDaFila}
                    disabled={processando}
                    className="rounded-lg bg-violet-700 px-4 py-2 font-bold text-white hover:bg-violet-800 disabled:opacity-60"
                  >
                    Chamar próximo
                  </button>
                  <button
                    onClick={encerrarFalaDaFila}
                    disabled={processando}
                    className="rounded-lg bg-slate-700 px-4 py-2 font-bold text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    Encerrar fala atual
                  </button>
                </div>
                <div className="mt-4 grid gap-2">
                  {filaOradores.length === 0 ? (
                    <p className="rounded-lg bg-slate-100 p-3 text-slate-600">
                      Sem pedidos pendentes na fila.
                    </p>
                  ) : (
                    filaOradores.map((item) => (
                      <div key={item.id} className="rounded-lg border border-slate-200 p-3">
                        <b>{item.vereador.nome}</b> | {item.vereador.partido || "-"} | Cadeira{" "}
                        {item.vereador.cadeira || "-"} | {item.tipo_fala.replaceAll("_", " ")} |{" "}
                        {item.status}
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}

            <section className="grid gap-4 md:grid-cols-4">
              <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 p-6 text-white shadow-lg">
                <p className="font-bold">SIM</p>
                <p className="mt-2 text-5xl font-black">{totais.sim}</p>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-rose-500 to-rose-700 p-6 text-white shadow-lg">
                <p className="font-bold">NÃO</p>
                <p className="mt-2 text-5xl font-black">{totais.nao}</p>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 p-6 text-white shadow-lg">
                <p className="font-bold">ABSTENÇÃO</p>
                <p className="mt-2 text-5xl font-black">{totais.abstencao}</p>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-slate-800 to-slate-950 p-6 text-white shadow-lg">
                <p className="font-bold">TOTAL</p>
                <p className="mt-2 text-5xl font-black">{totais.total}</p>
              </div>
            </section>

            {resultado && (
              <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
                <p className="text-sm font-bold uppercase tracking-widest text-green-600">
                  Último resultado
                </p>
                <h2 className="mt-2 text-3xl font-black text-slate-900">
                  {textoResultado(resultado.resultado)}
                </h2>
                <p className="mt-2 text-slate-600">
                  SIM: {resultado.totais.sim} | NÃO: {resultado.totais.nao} |
                  Abstenção: {resultado.totais.abstencao} | Total:{" "}
                  {resultado.totais.total}
                </p>
              </section>
            )}

            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold uppercase tracking-widest text-blue-600">
                    Próxima pauta
                  </p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-900">
                    Abrir votação
                  </h2>
                </div>
              </div>

              {pautasDisponiveis.length === 0 ? (
                <p className="rounded-lg bg-slate-100 p-4 text-slate-600">
                  Nenhuma pauta disponível para abrir votação.
                </p>
              ) : (
                <div className="grid gap-3">
                  {pautasDisponiveis.map((pauta) => (
                    <div
                      key={pauta.id}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 p-4"
                    >
                      <div>
                        <p className="font-bold text-slate-900">
                          {pauta.numero_ordem} - {pauta.titulo}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {pauta.sessoes?.titulo || "Sem sessão"} |{" "}
                          {textoTipoMaioria(pauta.tipo_maioria)}
                        </p>
                      </div>

                      <button
                        disabled={processando || !!votacao}
                        onClick={() => abrirVotacao(pauta.id)}
                        className="rounded-lg bg-green-600 px-4 py-2 font-bold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        Abrir
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
