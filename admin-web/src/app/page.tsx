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
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const [codigoInstancia, setCodigoInstancia] = useState('');
  const [nomeOficial, setNomeOficial] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');
  const [responsavelNome, setResponsavelNome] = useState('');
  const [responsavelEmail, setResponsavelEmail] = useState('');
  const [responsavelTelefone, setResponsavelTelefone] = useState('');

  async function carregarStatus() {
    try {
      setLoadingStatus(true);
      const response = await api.get('/configuracao/onboarding/status');
      setOnboarding(response.data || null);
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
      setErro(
        'Solicitação enviada. Aguarde aprovação/ativação no painel SaaS Master.',
      );
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
      setErro(error?.response?.data?.message || 'Email ou senha inválidos');
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

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-5xl grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl bg-gradient-to-br from-blue-900 to-slate-900 p-10 text-white shadow-2xl min-h-[420px] flex flex-col justify-between">
          <div className="flex items-start">
            <Image
              src="/votacam-logo.png"
              alt="Logo VotaCam"
              width={220}
              height={220}
              className="h-auto w-44 object-contain"
              priority
            />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-200">
              Sistema Legislativo
            </p>
            <h1 className="mt-3 text-4xl font-black leading-tight">
              Sistema Câmara Municipal
            </h1>
            <p className="mt-4 max-w-md text-blue-100/90">
              Painel administrativo para sessões, pautas, votações, atas e
              relatórios oficiais da casa legislativa.
            </p>
          </div>
        </section>

        <section className="bg-white p-8 rounded-2xl shadow-xl w-full">
          {loadingStatus ? (
            <p className="text-slate-700 font-semibold">Verificando ativação...</p>
          ) : liberarLogin ? (
            <>
              <h2 className="text-2xl font-black text-slate-900">
                Acesso administrativo
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Entre com suas credenciais para continuar.
              </p>

              <form onSubmit={fazerLogin} className="mt-6 flex flex-col gap-4">
                <input
                  type="email"
                  placeholder="Email"
                  className="border border-slate-300 rounded-xl p-3 placeholder:text-slate-500 text-slate-800"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />

                <input
                  type="password"
                  placeholder="Senha"
                  className="border border-slate-300 rounded-xl p-3 placeholder:text-slate-500 text-slate-800"
                  value={senha}
                  onChange={(event) => setSenha(event.target.value)}
                />
                {requires2fa && (
                  <input
                    type="text"
                    placeholder="Código 2FA (6 dígitos)"
                    className="border border-slate-300 rounded-xl p-3 placeholder:text-slate-500 text-slate-800"
                    value={twoFactorCode}
                    onChange={(event) => setTwoFactorCode(event.target.value)}
                  />
                )}

                {erro && (
                  <p className="text-red-600 text-sm text-center font-semibold">
                    {erro}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={carregando}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl p-3 font-semibold"
                >
                  {carregando ? 'Entrando...' : 'Entrar'}
                </button>
              </form>
            </>
          ) : onboardingSolicitado ? (
            <>
              <h2 className="text-2xl font-black text-slate-900">
                Solicitação em análise
              </h2>
              <p className="mt-2 text-sm text-slate-700">
                O primeiro acesso já foi solicitado. Aguarde a ativação no painel
                SaaS Master para liberar o login da câmara.
              </p>
              <button
                onClick={carregarStatus}
                className="mt-6 bg-slate-900 hover:bg-slate-800 text-white rounded-xl px-4 py-3 font-semibold"
              >
                Atualizar status
              </button>
              {erro && (
                <p className="mt-3 text-amber-700 text-sm font-semibold">{erro}</p>
              )}
            </>
          ) : (
            <>
              <h2 className="text-2xl font-black text-slate-900">
                Primeiro acesso da câmara
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Cadastre a câmara para vincular automaticamente ao SaaS.
              </p>

              <form
                onSubmit={solicitarPrimeiroAcesso}
                className="mt-6 flex flex-col gap-3"
              >
                <input
                  value={codigoInstancia}
                  onChange={(e) => setCodigoInstancia(e.target.value)}
                  placeholder="Código da instância (ex: camara-vitoria-jari)"
                  className="border border-slate-300 rounded-xl p-3 text-slate-800"
                  required
                />
                <input
                  value={nomeOficial}
                  onChange={(e) => setNomeOficial(e.target.value)}
                  placeholder="Nome oficial da câmara"
                  className="border border-slate-300 rounded-xl p-3 text-slate-800"
                  required
                />
                <div className="grid grid-cols-3 gap-3">
                  <input
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                    placeholder="Cidade"
                    className="col-span-2 border border-slate-300 rounded-xl p-3 text-slate-800"
                    required
                  />
                  <input
                    value={uf}
                    onChange={(e) => setUf(e.target.value.toUpperCase())}
                    placeholder="UF"
                    maxLength={2}
                    className="border border-slate-300 rounded-xl p-3 text-slate-800"
                    required
                  />
                </div>
                <input
                  value={responsavelNome}
                  onChange={(e) => setResponsavelNome(e.target.value)}
                  placeholder="Nome do responsável"
                  className="border border-slate-300 rounded-xl p-3 text-slate-800"
                  required
                />
                <input
                  type="email"
                  value={responsavelEmail}
                  onChange={(e) => setResponsavelEmail(e.target.value)}
                  placeholder="E-mail do responsável"
                  className="border border-slate-300 rounded-xl p-3 text-slate-800"
                  required
                />
                <input
                  value={responsavelTelefone}
                  onChange={(e) => setResponsavelTelefone(e.target.value)}
                  placeholder="Telefone (opcional)"
                  className="border border-slate-300 rounded-xl p-3 text-slate-800"
                />
                {erro && (
                  <p className="text-amber-700 text-sm font-semibold">{erro}</p>
                )}
                <button
                  type="submit"
                  disabled={carregando}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl p-3 font-semibold"
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
