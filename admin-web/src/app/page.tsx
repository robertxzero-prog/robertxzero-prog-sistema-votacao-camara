'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { api } from '@/services/api';

type OnboardingStatus = {
  onboarding_status?: string;
  licenca_status?: string;
  liberado_login?: boolean;
};

export default function Home() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [requires2fa, setRequires2fa] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [modoRecuperacao, setModoRecuperacao] = useState(false);
  const [emailRecuperacao, setEmailRecuperacao] = useState('');
  const [codigoRecuperacao, setCodigoRecuperacao] = useState('');
  const [novaSenhaRecuperacao, setNovaSenhaRecuperacao] = useState('');
  const [codigoTesteRecuperacao, setCodigoTesteRecuperacao] = useState('');
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const [codigoInstancia, setCodigoInstancia] = useState('');
  const [nomeOficial, setNomeOficial] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');
  const [responsavelNome, setResponsavelNome] = useState('');
  const [responsavelEmail, setResponsavelEmail] = useState('');
  const [responsavelTelefone, setResponsavelTelefone] = useState('');
  const [forcarCadastro, setForcarCadastro] = useState(false);

  async function carregarStatus() {
    try {
      setLoadingStatus(true);
      const response = await api.get('/configuracao/onboarding/status');
      const status = response.data || null;
      setOnboarding(status);

      try {
        const camara = await api.get('/configuracao/camara');
        const config = camara?.data?.config || {};
        setCodigoInstancia(config.codigo_instancia || '');
        setNomeOficial(config.nome_oficial || '');
        setCidade(config.cidade || '');
        setUf(config.uf || '');
        setResponsavelNome(config.onboarding_responsavel_nome || '');
        setResponsavelEmail(config.onboarding_responsavel_email || '');
        setResponsavelTelefone(config.onboarding_responsavel_telefone || '');
      } catch {
        // Sem dados detalhados, mantém o fluxo normal.
      }

      if (status?.liberado_login === true) {
        setForcarCadastro(false);
      }
    } catch {
      setOnboarding(null);
    } finally {
      setLoadingStatus(false);
    }
  }

  async function solicitarPrimeiroAcesso(event: React.FormEvent) {
    event.preventDefault();
    setErro('');
    setCarregando(true);

    try {
      await api.post('/configuracao/onboarding/solicitar', {
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
      setErro('Solicitação enviada. Aguarde aprovação/ativação no painel SaaS Master.');
    } catch (error: any) {
      setErro(
        error?.response?.data?.mensagem ||
          'Não foi possível enviar a solicitação de primeiro acesso.',
      );
    } finally {
      setCarregando(false);
    }
  }

  async function fazerLogin(event: React.FormEvent) {
    event.preventDefault();
    setErro('');
    setCarregando(true);

    try {
      const response = await api.post('/auth/login', {
        email,
        senha,
        twoFactorCode: requires2fa ? twoFactorCode : undefined,
        deviceName: 'Admin Web',
      });

      if (response.data?.requires_2fa) {
        setRequires2fa(true);
        setErro('Informe o código 2FA para continuar.');
        return;
      }

      localStorage.setItem('token', response.data.token);
      localStorage.setItem('usuario', JSON.stringify(response.data.usuario));
      router.push('/dashboard');
    } catch (error: any) {
      setErro(error?.response?.data?.message || 'E-mail ou senha inválidos');
    } finally {
      setCarregando(false);
    }
  }

  async function solicitarCodigoRecuperacao(event: React.FormEvent) {
    event.preventDefault();
    setErro('');
    setCodigoTesteRecuperacao('');
    setCarregando(true);

    try {
      const response = await api.post('/auth/forgot-password', {
        email: emailRecuperacao,
      });
      if (response?.data?.codigo_teste) {
        setCodigoTesteRecuperacao(response.data.codigo_teste);
      }
      setErro(
        response?.data?.message || 'Se o e-mail existir, enviaremos um código de recuperação.',
      );
    } catch (error: any) {
      setErro(error?.response?.data?.message || 'Não foi possível solicitar o código.');
    } finally {
      setCarregando(false);
    }
  }

  async function redefinirSenha(event: React.FormEvent) {
    event.preventDefault();
    setErro('');
    setCarregando(true);

    try {
      const response = await api.post('/auth/reset-password', {
        email: emailRecuperacao,
        codigo: codigoRecuperacao,
        novaSenha: novaSenhaRecuperacao,
      });
      setErro(response?.data?.message || 'Senha redefinida com sucesso.');
      setModoRecuperacao(false);
      setSenha('');
      setCodigoRecuperacao('');
      setNovaSenhaRecuperacao('');
      setCodigoTesteRecuperacao('');
    } catch (error: any) {
      setErro(error?.response?.data?.message || 'Não foi possível redefinir a senha.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarStatus();
  }, []);

  const liberarLogin = onboarding?.liberado_login === true;
  const onboardingSolicitado =
    onboarding?.onboarding_status === 'SOLICITADO' ||
    onboarding?.onboarding_status === 'APROVADO' ||
    onboarding?.licenca_status === 'ATIVA';
  const mostrarTelaSolicitado = onboardingSolicitado && !forcarCadastro;

  return (
    <main className="min-h-screen bg-slate-200 px-4 pb-6 pt-[12vh] lg:pt-[10vh]">
      <div className="mx-auto grid w-full max-w-[1366px] items-stretch gap-5 xl:gap-6 2xl:max-w-[1500px] lg:grid-cols-[1fr_1fr]">
        <section className="relative flex min-h-[470px] flex-col justify-center overflow-hidden rounded-[28px] border border-blue-800/30 bg-gradient-to-br from-blue-900 via-blue-950 to-slate-950 px-7 py-7 text-white shadow-2xl xl:min-h-[495px]">
          <div className="pointer-events-none absolute -left-20 -top-16 h-72 w-72 rounded-full bg-emerald-500/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -right-12 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative mx-auto w-full max-w-[660px] text-center">
            <div className="mx-auto mb-6 flex w-full max-w-[700px] justify-center">
              <Image
                src="/silcam-logo.png"
                alt="SILCAM"
                width={1515}
                height={607}
                className="h-auto max-h-[250px] w-full object-contain xl:max-h-[275px]"
                priority
              />
            </div>

            <p className="mx-auto max-w-[700px] text-[20px] leading-snug text-blue-100/95 xl:text-[22px]">
              Painel administrativo para sessões, pautas, votações, atas e relatórios
              oficiais da casa legislativa.
            </p>
          </div>
        </section>

        <section className="w-full min-h-[470px] rounded-[28px] border border-slate-200 bg-white p-7 shadow-xl xl:min-h-[495px] xl:p-8">
          {loadingStatus ? (
            <p className="font-semibold text-slate-700">Verificando ativação...</p>
          ) : liberarLogin ? (
            <div className="flex h-full flex-col justify-center">
              <h2 className="text-[48px] font-black leading-[0.95] text-slate-900 lg:text-[52px] xl:text-[60px]">
                {modoRecuperacao ? 'Recuperar senha' : 'Acesso administrativo'}
              </h2>
              <p className="mt-3 text-[22px] text-slate-600 xl:text-2xl">
                {modoRecuperacao
                  ? 'Solicite o código e redefina a senha do administrador.'
                  : 'Entre com suas credenciais para continuar.'}
              </p>

              {!modoRecuperacao ? (
                <form onSubmit={fazerLogin} className="mt-7 flex flex-col gap-4">
                  <input
                    type="email"
                    placeholder="E-mail"
                    className="rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3.5 text-[28px] text-slate-800 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />

                  <input
                    type="password"
                    placeholder="Senha"
                    className="rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3.5 text-[28px] text-slate-800 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                    value={senha}
                    onChange={(event) => setSenha(event.target.value)}
                  />

                  {requires2fa && (
                    <input
                      type="text"
                      placeholder="Código 2FA (6 dígitos)"
                      className="rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3.5 text-[24px] text-slate-800 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                      value={twoFactorCode}
                      onChange={(event) => setTwoFactorCode(event.target.value)}
                    />
                  )}

                  {erro && (
                    <p className="text-center text-sm font-semibold text-red-600">{erro}</p>
                  )}

                  <button
                    type="submit"
                    disabled={carregando}
                    className="mt-2 rounded-2xl bg-blue-600 p-4 text-[44px] font-bold text-white transition hover:bg-blue-700 disabled:bg-blue-300"
                  >
                    {carregando ? 'Entrando...' : 'Entrar'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setModoRecuperacao(true);
                      setEmailRecuperacao(email);
                      setErro('');
                    }}
                    className="mt-1 text-base font-semibold text-blue-700 hover:text-blue-900"
                  >
                    Esqueci minha senha
                  </button>
                </form>
              ) : (
                <div className="mt-7 flex flex-col gap-4">
                  <form onSubmit={solicitarCodigoRecuperacao} className="flex flex-col gap-3">
                    <input
                      type="email"
                      placeholder="E-mail do administrador"
                      className="rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3 text-xl text-slate-800 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                      value={emailRecuperacao}
                      onChange={(event) => setEmailRecuperacao(event.target.value)}
                    />
                    <button
                      type="submit"
                      disabled={carregando}
                      className="rounded-2xl bg-slate-800 px-4 py-3 text-lg font-semibold text-white hover:bg-slate-900 disabled:bg-slate-400"
                    >
                      {carregando ? 'Solicitando...' : 'Solicitar código'}
                    </button>
                  </form>

                  <form onSubmit={redefinirSenha} className="flex flex-col gap-3">
                    <input
                      type="text"
                      placeholder="Código de recuperação"
                      className="rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3 text-xl text-slate-800 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                      value={codigoRecuperacao}
                      onChange={(event) => setCodigoRecuperacao(event.target.value)}
                    />
                    <input
                      type="password"
                      placeholder="Nova senha"
                      className="rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3 text-xl text-slate-800 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                      value={novaSenhaRecuperacao}
                      onChange={(event) => setNovaSenhaRecuperacao(event.target.value)}
                    />
                    <button
                      type="submit"
                      disabled={carregando}
                      className="rounded-2xl bg-blue-600 px-4 py-3 text-xl font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
                    >
                      {carregando ? 'Redefinindo...' : 'Redefinir senha'}
                    </button>
                  </form>

                  <button
                    type="button"
                    onClick={() => {
                      setModoRecuperacao(false);
                      setCodigoRecuperacao('');
                      setNovaSenhaRecuperacao('');
                      setCodigoTesteRecuperacao('');
                      setErro('');
                    }}
                    className="text-base font-semibold text-slate-600 hover:text-slate-900"
                  >
                    Voltar para login
                  </button>

                  {codigoTesteRecuperacao && (
                    <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
                      Código de teste: {codigoTesteRecuperacao}
                    </p>
                  )}

                  {erro && (
                    <p className="text-center text-sm font-semibold text-red-600">{erro}</p>
                  )}
                </div>
              )}
            </div>
          ) : mostrarTelaSolicitado ? (
            <>
              <h2 className="text-3xl font-black text-slate-900">Solicitação em análise</h2>
              <p className="mt-2 text-base text-slate-700">
                O primeiro acesso já foi solicitado. Aguarde a ativação no painel SaaS
                Master para liberar o login da câmara.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={carregarStatus}
                  className="rounded-2xl bg-slate-900 px-5 py-3 text-base font-semibold text-white hover:bg-slate-800"
                >
                  Atualizar status
                </button>
                <button
                  onClick={() => {
                    setErro('');
                    setForcarCadastro(true);
                  }}
                  className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-base font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Editar dados da solicitação
                </button>
              </div>
              {erro && <p className="mt-3 text-sm font-semibold text-amber-700">{erro}</p>}
            </>
          ) : (
            <>
              <h2 className="text-3xl font-black text-slate-900">Primeiro acesso da câmara</h2>
              <p className="mt-1 text-base text-slate-600">
                Cadastre a câmara para vincular automaticamente ao SaaS.
              </p>

              <form
                onSubmit={solicitarPrimeiroAcesso}
                className="mt-5 flex flex-col gap-3"
              >
                <input
                  value={codigoInstancia}
                  onChange={(e) => setCodigoInstancia(e.target.value)}
                  placeholder="Código da instância (ex: camara-vitoria-jari)"
                  className="rounded-xl border border-slate-300 p-3 text-slate-800"
                  required
                />
                <input
                  value={nomeOficial}
                  onChange={(e) => setNomeOficial(e.target.value)}
                  placeholder="Nome oficial da câmara"
                  className="rounded-xl border border-slate-300 p-3 text-slate-800"
                  required
                />
                <div className="grid grid-cols-3 gap-3">
                  <input
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                    placeholder="Cidade"
                    className="col-span-2 rounded-xl border border-slate-300 p-3 text-slate-800"
                    required
                  />
                  <input
                    value={uf}
                    onChange={(e) => setUf(e.target.value.toUpperCase())}
                    placeholder="UF"
                    maxLength={2}
                    className="rounded-xl border border-slate-300 p-3 text-slate-800"
                    required
                  />
                </div>
                <input
                  value={responsavelNome}
                  onChange={(e) => setResponsavelNome(e.target.value)}
                  placeholder="Nome do responsável"
                  className="rounded-xl border border-slate-300 p-3 text-slate-800"
                  required
                />
                <input
                  type="email"
                  value={responsavelEmail}
                  onChange={(e) => setResponsavelEmail(e.target.value)}
                  placeholder="E-mail do responsável"
                  className="rounded-xl border border-slate-300 p-3 text-slate-800"
                  required
                />
                <input
                  value={responsavelTelefone}
                  onChange={(e) => setResponsavelTelefone(e.target.value)}
                  placeholder="Telefone (opcional)"
                  className="rounded-xl border border-slate-300 p-3 text-slate-800"
                />
                {erro && (
                  <p className="text-sm font-semibold text-amber-700">{erro}</p>
                )}
                <button
                  type="submit"
                  disabled={carregando}
                  className="rounded-xl bg-blue-600 p-3 font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
                >
                  {carregando ? 'Enviando...' : 'Solicitar ativação'}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
