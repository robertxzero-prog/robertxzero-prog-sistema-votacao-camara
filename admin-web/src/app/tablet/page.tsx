"use client";

import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { api } from "@/services/api";

type UsuarioLogado = {
  id: string;
  nome: string;
  email: string;
  role: string;
  foto_url?: string | null;
  vereador?: {
    id: string;
    partido?: string;
    cadeira?: {
      numero: number;
      linha: number;
      coluna: number;
      descricao?: string | null;
    };
  } | null;
};

type Voto = {
  id: string;
  vereador_id: string;
  voto: "SIM" | "NAO" | "ABSTENCAO";
};

type VotacaoAtiva = {
  id: string;
  status: string;
  aberta_em: string;
  pautas?: {
    id: string;
    titulo: string;
    descricao?: string;
    numero_ordem: number;
    sessao_id: string;
    tipo_maioria?: string;
    sessoes?: {
      titulo: string;
    };
  };
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

type TipoFalaSessao =
  | "PEQUENAS_COMUNICACOES"
  | "GRANDE_EXPEDIENTE"
  | "ORDEM_DO_DIA"
  | "EXPLICACOES_PESSOAIS";

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

export default function TabletPage() {
  const [usuario, setUsuario] = useState<UsuarioLogado | null>(null);
  const [votacao, setVotacao] = useState<VotacaoAtiva | null>(null);
  const [quorum, setQuorum] = useState<Quorum | null>(null);

  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);

  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("Aguardando votação...");

  const [conectado, setConectado] = useState(false);

  const [agora, setAgora] = useState(new Date());

  const [presencaConfirmada, setPresencaConfirmada] = useState(false);
  const [tipoFalaPedido, setTipoFalaPedido] =
    useState<TipoFalaSessao>("PEQUENAS_COMUNICACOES");
  const [etapaSessao, setEtapaSessao] = useState<EtapaSessao>("ABERTURA");

  const tiposPermitidos = (() => {
    if (etapaSessao === "ORDEM_DO_DIA") return ["ORDEM_DO_DIA"] as TipoFalaSessao[];
    if (etapaSessao === "PEQUENAS_COMUNICACOES")
      return ["PEQUENAS_COMUNICACOES"] as TipoFalaSessao[];
    if (etapaSessao === "GRANDE_EXPEDIENTE")
      return ["GRANDE_EXPEDIENTE"] as TipoFalaSessao[];
    if (etapaSessao === "EXPLICACOES_PESSOAIS")
      return ["EXPLICACOES_PESSOAIS"] as TipoFalaSessao[];
    return [] as TipoFalaSessao[];
  })();

  async function carregarDados() {
    try {
      setLoading(true);
      setErro("");

      const [usuarioResponse, votacaoResponse] = await Promise.all([
        api.get("/auth/me"),
        api.get("/votacoes/ativa"),
      ]);

      setUsuario(usuarioResponse.data);

      setVotacao(votacaoResponse.data);

      if (votacaoResponse.data?.pautas?.sessao_id) {
        const etapaResponse = await api.get(
          `/sessoes/${votacaoResponse.data.pautas.sessao_id}/etapa`,
        );
        setEtapaSessao(
          (etapaResponse.data?.etapa as EtapaSessao) || "ABERTURA",
        );

        const quorumResponse = await api.get(
          `/presencas/${votacaoResponse.data.pautas.sessao_id}/quorum`,
        );

        setQuorum(quorumResponse.data);

        const presencasResponse = await api.get(
          `/presencas/${votacaoResponse.data.pautas.sessao_id}`,
        );

        const vereadorId = usuarioResponse.data?.vereador?.id;

        const confirmou = presencasResponse.data.some(
          (presenca: any) => presenca.vereador_id === vereadorId,
        );

        setPresencaConfirmada(confirmou);
      }
    } catch (error: any) {
      console.error(error);

      setErro(
        error?.response?.data?.message || "Erro ao carregar dados do tablet.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarDados();

    const socket: Socket = io("http://localhost:3000", {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1200,
      reconnectionDelayMax: 5000,
    });

    socket.on("connect", () => {
      setConectado(true);
      carregarDados();
    });

    socket.on("disconnect", () => {
      setConectado(false);
    });

    socket.on("votacao_atualizada", async (data: VotacaoAtiva | null) => {
      setVotacao(data);

      if (data) {
        setMensagem("Votação aberta");

        if (data.pautas?.sessao_id) {
          const etapaResponse = await api.get(
            `/sessoes/${data.pautas.sessao_id}/etapa`,
          );
          setEtapaSessao(
            (etapaResponse.data?.etapa as EtapaSessao) || "ABERTURA",
          );

          const quorumResponse = await api.get(
            `/presencas/${data.pautas.sessao_id}/quorum`,
          );

          setQuorum(quorumResponse.data);
        }
      } else {
        setEtapaSessao("ABERTURA");
        setMensagem("Aguardando votação...");
      }
    });

    socket.on("votacao_encerrada", () => {
      setVotacao(null);

      setMensagem("Votação encerrada");
    });

    socket.on("presenca_atualizada", async (data: PresencaAtualizada) => {
      setQuorum(data.quorum);
      setMensagem("Presença atualizada");

      await carregarDados();
    });

    socket.on("sessao_etapa_atualizada", (data: { etapa?: EtapaSessao }) => {
      if (data?.etapa) {
        setEtapaSessao(data.etapa);
      }
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

  useEffect(() => {
    if (tiposPermitidos.length > 0 && !tiposPermitidos.includes(tipoFalaPedido)) {
      setTipoFalaPedido(tiposPermitidos[0]);
    }
  }, [etapaSessao]);

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

  function vereadorJaVotou() {
    if (!usuario?.vereador || !votacao?.votos) {
      return false;
    }

    return votacao.votos.some(
      (voto) => voto.vereador_id === usuario.vereador?.id,
    );
  }

  function votoDoVereador() {
    if (!usuario?.vereador || !votacao?.votos) {
      return null;
    }

    return (
      votacao.votos.find((voto) => voto.vereador_id === usuario.vereador?.id) ||
      null
    );
  }

  async function confirmarPresenca() {
    if (!votacao?.pautas?.sessao_id) {
      alert("Nenhuma sessão ativa.");

      return;
    }

    try {
      setEnviando(true);

      await api.post(`/presencas/${votacao.pautas.sessao_id}/confirmar`);

      setPresencaConfirmada(true);

      await carregarDados();

      alert("Presença confirmada.");
    } catch (error: any) {
      console.error(error);

      alert(error?.response?.data?.message || "Erro ao confirmar presença.");
    } finally {
      setEnviando(false);
    }
  }

  async function registrarVoto(voto: "SIM" | "NAO" | "ABSTENCAO") {
    if (!usuario?.vereador) {
      alert("Usuário logado não é vereador.");

      return;
    }

    if (!votacao) {
      alert("Nenhuma votação aberta.");

      return;
    }

    if (!presencaConfirmada) {
      alert("Confirme sua presença antes de votar.");

      return;
    }

    if (quorum && !quorum.quorum_atingido) {
      alert("Quórum mínimo ainda não foi atingido.");

      return;
    }

    if (vereadorJaVotou()) {
      alert("Você já votou nesta votação.");

      return;
    }

    try {
      setEnviando(true);

      await api.post(`/votacoes/${votacao.id}/votar`, {
        voto,
      });

      setMensagem("Voto registrado com sucesso.");

      await carregarDados();
    } catch (error: any) {
      console.error(error);

      alert(error?.response?.data?.message || "Erro ao registrar voto.");
    } finally {
      setEnviando(false);
    }
  }

  async function solicitarFala() {
    if (!votacao?.pautas?.sessao_id) {
      alert("Nenhuma sessão ativa.");
      return;
    }
    if (!tiposPermitidos.includes(tipoFalaPedido)) {
      alert("Este tipo de fala não está liberado para a etapa atual.");
      return;
    }
    try {
      setEnviando(true);
      const response = await api.post(
        `/sessoes/${votacao.pautas.sessao_id}/fila-oradores/solicitar`,
        { tipo_fala: tipoFalaPedido },
      );
      alert(response.data?.mensagem || "Pedido de fala enviado.");
    } catch (error: any) {
      console.error(error);
      alert(error?.response?.data?.message || "Erro ao solicitar fala.");
    } finally {
      setEnviando(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <h1 className="text-4xl font-bold">Carregando tablet...</h1>
      </main>
    );
  }

  const jaVotou = vereadorJaVotou();

  const votoRegistrado = votoDoVereador();

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-48px)] max-w-5xl flex-col">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-slate-900 p-6 shadow">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-slate-400">
              Tablet do Vereador
            </p>

            <h1 className="mt-1 text-3xl font-black">{usuario?.nome}</h1>

            <p className="mt-1 text-lg text-slate-300">
              Partido: {usuario?.vereador?.partido || "-"} | Cadeira:{" "}
              {usuario?.vereador?.cadeira?.numero || "-"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {votacao && (
              <div className="rounded-full bg-blue-700 px-5 py-2 text-sm font-bold">
                Tempo: {formatarTempoAberto(votacao.aberta_em)}
              </div>
            )}

            <div
              className={`rounded-full px-5 py-2 text-sm font-bold ${
                conectado ? "bg-green-600" : "bg-red-600"
              }`}
            >
              {conectado ? "Online" : "Reconectando"}
            </div>
          </div>
        </header>

        <p className="mb-4 text-sm text-slate-400">{mensagem}</p>

        {!votacao ? (
          <section className="flex flex-1 items-center justify-center rounded-3xl bg-slate-900 p-8 text-center shadow">
            <div>
              <p className="text-2xl font-bold text-yellow-400">{mensagem}</p>

              <h2 className="mt-4 text-5xl font-black">
                Nenhuma votação aberta
              </h2>
            </div>
          </section>
        ) : (
          <section className="flex flex-1 flex-col rounded-3xl bg-slate-900 p-8 shadow">
            <div className="mb-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-lg font-bold uppercase tracking-widest text-green-400">
                    Votação aberta
                  </p>

                  <h2 className="mt-3 text-5xl font-black leading-tight">
                    {votacao.pautas?.titulo}
                  </h2>
                </div>

                {!presencaConfirmada ? (
                  <button
                    disabled={enviando || !tiposPermitidos.includes(tipoFalaPedido)}
                    onClick={confirmarPresenca}
                    className="rounded-2xl bg-blue-600 px-6 py-4 text-xl font-bold hover:bg-blue-700 disabled:opacity-60"
                  >
                    Confirmar presença
                  </button>
                ) : (
                  <div className="rounded-2xl bg-green-700 px-6 py-4 text-xl font-bold">
                    Presença confirmada
                  </div>
                )}
              </div>

              {votacao.pautas?.descricao && (
                <p className="mt-5 text-2xl text-slate-300">
                  {votacao.pautas.descricao}
                </p>
              )}

              <div className="mt-6 grid gap-4 text-lg md:grid-cols-5">
                <div className="rounded-2xl bg-slate-800 p-4">
                  <p className="text-slate-400">Ordem</p>

                  <p className="text-3xl font-bold">
                    {votacao.pautas?.numero_ordem}
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-800 p-4">
                  <p className="text-slate-400">Sessão</p>

                  <p className="text-3xl font-bold">
                    {votacao.pautas?.sessoes?.titulo}
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-800 p-4">
                  <p className="text-slate-400">Tempo</p>

                  <p className="text-3xl font-bold">
                    {formatarTempoAberto(votacao.aberta_em)}
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-800 p-4">
                  <p className="text-slate-400">Presentes</p>

                  <p className="text-3xl font-bold">{quorum?.presentes || 0}</p>
                </div>

                <div className="rounded-2xl bg-slate-800 p-4">
                  <p className="text-slate-400">Quórum</p>

                  <p
                    className={`text-3xl font-bold ${
                      quorum?.quorum_atingido
                        ? "text-green-400"
                        : "text-red-400"
                    }`}
                  >
                    {quorum?.quorum_atingido ? "OK" : "INSUFICIENTE"}
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-2xl bg-slate-800 p-4">
                <p className="text-sm font-bold uppercase tracking-widest text-purple-300">
                  Pedido de fala
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  Etapa atual: <b>{etapaSessao}</b>
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <select
                    value={tipoFalaPedido}
                    onChange={(e) =>
                      setTipoFalaPedido(e.target.value as TipoFalaSessao)
                    }
                    className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-white"
                  >
                    <option value="PEQUENAS_COMUNICACOES" disabled={!tiposPermitidos.includes("PEQUENAS_COMUNICACOES")}>Pequenas comunicações</option>
                    <option value="GRANDE_EXPEDIENTE" disabled={!tiposPermitidos.includes("GRANDE_EXPEDIENTE")}>Grande expediente</option>
                    <option value="ORDEM_DO_DIA" disabled={!tiposPermitidos.includes("ORDEM_DO_DIA")}>Ordem do dia / votação</option>
                    <option value="EXPLICACOES_PESSOAIS" disabled={!tiposPermitidos.includes("EXPLICACOES_PESSOAIS")}>Explicações pessoais</option>
                  </select>
                  <button
                    disabled={enviando}
                    onClick={solicitarFala}
                    className="rounded-lg bg-purple-700 px-4 py-2 font-bold text-white hover:bg-purple-800 disabled:opacity-60"
                  >
                    Pedir fala
                  </button>
                </div>
              </div>
            </div>

            {jaVotou ? (
              <div className="flex flex-1 items-center justify-center rounded-3xl bg-green-950 p-8 text-center">
                <div>
                  <p className="text-3xl font-bold text-green-300">
                    Voto registrado
                  </p>

                  <h3 className="mt-4 text-6xl font-black">
                    {votoRegistrado?.voto === "NAO"
                      ? "NÃO"
                      : votoRegistrado?.voto === "ABSTENCAO"
                        ? "ABSTENÇÃO"
                        : votoRegistrado?.voto}
                  </h3>
                </div>
              </div>
            ) : (
              <div className="grid flex-1 gap-5 md:grid-cols-3">
                <button
                  disabled={
                    enviando || !presencaConfirmada || !quorum?.quorum_atingido
                  }
                  onClick={() => registrarVoto("SIM")}
                  className="rounded-3xl bg-green-600 p-10 text-5xl font-black shadow hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  SIM
                </button>

                <button
                  disabled={
                    enviando || !presencaConfirmada || !quorum?.quorum_atingido
                  }
                  onClick={() => registrarVoto("NAO")}
                  className="rounded-3xl bg-red-600 p-10 text-5xl font-black shadow hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  NÃO
                </button>

                <button
                  disabled={
                    enviando || !presencaConfirmada || !quorum?.quorum_atingido
                  }
                  onClick={() => registrarVoto("ABSTENCAO")}
                  className="rounded-3xl bg-yellow-500 p-10 text-5xl font-black shadow hover:bg-yellow-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  ABSTER
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
