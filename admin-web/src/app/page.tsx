"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { api } from "@/services/api";

type OnboardingStatus = {
  onboarding_status?: string;
  licenca_status?: string;
  liberado_login?: boolean;
};

const supportEmail = "robertxzero@gmail.com";
const supportPhone = "096991118360";
const supportPhoneDisplay = "(96) 99111-8360";
const supportWhatsappUrl = "https://wa.me/5596991118360";
const appVersion = "v0.1.0";

export default function Home() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [requires2fa, setRequires2fa] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [modoRecuperacao, setModoRecuperacao] = useState(false);
  const [codigoRecuperacao, setCodigoRecuperacao] = useState("");
  const [novaSenhaRecuperacao, setNovaSenhaRecuperacao] = useState("");
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [mostrarSplash, setMostrarSplash] = useState(true);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [temaEscuro, setTemaEscuro] = useState(false);
  const [suporteAberto, setSuporteAberto] = useState(false);

  const [codigoInstancia, setCodigoInstancia] = useState("");
  const [nomeOficial, setNomeOficial] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [responsavelNome, setResponsavelNome] = useState("");
  const [responsavelEmail, setResponsavelEmail] = useState("");
  const [responsavelTelefone, setResponsavelTelefone] = useState("");
  const [forcarCadastro, setForcarCadastro] = useState(false);

  async function carregarStatus() {
    try {
      setLoadingStatus(true);
      const response = await api.get("/configuracao/onboarding/status");
      const status = response.data || null;
      setOnboarding(status);
      setBackendOnline(true);

      try {
        const camara = await api.get("/configuracao/camara");
        const config = camara?.data?.config || {};
        setCodigoInstancia(config.codigo_instancia || "");
        setNomeOficial(config.nome_oficial || "");
        setCidade(config.cidade || "");
        setUf(config.uf || "");
        setResponsavelNome(config.onboarding_responsavel_nome || "");
        setResponsavelEmail(config.onboarding_responsavel_email || "");
        setResponsavelTelefone(config.onboarding_responsavel_telefone || "");
      } catch {
        // Mantem o fluxo principal mesmo sem detalhes adicionais da câmara.
      }

      if (status?.liberado_login === true) {
        setForcarCadastro(false);
      }
    } catch {
      setOnboarding(null);
      setBackendOnline(false);
    } finally {
      setLoadingStatus(false);
    }
  }

  async function solicitarPrimeiroAcesso(event: React.FormEvent) {
    event.preventDefault();
    setErro("");
    setCarregando(true);

    try {
      await api.post("/configuracao/onboarding/solicitar", {
        codigo_instancia: codigoInstancia,
        nome_oficial: nomeOficial,
        cidade: cidade || null,
        uf: uf || null,
        responsavel_nome: responsavelNome,
        responsavel_email: responsavelEmail,
        responsavel_telefone: responsavelTelefone || null,
      });
      await carregarStatus();
      setForcarCadastro(false);
      setErro(
        "Solicitação enviada. Aguarde aprovação/ativação no painel SaaS Master.",
      );
    } catch (error: any) {
      setErro(
        error?.response?.data?.mensagem ||
          "Não foi possível enviar a solicitação de primeiro acesso.",
      );
    } finally {
      setCarregando(false);
    }
  }

  async function fazerLogin(event: React.FormEvent) {
    event.preventDefault();
    setErro("");
    setCarregando(true);

    try {
      const response = await api.post("/auth/login", {
        email,
        senha,
        twoFactorCode: requires2fa ? twoFactorCode : undefined,
        deviceName: "Admin Web",
      });

      if (response.data?.requires_2fa) {
        setRequires2fa(true);
        setErro("Informe o código 2FA para continuar.");
        return;
      }

      localStorage.setItem("token", response.data.token);
      localStorage.setItem("usuario", JSON.stringify(response.data.usuario));
      router.push("/controle-da-sessao");
    } catch (error: any) {
      setErro(error?.response?.data?.message || "E-mail ou senha inválidos");
    } finally {
      setCarregando(false);
    }
  }

  async function solicitarCodigoRecuperacao(event: React.FormEvent) {
    event.preventDefault();
    setErro("");
    setCarregando(true);

    try {
      const emailDestino = (email || "admin@camara.local").trim();
      const response = await api.post("/auth/forgot-password", {
        email: emailDestino,
      });
      setErro(
        response?.data?.message ||
          "Se o e-mail existir, enviaremos um código de recuperação.",
      );
    } catch (error: any) {
      setErro(
        error?.response?.data?.message ||
          "Não foi possível solicitar o código.",
      );
    } finally {
      setCarregando(false);
    }
  }

  async function redefinirSenha(event: React.FormEvent) {
    event.preventDefault();
    setErro("");
    setCarregando(true);

    try {
      const emailDestino = (email || "admin@camara.local").trim();
      const response = await api.post("/auth/reset-password", {
        email: emailDestino,
        codigo: codigoRecuperacao,
        novaSenha: novaSenhaRecuperacao,
      });
      setErro(response?.data?.message || "Senha redefinida com sucesso.");
      setModoRecuperacao(false);
      setSenha("");
      setCodigoRecuperacao("");
      setNovaSenhaRecuperacao("");
    } catch (error: any) {
      setErro(
        error?.response?.data?.message || "Não foi possível redefinir a senha.",
      );
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarStatus();

    const splashTimer = window.setTimeout(() => setMostrarSplash(false), 900);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const aplicarTema = () => setTemaEscuro(media.matches);
    aplicarTema();
    media.addEventListener("change", aplicarTema);

    return () => {
      window.clearTimeout(splashTimer);
      media.removeEventListener("change", aplicarTema);
    };
  }, []);

  const liberarLogin = onboarding?.liberado_login === true;
  const onboardingSolicitado =
    onboarding?.onboarding_status === "SOLICITADO" ||
    onboarding?.onboarding_status === "APROVADO" ||
    onboarding?.licenca_status === "ATIVA";
  const mostrarTelaSolicitado = onboardingSolicitado && !forcarCadastro;
  const exibirSplash = mostrarSplash || loadingStatus;
  const nomeCamaraAtiva = nomeOficial || "Câmara Municipal";
  const ambienteLabel =
    process.env.NODE_ENV === "production" ? "Produção" : "Local";

  const inputClass =
    "login-input rounded-[16px] border border-[#d9e3f0] bg-white px-4 py-3.5 text-base font-semibold text-[#101828] shadow-[0_1px_0_rgba(15,23,42,0.03)] outline-none transition placeholder:text-slate-400 focus:border-[#0f5fc7] focus:bg-white focus:ring-4 focus:ring-[#d9e9ff]";

  if (exibirSplash) {
    return (
      <main
        className={`relative flex min-h-screen items-center justify-center overflow-hidden px-6 ${
          temaEscuro ? "bg-[#071326]" : "bg-[#e9edf4]"
        }`}
      >
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(13,31,77,0.12),transparent_34%),linear-gradient(315deg,rgba(20,154,139,0.14),transparent_38%)]" />
        <div className="splash-card relative flex w-full max-w-[520px] flex-col items-center rounded-[30px] border border-white/25 bg-white/90 px-8 py-10 text-center shadow-[0_28px_80px_rgba(15,23,42,0.22)] backdrop-blur">
          <Image
            src="/silcam-logo.png"
            alt="SILCAM"
            width={1515}
            height={607}
            className="h-auto w-full max-w-[360px] object-contain"
            priority
          />
          <div className="mt-7 h-2 w-44 overflow-hidden rounded-full bg-slate-200">
            <div className="status-loader h-full w-1/2 rounded-full bg-[#1264d8]" />
          </div>
          <p className="mt-5 text-sm font-black uppercase tracking-[0.18em] text-slate-600">
            Verificando ambiente seguro
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-8 ${
        temaEscuro ? "bg-[#071326] text-white" : "bg-[#e9edf4] text-slate-950"
      }`}
    >
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(13,31,77,0.08),transparent_34%),linear-gradient(315deg,rgba(20,154,139,0.10),transparent_38%)]" />
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#149a8b] via-[#1f6eea] to-[#f0b429]" />

      <div className="relative mx-auto grid min-h-[calc(100vh-48px)] w-full max-w-[1440px] items-center gap-5 pb-24 lg:grid-cols-[1.05fr_0.95fr] lg:pb-10">
        <section className="login-panel login-panel-left relative min-h-[520px] overflow-hidden rounded-[28px] border border-white/20 bg-[#0b2455] px-7 py-7 text-white shadow-[0_28px_80px_rgba(15,23,42,0.24)] sm:px-10 lg:min-h-[660px]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(20,154,139,0.26),transparent_32%),linear-gradient(135deg,rgba(16,44,103,0.96),rgba(7,28,66,0.98)_52%,rgba(13,78,92,0.92))]" />
          <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(255,255,255,0.28)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.26)_1px,transparent_1px)] [background-size:42px_42px]" />

          <div className="relative flex h-full flex-col">
            <div className="logo-reveal mx-auto flex w-full max-w-[620px] justify-center pt-2">
              <Image
                src="/silcam-logo.png"
                alt="SILCAM"
                width={1515}
                height={607}
                className="h-auto w-full max-w-[560px] object-contain drop-shadow-[0_20px_28px_rgba(0,0,0,0.25)]"
                priority
              />
            </div>

            <div className="content-reveal mt-8 max-w-[720px]">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-cyan-50 shadow-sm backdrop-blur">
                Câmara digital segura
              </span>
              <h1 className="mt-5 max-w-[760px] text-[42px] font-black leading-[0.98] text-white sm:text-[56px] xl:text-[66px]">
                Gestão legislativa com presença, voto e ata em tempo real.
              </h1>
              <p className="mt-5 max-w-[660px] text-lg leading-relaxed text-blue-50/90 sm:text-xl">
                Painel administrativo para sessões, pautas, votações, atas e
                relatórios oficiais da casa legislativa.
              </p>
            </div>

            <div className="metrics-reveal mt-8 flex flex-wrap gap-3">
              <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold text-blue-50 backdrop-blur">
                Sessao online
              </span>
              <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold text-blue-50 backdrop-blur">
                Licença {liberarLogin ? "ativa" : "pendente"}
              </span>
              <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold text-blue-50 backdrop-blur">
                API {backendOnline ? "online" : "offline"}
              </span>
            </div>
          </div>
        </section>

        <section className="login-panel login-panel-right relative overflow-hidden rounded-[28px] border border-white/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-5 shadow-[0_28px_80px_rgba(15,23,42,0.14)] backdrop-blur sm:p-7 xl:p-8">
          {loadingStatus ? (
            <div className="flex min-h-[520px] flex-col justify-center">
              <div className="h-2 w-40 overflow-hidden rounded-full bg-slate-200">
                <div className="status-loader h-full w-1/2 rounded-full bg-[#1f6eea]" />
              </div>
              <p className="mt-5 text-lg font-bold text-slate-700">
                Verificando ativação...
              </p>
            </div>
          ) : liberarLogin ? (
            <div className="form-reveal flex min-h-[520px] flex-col justify-start">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="inline-flex rounded-full border border-[#bfe7dc] bg-[#eefbf7] px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-[#0b6b57]">
                    Acesso liberado
                  </span>
                  <h2 className="mt-4 text-[34px] font-black leading-[0.96] text-[#07142f] sm:text-[42px] xl:text-[48px]">
                    {modoRecuperacao
                      ? "Recuperar senha"
                      : "Acesso administrativo"}
                  </h2>
                  <p className="mt-3 max-w-[520px] border-l-2 border-[#b6c7dc] pl-3 text-[13px] font-black uppercase tracking-[0.16em] text-[#4a5d75]">
                    {nomeCamaraAtiva}
                  </p>
                </div>
                <div className="inline-flex rounded-full border border-[#d8dee8] bg-[#f7f9fc] px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-[#36445a] shadow-sm">
                  Ambiente {ambienteLabel}
                </div>
              </div>

              <p className="mt-4 text-base leading-relaxed text-[#526174]">
                {modoRecuperacao
                  ? "Solicite o código e redefina a senha do administrador."
                  : "Entre com suas credenciais para continuar."}
              </p>

              <div className="mt-6 min-h-[420px]">
                {!modoRecuperacao ? (
                  <form onSubmit={fazerLogin} className="flex flex-col gap-4">
                    <input
                      type="email"
                      placeholder="E-mail"
                      className={inputClass}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />

                    <input
                      type="password"
                      placeholder="Senha"
                      className={inputClass}
                      value={senha}
                      onChange={(event) => setSenha(event.target.value)}
                    />

                    {requires2fa && (
                      <input
                        type="text"
                        placeholder="Código 2FA (6 dígitos)"
                        className={inputClass}
                        value={twoFactorCode}
                        onChange={(event) =>
                          setTwoFactorCode(event.target.value)
                        }
                      />
                    )}

                    {erro && (
                      <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-center text-sm font-bold text-red-700">
                        {erro}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={carregando}
                      className="group mt-2 rounded-[18px] bg-[linear-gradient(135deg,#0b2f6f_0%,#115fc9_100%)] px-5 py-4 text-[28px] font-black text-white shadow-[0_18px_34px_rgba(11,47,111,0.25)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_42px_rgba(11,47,111,0.32)] disabled:translate-y-0 disabled:from-blue-300 disabled:to-blue-300 sm:text-[34px]"
                    >
                      <span className="inline-flex items-center gap-3">
                        {carregando ? "Entrando..." : "Entrar"}
                        <span className="text-3xl transition group-hover:translate-x-1">
                          &rarr;
                        </span>
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setModoRecuperacao(true);
                        setErro("");
                      }}
                      className="mt-1 text-base font-bold text-[#164f9e] transition hover:text-[#07142f]"
                    >
                      Esqueci minha senha
                    </button>
                  </form>
                ) : (
                  <div className="flex flex-col gap-3">
                    <form
                      onSubmit={solicitarCodigoRecuperacao}
                      className="flex flex-col gap-2"
                    >
                      <button
                        type="submit"
                        disabled={carregando}
                        className="rounded-[18px] bg-slate-900 px-4 py-3 text-base font-bold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:translate-y-0 disabled:bg-slate-400"
                      >
                        {carregando ? "Solicitando..." : "Solicitar código"}
                      </button>
                    </form>

                    <form
                      onSubmit={redefinirSenha}
                      className="flex flex-col gap-3"
                    >
                      <input
                        type="text"
                        placeholder="Código de recuperação"
                        className={inputClass}
                        value={codigoRecuperacao}
                        onChange={(event) =>
                          setCodigoRecuperacao(event.target.value)
                        }
                      />
                      <input
                        type="password"
                        placeholder="Nova senha"
                        className={inputClass}
                        value={novaSenhaRecuperacao}
                        onChange={(event) =>
                          setNovaSenhaRecuperacao(event.target.value)
                        }
                      />
                      <button
                        type="submit"
                        disabled={carregando}
                        className="rounded-[18px] bg-[#1264d8] px-4 py-3 text-lg font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-[#0b55bd] disabled:translate-y-0 disabled:bg-blue-300"
                      >
                        {carregando ? "Redefinindo..." : "Redefinir senha"}
                      </button>
                    </form>

                    <button
                      type="button"
                      onClick={() => {
                        setModoRecuperacao(false);
                        setCodigoRecuperacao("");
                        setNovaSenhaRecuperacao("");
                        setErro("");
                      }}
                      className="text-base font-bold text-slate-600 transition hover:text-slate-950"
                    >
                      Voltar para login
                    </button>

                    {erro && (
                      <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-center text-sm font-bold text-red-700">
                        {erro}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : mostrarTelaSolicitado ? (
            <div className="form-reveal flex min-h-[520px] flex-col justify-center">
              <span className="inline-flex w-fit rounded-full bg-amber-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-amber-700">
                Em análise
              </span>
              <h2 className="mt-4 text-[36px] font-black leading-none text-slate-950 sm:text-[44px]">
                Solicitação em análise
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-700">
                O primeiro acesso já foi solicitado. Aguarde a ativação no
                painel SaaS Master para liberar o login da câmara.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <button
                  onClick={carregarStatus}
                  className="rounded-[18px] bg-slate-900 px-5 py-3 text-base font-bold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-800"
                >
                  Atualizar status
                </button>
                <button
                  onClick={() => {
                    setErro("");
                    setForcarCadastro(true);
                  }}
                  className="rounded-[18px] border border-slate-200 bg-white px-5 py-3 text-base font-bold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
                >
                  Editar dados
                </button>
              </div>
              {erro && (
                <p className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
                  {erro}
                </p>
              )}
            </div>
          ) : (
            <div className="form-reveal">
              <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-blue-700">
                Primeiro acesso
              </span>
              <h2 className="mt-4 text-[34px] font-black leading-none text-slate-950 sm:text-[42px]">
                Cadastro da câmara
              </h2>
              <p className="mt-3 text-base leading-relaxed text-slate-600">
                Cadastre a câmara para vincular automaticamente ao SaaS.
              </p>

              <form
                onSubmit={solicitarPrimeiroAcesso}
                className="mt-5 flex flex-col gap-3"
              >
                <input
                  value={codigoInstancia}
                  onChange={(e) => setCodigoInstancia(e.target.value)}
                  placeholder="Código da instância"
                  className={inputClass}
                  required
                />
                <input
                  value={nomeOficial}
                  onChange={(e) => setNomeOficial(e.target.value)}
                  placeholder="Nome oficial da câmara"
                  className={inputClass}
                  required
                />
                <div className="grid grid-cols-3 gap-3">
                  <input
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                    placeholder="Cidade"
                    className={`${inputClass} col-span-2`}
                    required
                  />
                  <input
                    value={uf}
                    onChange={(e) => setUf(e.target.value.toUpperCase())}
                    placeholder="UF"
                    maxLength={2}
                    className={inputClass}
                    required
                  />
                </div>
                <input
                  value={responsavelNome}
                  onChange={(e) => setResponsavelNome(e.target.value)}
                  placeholder="Nome do responsável"
                  className={inputClass}
                  required
                />
                <input
                  type="email"
                  value={responsavelEmail}
                  onChange={(e) => setResponsavelEmail(e.target.value)}
                  placeholder="E-mail do responsável"
                  className={inputClass}
                  required
                />
                <input
                  value={responsavelTelefone}
                  onChange={(e) => setResponsavelTelefone(e.target.value)}
                  placeholder="Telefone"
                  className={inputClass}
                />
                {erro && (
                  <p className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
                    {erro}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={carregando}
                  className="rounded-[18px] bg-[#1264d8] p-3.5 text-lg font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-[#0b55bd] disabled:translate-y-0 disabled:bg-blue-300"
                >
                  {carregando ? "Enviando..." : "Solicitar ativação"}
                </button>
              </form>
            </div>
          )}
        </section>
      </div>

      <div className="support-card fixed bottom-4 left-4 z-20">
        {suporteAberto && (
          <aside className="support-popover mb-3 w-[calc(100vw-32px)] max-w-[320px] rounded-[22px] border border-white/80 bg-white/92 p-4 text-slate-800 shadow-[0_18px_50px_rgba(15,23,42,0.18)] backdrop-blur-md">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#1264d8]">
              Suporte SILCAM
            </p>
            <div className="mt-2 grid gap-1 text-sm font-semibold">
              <a
                href={`mailto:${supportEmail}`}
                className="truncate text-slate-700 transition hover:text-[#0b55bd]"
              >
                {supportEmail}
              </a>
              <a
                href={`tel:${supportPhone}`}
                className="text-slate-700 transition hover:text-[#0b55bd]"
              >
                {supportPhoneDisplay}
              </a>
              <a
                href={supportWhatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex w-fit rounded-full bg-emerald-600 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-white shadow-sm transition hover:bg-emerald-700"
              >
                Abrir WhatsApp
              </a>
              <p className="mt-3 border-t border-slate-200 pt-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                SILCAM {appVersion} · {ambienteLabel} · API{" "}
                {backendOnline ? "online" : "offline"}
              </p>
            </div>
          </aside>
        )}

        <button
          type="button"
          aria-expanded={suporteAberto}
          aria-label={suporteAberto ? "Fechar suporte" : "Abrir suporte"}
          onClick={() => setSuporteAberto((valor) => !valor)}
          className="group flex h-14 w-14 items-center justify-center rounded-full bg-[#1264d8] text-white shadow-[0_16px_34px_rgba(18,100,216,0.34)] transition hover:-translate-y-0.5 hover:bg-[#0b55bd]"
        >
          {suporteAberto ? (
            <span className="text-2xl font-black leading-none">×</span>
          ) : (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-7 w-7"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.2"
            >
              <path d="M4 12a8 8 0 0 1 16 0" />
              <path d="M4 12v3a2 2 0 0 0 2 2h1v-7H6a2 2 0 0 0-2 2Z" />
              <path d="M20 12v3a2 2 0 0 1-2 2h-1v-7h1a2 2 0 0 1 2 2Z" />
              <path d="M16 19c-1 1-2.3 1.5-4 1.5" />
            </svg>
          )}
        </button>
      </div>
    </main>
  );
}


