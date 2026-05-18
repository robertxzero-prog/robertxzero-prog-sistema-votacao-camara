"use client";

import { useEffect, useState, type ReactNode } from "react";
import { io, Socket } from "socket.io-client";
import { api } from "@/services/api";

type Voto = {
  id: string;
  voto: "SIM" | "NAO" | "ABSTENCAO";
  vereador_id: string;
  vereadores?: {
    usuarios?: {
      nome: string;
    };
    partido?: string;
  };
};

type VotacaoAtiva = {
  id: string;
  status: string;
  aberta_em: string;
  encerrada_em?: string | null;
  pautas?: {
    id: string;
    sessao_id: string;
    titulo: string;
    descricao?: string;
    numero_ordem: number;
    tipo_maioria?: "SIMPLES" | "ABSOLUTA" | "DOIS_TERCOS";
    sessoes?: {
      titulo: string;
    };
  };
  votos?: Voto[];
};

type ResultadoFinal = {
  resultado: "APROVADA" | "REJEITADA" | "EMPATE" | "SEM_QUORUM";
  totais: {
    sim: number;
    nao: number;
    abstencao: number;
    total: number;
  };
  votacao: VotacaoAtiva;
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
  etapa_titulo?: string | null;
  etapa_descricao?: string | null;
};

type TipoFalaSessao =
  | "PEQUENAS_COMUNICACOES"
  | "GRANDE_EXPEDIENTE"
  | "ORDEM_DO_DIA"
  | "EXPLICACOES_PESSOAIS";

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

type LinhaTempoEtapa = {
  key: string;
  titulo: string;
  descricao: string;
};
type SessaoResumo = { id: string };

type FilaOradorItem = {
  id: string;
  status: string;
  tipo_fala: TipoFalaSessao;
  vereador: {
    nome: string;
    partido?: string | null;
    cadeira?: number | null;
  };
};

export default function TelaoPage() {
  const [votacao, setVotacao] = useState<VotacaoAtiva | null>(null);
  const [resultadoFinal, setResultadoFinal] = useState<ResultadoFinal | null>(
    null,
  );
  const [quorum, setQuorum] = useState<Quorum | null>(null);
  const [loading, setLoading] = useState(true);
  const [conectado, setConectado] = useState(false);
  const [mensagem, setMensagem] = useState("Aguardando conexão realtime...");
  const [agora, setAgora] = useState(new Date());
  const [etapaSessao, setEtapaSessao] = useState<EtapaSessao>("ABERTURA");
  const [etapaTitulo, setEtapaTitulo] = useState("");
  const [etapaDescricao, setEtapaDescricao] = useState("");
  const [oradorAtual, setOradorAtual] = useState<OradorAtual | null>(null);
  const [filaOradores, setFilaOradores] = useState<FilaOradorItem[]>([]);
  const [nomeCamara, setNomeCamara] = useState("Câmara Municipal");
  const [brasaoUrl, setBrasaoUrl] = useState<string | null>(null);
  const [tituloSessaoAtual, setTituloSessaoAtual] = useState("Sessão Legislativa");

  async function carregarQuorum(sessaoId?: string) {
    if (!sessaoId) {
      setQuorum(null);
      return;
    }

    try {
      const response = await api.get(`/presencas/${sessaoId}/quorum`);
      setQuorum(response.data);
    } catch (error) {
      console.error(error);
      setQuorum(null);
    }
  }

  async function carregarEtapa(sessaoId?: string) {
    if (!sessaoId) {
      setEtapaSessao("ABERTURA");
      return;
    }

    try {
      const response = await api.get(`/sessoes/${sessaoId}/etapa`);
      setEtapaSessao((response.data?.etapa as EtapaSessao) || "ABERTURA");
      setEtapaTitulo(response.data?.etapa_titulo || "");
      setEtapaDescricao(response.data?.etapa_descricao || "");
      if (response.data?.titulo) {
        setTituloSessaoAtual(response.data.titulo);
      }
    } catch (error) {
      console.error(error);
      setEtapaSessao("ABERTURA");
    }
  }

  async function carregarOrador(sessaoId?: string) {
    if (!sessaoId) {
      setOradorAtual(null);
      return;
    }

    try {
      const response = await api.get(`/sessoes/${sessaoId}/orador`);
      setOradorAtual(response.data || null);
    } catch (error) {
      console.error(error);
      setOradorAtual(null);
    }
  }

  async function carregarFilaOradores(sessaoId?: string) {
    if (!sessaoId) {
      setFilaOradores([]);
      return;
    }
    try {
      const response = await api.get(`/sessoes/${sessaoId}/fila-oradores`);
      setFilaOradores(response.data?.itens || []);
    } catch (error) {
      console.error(error);
      setFilaOradores([]);
    }
  }

  async function carregarVotacao() {
    try {
      setLoading(true);

      const response = await api.get("/votacoes/ativa");
      setVotacao(response.data);
      setResultadoFinal(null);

      let sessaoId = response.data?.pautas?.sessao_id;
      if (!sessaoId) {
        const sessoesResponse = await api.get("/sessoes");
        sessaoId = (sessoesResponse.data?.[0] as SessaoResumo | undefined)?.id;
      }

      await carregarQuorum(sessaoId);
      await carregarEtapa(sessaoId);
      await carregarOrador(sessaoId);
      await carregarFilaOradores(sessaoId);
    } catch (error) {
      console.error(error);
      alert("Erro ao carregar votação ativa.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    try {
      const nome = localStorage.getItem("config_camara_nome");
      const brasao = localStorage.getItem("config_camara_brasao");
      if (nome && nome.trim()) setNomeCamara(nome.trim());
      if (brasao && brasao.trim()) setBrasaoUrl(brasao);
    } catch {}
    api.get("/configuracao/camara").then((response) => {
      const conf = response.data?.config;
      if (!conf) return;
      if (conf.nome_oficial) setNomeCamara(conf.nome_oficial);
      if (conf.brasao_url) setBrasaoUrl(conf.brasao_url);
    }).catch(() => undefined);
    api.post("/configuracao/heartbeat").catch(() => undefined);

    carregarVotacao();

    const socket: Socket = io("http://localhost:3000", {
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      setConectado(true);
      setMensagem("Realtime conectado");
    });

    socket.on("disconnect", () => {
      setConectado(false);
      setMensagem("Realtime desconectado");
    });

    socket.on("votacao_atualizada", async (data: VotacaoAtiva | null) => {
      if (data) {
        setResultadoFinal(null);
        setVotacao(data);
        setMensagem("Votação atualizada");
        await carregarQuorum(data.pautas?.sessao_id);
        await carregarEtapa(data.pautas?.sessao_id);
        await carregarOrador(data.pautas?.sessao_id);
        await carregarFilaOradores(data.pautas?.sessao_id);
      } else if (!resultadoFinal) {
        setVotacao(null);
        setQuorum(null);
        setOradorAtual(null);
        setFilaOradores([]);
        setMensagem("Aguardando votação...");
      }

      setLoading(false);
    });

    socket.on("voto_registrado", () => {
      setMensagem("Novo voto registrado");
    });

    socket.on("presenca_atualizada", (data: PresencaAtualizada) => {
      const sessaoId =
        votacao?.pautas?.sessao_id || resultadoFinal?.votacao.pautas?.sessao_id;

      if (!sessaoId || data.sessao_id === sessaoId) {
        setQuorum(data.quorum);
        setMensagem("Presença atualizada");
      }
    });

    socket.on("votacao_encerrada", async (data: ResultadoFinal) => {
      setResultadoFinal(data);
      setVotacao(null);
      setMensagem("Votação encerrada");

      await carregarQuorum(data.votacao.pautas?.sessao_id);
      await carregarEtapa(data.votacao.pautas?.sessao_id);
      await carregarOrador(data.votacao.pautas?.sessao_id);
      await carregarFilaOradores(data.votacao.pautas?.sessao_id);
    });

    socket.on("sessao_etapa_atualizada", (data: EtapaAtualizada) => {
      if (data?.etapa) {
        setEtapaSessao(data.etapa);
        setEtapaTitulo(data.etapa_titulo || "");
        setEtapaDescricao(data.etapa_descricao || "");
        setMensagem("Etapa da sessão atualizada");
      }
    });

    socket.on("sessao_orador_atualizado", (data: OradorAtual) => {
      setOradorAtual(data);
      setMensagem(data?.orador ? "Momento de fala em andamento" : "Fala encerrada");
    });

    socket.on("sessao_fila_oradores_atualizada", (data: any) => {
      setFilaOradores(data?.itens || []);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const intervalo = setInterval(() => {
      setAgora(new Date());
    }, 1000);

    return () => clearInterval(intervalo);
  }, []);

  function formatarTempoAberto(dataAbertura?: string) {
    if (!dataAbertura) {
      return "00:00";
    }

    const inicio = new Date(dataAbertura).getTime();
    const atual = agora.getTime();

    const diferenca = Math.max(0, Math.floor((atual - inicio) / 1000));

    const horas = Math.floor(diferenca / 3600);
    const minutos = Math.floor((diferenca % 3600) / 60);
    const segundos = diferenca % 60;

    if (horas > 0) {
      return `${String(horas).padStart(2, "0")}:${String(minutos).padStart(
        2,
        "0",
      )}:${String(segundos).padStart(2, "0")}`;
    }

    return `${String(minutos).padStart(2, "0")}:${String(segundos).padStart(
      2,
      "0",
    )}`;
  }

  function textoVoto(voto: string) {
    if (voto === "NAO") {
      return "NÃO";
    }

    if (voto === "ABSTENCAO") {
      return "ABSTENÇÃO";
    }

    return voto;
  }

  function textoTipoMaioria(tipo?: string) {
    if (tipo === "ABSOLUTA") {
      return "Maioria absoluta";
    }

    if (tipo === "DOIS_TERCOS") {
      return "Dois terços";
    }

    return "Maioria simples";
  }

  function votosNecessarios(tipo?: string, presentes = 0) {
    if (tipo === "ABSOLUTA") {
      return 5;
    }

    if (tipo === "DOIS_TERCOS") {
      return 6;
    }

    return Math.floor(presentes / 2) + 1;
  }

  function textoTipoFala(tipo?: TipoFalaSessao | null) {
    if (tipo === "PEQUENAS_COMUNICACOES") return "Pequenas comunicações";
    if (tipo === "GRANDE_EXPEDIENTE") return "Grande expediente";
    if (tipo === "ORDEM_DO_DIA") return "Ordem do dia / votação";
    if (tipo === "EXPLICACOES_PESSOAIS") return "Explicações pessoais";
    return "Sem fala ativa";
  }

  function etapaAtualLinhaTempo(): LinhaTempoEtapa["key"] {
    const mapa: Record<EtapaSessao, LinhaTempoEtapa["key"]> = {
      ABERTURA: "abertura",
      LEITURA_BIBLICA: "biblica",
      CHAMADA_VEREADORES: "chamada",
      VERIFICACAO_QUORUM: "quorum",
      LEITURA_EXPEDIENTE: "expediente",
      PEQUENAS_COMUNICACOES: "pequenas",
      GRANDE_EXPEDIENTE: "grande",
      ORDEM_DO_DIA: "ordem",
      RESULTADO: "ordem",
      EXPLICACOES_PESSOAIS: "explicacoes",
      ENCERRAMENTO: "encerramento",
    };

    return mapa[etapaSessao] || "abertura";
  }

  function tempoRestanteOrador() {
    if (!oradorAtual?.orador || !oradorAtual?.inicio_em || !oradorAtual?.duracao_segundos) {
      return null;
    }

    const inicio = new Date(oradorAtual.inicio_em).getTime();
    const fim = inicio + oradorAtual.duracao_segundos * 1000;
    const restante = Math.max(0, Math.floor((fim - agora.getTime()) / 1000));
    const min = Math.floor(restante / 60);
    const sec = restante % 60;
    return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  function segundosRestantesOrador() {
    if (!oradorAtual?.orador || !oradorAtual?.inicio_em || !oradorAtual?.duracao_segundos) {
      return null;
    }
    const inicio = new Date(oradorAtual.inicio_em).getTime();
    const fim = inicio + oradorAtual.duracao_segundos * 1000;
    return Math.max(0, Math.floor((fim - agora.getTime()) / 1000));
  }

  function oradorExpirado() {
    if (!oradorAtual?.orador || !oradorAtual?.inicio_em || !oradorAtual?.duracao_segundos) {
      return false;
    }
    const inicio = new Date(oradorAtual.inicio_em).getTime();
    const fim = inicio + oradorAtual.duracao_segundos * 1000;
    return agora.getTime() >= fim;
  }

  function hasOradorAtivo() {
    return !!oradorAtual?.orador && !oradorExpirado();
  }

  function LinhaDoTempoSessao() {
    const etapaAtual = etapaAtualLinhaTempo();
    const etapas: LinhaTempoEtapa[] = [
      { key: "abertura", titulo: "Abertura", descricao: "Início da sessão" },
      { key: "biblica", titulo: "Leitura bíblica", descricao: "Momento de leitura" },
      { key: "chamada", titulo: "Chamada", descricao: "Registro de presença" },
      { key: "quorum", titulo: "Quórum", descricao: "Verificação de quórum" },
      { key: "expediente", titulo: "Expediente", descricao: "Leitura do expediente" },
      { key: "pequenas", titulo: "Pequenas comunicações", descricao: "Falas de até 5 minutos" },
      { key: "grande", titulo: "Grande expediente", descricao: "Falas de até 15 minutos" },
      { key: "ordem", titulo: "Ordem do dia", descricao: "Discussão e votação da matéria" },
      { key: "explicacoes", titulo: "Explicações pessoais", descricao: "Falas de até 3 minutos" },
      { key: "encerramento", titulo: "Encerramento", descricao: "Finalização da sessão" },
    ];
    const atualIndex = Math.max(0, etapas.findIndex((item) => item.key === etapaAtual));

    return (
      <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl">
        <p className="text-sm font-bold uppercase tracking-widest text-slate-400">
          Linha do tempo da sessão
        </p>
        <PainelEtapaAtualPremium />
      </div>
    );
  }

  function PainelEtapaAtual() {
    const titulo = etapaTitulo || "";
    const descricao = etapaDescricao || "";
    const bloco = (icone: ReactNode, t: string, d: string, extra?: string) => (
      <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-800/80 p-6">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 text-blue-300">{icone}</div>
          <div>
            <p className="text-3xl font-black text-white">{t}</p>
            <p className="text-lg text-slate-300">{d}</p>
          </div>
        </div>
        {extra && <p className="mt-4 text-2xl font-semibold text-blue-200">{extra}</p>}
      </div>
    );

    if (etapaSessao === "ABERTURA") {
      return bloco(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 10l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>,
        titulo || "Abertura da sessão",
        descricao || "Os trabalhos legislativos vão começar.",
      );
    }
    if (etapaSessao === "LEITURA_BIBLICA") {
      return bloco(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 4h10a2 2 0 0 1 2 2v14H8a2 2 0 0 0-2 2"/><path d="M6 4v16"/></svg>,
        titulo || "Leitura bíblica",
        descricao || "Momento de leitura da passagem bíblica.",
        "Passagem em leitura"
      );
    }
    if (etapaSessao === "LEITURA_EXPEDIENTE") {
      return bloco(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>,
        titulo || "Leitura do expediente",
        descricao || "Leitura oficial do expediente da sessão.",
        "Leitura realizada pela Mesa Diretora • Secretário-geral"
      );
    }
    if (etapaSessao === "PEQUENAS_COMUNICACOES") {
      return bloco(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1v22"/><path d="M7 6h7a4 4 0 0 1 0 8H9"/></svg>,
        titulo || "Pequenas comunicações",
        descricao || "Uso da palavra em comunicações breves (até 5 minutos).",
      );
    }
    if (etapaSessao === "GRANDE_EXPEDIENTE") {
      return bloco(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>,
        titulo || "Grande expediente",
        descricao || "Pronunciamentos dos vereadores (até 15 minutos).",
      );
    }
    if (etapaSessao === "ORDEM_DO_DIA") {
      return bloco(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h6"/></svg>,
        titulo || "Ordem do dia",
        descricao || "Discussão e votação da matéria em pauta.",
      );
    }
    if (etapaSessao === "EXPLICACOES_PESSOAIS") {
      return bloco(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="3"/><path d="M6 21a6 6 0 0 1 12 0"/></svg>,
        titulo || "Explicações pessoais",
        descricao || "Pronunciamentos finais (até 3 minutos).",
      );
    }
    if (etapaSessao === "ENCERRAMENTO") {
      return bloco(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 12h16"/><path d="M14 6l6 6-6 6"/></svg>,
        titulo || "Encerramento",
        descricao || "Encerramento formal da sessão.",
      );
    }
    return null;
  }

  function PainelEtapaAtualPremium() {
    const titulo = etapaTitulo || "";
    const descricao = etapaDescricao || "";
    const baseTitulo = "text-5xl font-black leading-tight";
    const baseDescricao = "mt-3 text-2xl leading-relaxed";

    if (etapaSessao === "ABERTURA") {
      return (
        <div className="mt-5 rounded-3xl border border-cyan-400/30 bg-cyan-900/20 p-8">
          <p className="text-sm font-bold uppercase tracking-widest text-cyan-300">Abertura oficial</p>
          <p className={`${baseTitulo} mt-2 text-cyan-100`}>{titulo || "Declaração de abertura da sessão"}</p>
          <p className={`${baseDescricao} text-cyan-50/90`}>{descricao || "Os trabalhos legislativos estão sendo iniciados."}</p>
        </div>
      );
    }
    if (etapaSessao === "LEITURA_BIBLICA") {
      return (
        <div className="mt-5 rounded-3xl border border-amber-300/40 bg-amber-900/20 p-8">
          <div className="mb-3 text-6xl">📖</div>
          <p className={`${baseTitulo} text-amber-100`}>{titulo || "Leitura bíblica"}</p>
          <p className={`${baseDescricao} text-amber-50/90`}>{descricao || "Momento de reflexão e leitura da passagem bíblica."}</p>
          <p className="mt-5 rounded-2xl bg-amber-100/10 p-4 text-xl text-amber-100/95">Passagem em leitura pela mesa diretora</p>
        </div>
      );
    }
    if (etapaSessao === "CHAMADA_VEREADORES") {
      return (
        <div className="mt-5 rounded-3xl border border-indigo-300/40 bg-indigo-900/20 p-8">
          <p className="text-sm font-bold uppercase tracking-widest text-indigo-300">Chamada nominal</p>
          <p className={`${baseTitulo} mt-2 text-indigo-100`}>{titulo || "Registro de presença dos vereadores"}</p>
          <p className={`${baseDescricao} text-indigo-50/90`}>{descricao || "A secretaria realiza a chamada nominal para composição de presença."}</p>
        </div>
      );
    }
    if (etapaSessao === "VERIFICACAO_QUORUM") {
      return (
        <div className="mt-5 rounded-3xl border border-emerald-300/40 bg-emerald-900/20 p-8">
          <p className="text-sm font-bold uppercase tracking-widest text-emerald-300">Conferência regimental</p>
          <p className={`${baseTitulo} mt-2 text-emerald-100`}>{titulo || "Verificação de quórum"}</p>
          <p className={`${baseDescricao} text-emerald-50/90`}>{descricao || "A sessão verifica o quórum mínimo para deliberação das matérias."}</p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl bg-emerald-100/10 p-4 text-center">
              <p className="text-sm uppercase tracking-widest text-emerald-200">Presentes</p>
              <p className="mt-2 text-5xl font-black text-emerald-100">{quorum?.presentes ?? "-"}</p>
            </div>
            <div className="rounded-xl bg-emerald-100/10 p-4 text-center">
              <p className="text-sm uppercase tracking-widest text-emerald-200">Quórum</p>
              <p className="mt-2 text-3xl font-black text-emerald-100">{quorum?.quorum_atingido ? "ATINGIDO" : "AGUARDANDO"}</p>
            </div>
          </div>
        </div>
      );
    }
    if (etapaSessao === "LEITURA_EXPEDIENTE") {
      return (
        <div className="mt-5 rounded-3xl border border-slate-300/35 bg-slate-800/80 p-8">
          <p className="text-sm font-bold uppercase tracking-widest text-slate-300">Leitura do expediente</p>
          <p className={`${baseTitulo} mt-2 text-white`}>{titulo || "Expediente em leitura"}</p>
          <p className={`${baseDescricao} text-slate-200`}>{descricao || "Leitura das matérias pela mesa diretora."}</p>
          <p className="mt-5 text-lg font-semibold text-slate-300">Responsável: Secretário-geral</p>
        </div>
      );
    }
    if (etapaSessao === "PEQUENAS_COMUNICACOES") {
      return (
        <div className="mt-5 rounded-3xl border border-blue-300/40 bg-blue-900/20 p-8">
          <p className="text-sm font-bold uppercase tracking-widest text-blue-300">Pequenas comunicações</p>
          <p className={`${baseTitulo} mt-2 text-blue-100`}>{titulo || "Comunicações breves dos vereadores"}</p>
          <p className={`${baseDescricao} text-blue-50/90`}>{descricao || "Uso da palavra para comunicações objetivas (até 5 minutos)."}</p>
        </div>
      );
    }
    if (etapaSessao === "GRANDE_EXPEDIENTE") {
      return (
        <div className="mt-5 rounded-3xl border border-violet-300/40 bg-violet-900/20 p-8">
          <p className="text-sm font-bold uppercase tracking-widest text-violet-300">Grande expediente</p>
          <p className={`${baseTitulo} mt-2 text-violet-100`}>{titulo || "Pronunciamento parlamentar"}</p>
          <p className={`${baseDescricao} text-violet-50/90`}>{descricao || "Uso da palavra com tempo ampliado (até 15 minutos)."}</p>
        </div>
      );
    }
    if (etapaSessao === "ORDEM_DO_DIA") {
      return (
        <div className="mt-5 rounded-3xl border border-rose-300/40 bg-rose-900/20 p-8">
          <p className="text-sm font-bold uppercase tracking-widest text-rose-300">Ordem do dia</p>
          <p className={`${baseTitulo} mt-2 text-rose-100`}>{titulo || "Discussão e votação da matéria"}</p>
          <p className={`${baseDescricao} text-rose-50/90`}>{descricao || "Fase de discussão e votação das matérias pautadas."}</p>
        </div>
      );
    }
    if (etapaSessao === "RESULTADO") {
      return (
        <div className="mt-5 rounded-3xl border border-lime-300/40 bg-lime-900/20 p-8">
          <p className="text-sm font-bold uppercase tracking-widest text-lime-300">Resultado</p>
          <p className={`${baseTitulo} mt-2 text-lime-100`}>{titulo || "Proclamação do resultado"}</p>
          <p className={`${baseDescricao} text-lime-50/90`}>{descricao || "A presidência proclama oficialmente o resultado da votação."}</p>
        </div>
      );
    }
    if (etapaSessao === "EXPLICACOES_PESSOAIS") {
      return (
        <div className="mt-5 rounded-3xl border border-fuchsia-300/40 bg-fuchsia-900/20 p-8">
          <p className="text-sm font-bold uppercase tracking-widest text-fuchsia-300">Explicações pessoais</p>
          <p className={`${baseTitulo} mt-2 text-fuchsia-100`}>{titulo || "Pronunciamentos finais"}</p>
          <p className={`${baseDescricao} text-fuchsia-50/90`}>{descricao || "Falas finais dos vereadores (até 3 minutos)."}</p>
        </div>
      );
    }
    if (etapaSessao === "ENCERRAMENTO") {
      return (
        <div className="mt-5 rounded-3xl border border-orange-300/40 bg-orange-900/20 p-8">
          <p className="text-sm font-bold uppercase tracking-widest text-orange-300">Encerramento</p>
          <p className={`${baseTitulo} mt-2 text-orange-100`}>{titulo || "Encerramento da sessão"}</p>
          <p className={`${baseDescricao} text-orange-50/90`}>{descricao || "A presidência encerra oficialmente os trabalhos da sessão."}</p>
        </div>
      );
    }
    return (
      <div className="mt-5 rounded-3xl border border-slate-700 bg-slate-800/80 p-8">
        <p className={`${baseTitulo} text-white`}>{titulo || "Etapa da sessão"}</p>
        <p className={`${baseDescricao} text-slate-200`}>{descricao || "Aguardando atualização da etapa."}</p>
      </div>
    );
  }

  function PainelOradorAtual() {
    if (!oradorAtual?.orador) {
      return null;
    }
    if (oradorExpirado()) {
      return null;
    }
    const tempo = tempoRestanteOrador();
    const restante = segundosRestantesOrador();
    const alertaFinal = typeof restante === "number" && restante <= 10;
    const foto = oradorAtual.orador.foto_url || "";

    return (
      <div className="mb-6 rounded-2xl border border-purple-400 bg-purple-900/30 p-6 shadow-2xl">
        <p className="text-sm font-bold uppercase tracking-widest text-purple-200">
          Momento de fala
        </p>
        <div className="mt-4 grid items-center gap-6 md:grid-cols-[1fr_420px]">
          <div className="order-2 md:order-1">
            <p className="text-xl font-bold text-purple-100">
              {textoTipoFala(oradorAtual.tipo_fala)}
            </p>
            <p className="mt-1 text-2xl text-purple-100">
              Partido {oradorAtual.orador.partido || "-"} | Cadeira {oradorAtual.orador.cadeira || "-"}
            </p>
            {tempo && (
              <div
                className={`mt-4 w-fit rounded-2xl px-6 py-4 text-center ${
                  alertaFinal ? "animate-pulse bg-rose-600" : "bg-purple-700"
                }`}
              >
                <p className="text-sm font-bold uppercase tracking-widest text-purple-100">Tempo restante</p>
                <p className="mt-1 text-6xl font-black">{tempo}</p>
              </div>
            )}
          </div>
          <div className="order-1 flex items-center justify-end gap-4 md:order-2">
            <div className="text-right">
              <p className="text-5xl font-black leading-tight">{oradorAtual.orador.nome}</p>
            </div>
            {foto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={foto} alt={oradorAtual.orador.nome} className="h-52 w-52 rounded-2xl object-cover ring-4 ring-purple-300" />
            ) : (
              <div className="flex h-52 w-52 items-center justify-center rounded-2xl bg-purple-700 text-7xl font-black">
                {oradorAtual.orador.nome.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function PainelFilaOradores() {
    if (filaOradores.length === 0) return null;
    return (
      <div className="mb-8 rounded-3xl bg-slate-900 p-6 shadow-2xl">
        <p className="text-sm font-bold uppercase tracking-widest text-slate-400">
          Fila de oradores
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {filaOradores.map((item, idx) => (
            <div key={item.id} className="rounded-xl bg-slate-800 p-3">
              <b>{idx + 1}. {item.vereador.nome}</b> | {item.tipo_fala.replaceAll("_", " ")} |{" "}
              {item.vereador.partido || "-"} | Cadeira {item.vereador.cadeira || "-"}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function PainelQuorum({
    tipoMaioria,
  }: {
    tipoMaioria?: "SIMPLES" | "ABSOLUTA" | "DOIS_TERCOS";
  }) {
    const presentes = quorum?.presentes || 0;
    const ausentes = quorum?.ausentes || 9;
    const quorumAtingido = quorum?.quorum_atingido || false;
    const necessarios = votosNecessarios(tipoMaioria, presentes);

    return (
      <div className="mt-6 grid gap-4 text-xl md:grid-cols-4">
        <div className="rounded-2xl bg-slate-800 p-5">
          <span className="text-slate-400">Presentes</span>
          <div className="mt-1 text-4xl font-black">{presentes}</div>
        </div>

        <div className="rounded-2xl bg-slate-800 p-5">
          <span className="text-slate-400">Ausentes</span>
          <div className="mt-1 text-4xl font-black">{ausentes}</div>
        </div>

        <div className="rounded-2xl bg-slate-800 p-5">
          <span className="text-slate-400">Quórum</span>
          <div
            className={`mt-1 text-3xl font-black ${
              quorumAtingido ? "text-green-400" : "text-red-400"
            }`}
          >
            {quorumAtingido ? "ATINGIDO" : "INSUFICIENTE"}
          </div>
        </div>

        <div className="rounded-2xl bg-slate-800 p-5">
          <span className="text-slate-400">Votos necessários</span>
          <div className="mt-1 text-4xl font-black">{necessarios}</div>
        </div>
      </div>
    );
  }

  function ChipRealtime() {
    return (
      <div className="fixed right-6 top-4 z-50">
        <span
          className={`rounded-full px-5 py-2 text-sm font-bold shadow ${
            conectado ? "bg-green-600 text-white" : "bg-amber-600 text-white"
          }`}
        >
          {conectado ? "Realtime conectado" : "Reconectando"}
        </span>
      </div>
    );
  }

  if (loading && !votacao && !resultadoFinal) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <h1 className="text-4xl font-bold">Carregando telão...</h1>
      </main>
    );
  }

  if (resultadoFinal) {
    const votos = resultadoFinal.votacao.votos || [];

    return (
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        <ChipRealtime />
        <div className="mx-auto max-w-7xl">
          {!hasOradorAtivo() && <LinhaDoTempoSessao />}
          <PainelOradorAtual />
          <PainelFilaOradores />

          <div className="mb-8 rounded-3xl bg-slate-900 p-8 text-center shadow-2xl">
            <p className="text-xl font-bold uppercase tracking-widest text-slate-400">
              Resultado final da votação
            </p>

            <h1
              className={`mt-5 text-7xl font-black ${
                resultadoFinal.resultado === "APROVADA"
                  ? "text-green-400"
                  : resultadoFinal.resultado === "REJEITADA"
                    ? "text-red-400"
                    : resultadoFinal.resultado === "SEM_QUORUM"
                      ? "text-orange-400"
                      : "text-yellow-400"
              }`}
            >
              {resultadoFinal.resultado === "SEM_QUORUM"
                ? "SEM QUÓRUM"
                : resultadoFinal.resultado}
            </h1>

            <h2 className="mt-6 text-5xl font-black leading-tight">
              {resultadoFinal.votacao.pautas?.titulo}
            </h2>

            {resultadoFinal.votacao.pautas?.descricao && (
              <p className="mt-5 text-2xl text-slate-300">
                {resultadoFinal.votacao.pautas.descricao}
              </p>
            )}

            <div className="mt-8 grid gap-4 text-xl md:grid-cols-4">
              <div className="rounded-2xl bg-slate-800 p-5">
                <span className="text-slate-400">Ordem</span>
                <div className="mt-1 text-3xl font-bold">
                  {resultadoFinal.votacao.pautas?.numero_ordem}
                </div>
              </div>

              <div className="rounded-2xl bg-slate-800 p-5">
                <span className="text-slate-400">Sessão</span>
                <div className="mt-1 text-3xl font-bold">
                  {resultadoFinal.votacao.pautas?.sessoes?.titulo || "-"}
                </div>
              </div>

              <div className="rounded-2xl bg-slate-800 p-5">
                <span className="text-slate-400">Tipo de maioria</span>
                <div className="mt-1 text-3xl font-bold">
                  {textoTipoMaioria(
                    resultadoFinal.votacao.pautas?.tipo_maioria,
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-slate-800 p-5">
                <span className="text-slate-400">Total de votos</span>
                <div className="mt-1 text-3xl font-bold">
                  {resultadoFinal.totais.total}
                </div>
              </div>
            </div>

            <PainelQuorum
              tipoMaioria={resultadoFinal.votacao.pautas?.tipo_maioria}
            />
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-3xl bg-green-600 p-8 text-center shadow-2xl">
              <p className="text-3xl font-bold">SIM</p>
              <p className="mt-4 text-8xl font-black">
                {resultadoFinal.totais.sim}
              </p>
            </div>

            <div className="rounded-3xl bg-red-600 p-8 text-center shadow-2xl">
              <p className="text-3xl font-bold">NÃO</p>
              <p className="mt-4 text-8xl font-black">
                {resultadoFinal.totais.nao}
              </p>
            </div>

            <div className="rounded-3xl bg-yellow-500 p-8 text-center shadow-2xl">
              <p className="text-3xl font-bold">ABSTENÇÃO</p>
              <p className="mt-4 text-8xl font-black">
                {resultadoFinal.totais.abstencao}
              </p>
            </div>
          </div>

          <div className="mt-8 rounded-3xl bg-slate-900 p-8 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-3xl font-bold">Votos registrados</h2>

              <button
                onClick={carregarVotacao}
                className="rounded-xl bg-blue-600 px-5 py-3 text-lg font-bold hover:bg-blue-700"
              >
                Limpar resultado
              </button>
            </div>

            {votos.length === 0 ? (
              <p className="text-2xl text-slate-400">Nenhum voto registrado.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {votos.map((voto) => (
                  <div
                    key={voto.id}
                    className="flex items-center justify-between rounded-2xl bg-slate-800 p-5"
                  >
                    <div>
                      <p className="text-2xl font-bold">
                        {voto.vereadores?.usuarios?.nome || "Vereador"}
                      </p>
                      <p className="text-lg text-slate-400">
                        {voto.vereadores?.partido || "-"}
                      </p>
                    </div>

                    <span className="rounded-xl bg-slate-700 px-5 py-3 text-2xl font-black">
                      {textoVoto(voto.voto)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }

  if (!votacao) {
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        <ChipRealtime />
        <div className="mx-auto max-w-7xl">
          <div className="mb-5 flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/60 px-6 py-4">
            <div className="flex items-center gap-3">
              {brasaoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={brasaoUrl}
                  alt="Brasão da câmara"
                  className="h-12 w-12 object-contain"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center border border-white/20 bg-white/10 font-bold">
                  CM
                </div>
              )}
              <div>
                <h1 className="text-3xl font-black tracking-tight">{tituloSessaoAtual}</h1>
                <p className="text-sm font-semibold text-blue-200">{nomeCamara}</p>
              </div>
            </div>
          </div>
          <div className="text-left">
            {!hasOradorAtivo() && <LinhaDoTempoSessao />}
            <PainelOradorAtual />
            <PainelFilaOradores />
          </div>
        </div>
      </main>
    );
  }

  const votos = votacao.votos || [];

  const totalSim = votos.filter((voto) => voto.voto === "SIM").length;
  const totalNao = votos.filter((voto) => voto.voto === "NAO").length;
  const totalAbstencao = votos.filter(
    (voto) => voto.voto === "ABSTENCAO",
  ).length;

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <ChipRealtime />
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/60 px-6 py-4">
          <div className="flex items-center gap-3">
            {brasaoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brasaoUrl}
                alt="Brasão da câmara"
                className="h-12 w-12 object-contain"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center border border-white/20 bg-white/10 font-bold">
                CM
              </div>
            )}
            <div>
              <h1 className="text-3xl font-black tracking-tight">
                {votacao.pautas?.sessoes?.titulo || tituloSessaoAtual}
              </h1>
              <p className="text-sm font-semibold text-blue-200">{nomeCamara}</p>
            </div>
          </div>
          <span className="rounded-full bg-slate-700 px-6 py-2 text-base font-bold">
            {mensagem}
          </span>
        </div>

        {!hasOradorAtivo() && <LinhaDoTempoSessao />}
        <PainelOradorAtual />
        <PainelFilaOradores />

        <div className="mb-6 rounded-2xl bg-slate-900 p-8 shadow-2xl">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xl font-bold uppercase tracking-widest text-green-400">
                Votação em andamento
              </p>

              <h1 className="mt-4 text-6xl font-black leading-tight">
                {votacao.pautas?.titulo}
              </h1>

              <p className="mt-4 text-2xl font-bold text-blue-300">
                {textoTipoMaioria(votacao.pautas?.tipo_maioria)}
              </p>
            </div>

            <div className="rounded-3xl bg-blue-700 px-10 py-6 text-center shadow">
              <p className="text-lg font-bold uppercase tracking-widest text-blue-100">
                Tempo aberto
              </p>
              <p className="mt-2 text-7xl font-black">
                {formatarTempoAberto(votacao.aberta_em)}
              </p>
            </div>
          </div>

          {votacao.pautas?.descricao && (
            <p className="mt-5 text-2xl text-slate-300">
              {votacao.pautas.descricao}
            </p>
          )}

          <div className="mt-6 grid gap-4 text-xl md:grid-cols-3">
            <div className="rounded-2xl bg-slate-800 p-5">
              <span className="text-slate-400">Ordem</span>
                <div className="mt-1 text-4xl font-bold">
                  {votacao.pautas?.numero_ordem}
                </div>
            </div>

            <div className="rounded-2xl bg-slate-800 p-5">
              <span className="text-slate-400">Sessão</span>
                <div className="mt-1 text-4xl font-bold">
                  {votacao.pautas?.sessoes?.titulo || "-"}
                </div>
            </div>

            <div className="rounded-2xl bg-slate-800 p-5">
              <span className="text-slate-400">Total de votos</span>
              <div className="mt-1 text-4xl font-bold">{votos.length}</div>
            </div>
          </div>

          <PainelQuorum tipoMaioria={votacao.pautas?.tipo_maioria} />
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-3xl bg-green-600 p-8 text-center shadow-2xl">
            <p className="text-3xl font-bold">SIM</p>
            <p className="mt-4 text-8xl font-black">{totalSim}</p>
          </div>

          <div className="rounded-3xl bg-red-600 p-8 text-center shadow-2xl">
            <p className="text-3xl font-bold">NÃO</p>
            <p className="mt-4 text-8xl font-black">{totalNao}</p>
          </div>

          <div className="rounded-3xl bg-yellow-500 p-8 text-center text-white shadow-2xl">
            <p className="text-3xl font-bold">ABSTENÇÃO</p>
            <p className="mt-4 text-8xl font-black">{totalAbstencao}</p>
          </div>
        </div>

        <div className="mt-8 rounded-3xl bg-slate-900 p-8 shadow-2xl">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-3xl font-bold">Votos registrados</h2>

            <button
              onClick={carregarVotacao}
              className="rounded-xl bg-blue-600 px-5 py-3 text-lg font-bold hover:bg-blue-700"
            >
              Atualizar
            </button>
          </div>

          {votos.length === 0 ? (
            <p className="text-2xl text-slate-400">
              Nenhum voto registrado ainda.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {votos.map((voto) => (
                <div
                  key={voto.id}
                  className="flex items-center justify-between rounded-2xl bg-slate-800 p-5"
                >
                  <div>
                    <p className="text-2xl font-bold">
                      {voto.vereadores?.usuarios?.nome || "Vereador"}
                    </p>
                    <p className="text-lg text-slate-400">
                      {voto.vereadores?.partido || "-"}
                    </p>
                  </div>

                  <span className="rounded-xl bg-slate-700 px-5 py-3 text-2xl font-black">
                    {textoVoto(voto.voto)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}


