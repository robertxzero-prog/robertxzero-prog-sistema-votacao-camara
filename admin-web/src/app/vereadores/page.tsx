'use client';

import { ReactNode, useEffect, useState } from 'react';

import { Sidebar } from '@/components/Sidebar';
import { api } from '@/services/api';
import { CreateVereadorModal } from '@/components/CreateVereadorModal';
import { EditVereadorModal } from '@/components/EditVereadorModal';

type Usuario = {
  id: string;
  nome: string;
  email: string;
  role: string;
  foto_url: string | null;
  partido_logo_url?: string | null;
  ativo: boolean;
  partido?: string;
  cadeiraNumero?: number | null;
  cargo_mesa?: 'PRESIDENTE' | 'VICE_PRESIDENTE' | 'SECRETARIO_GERAL' | null;
};

function IconButton({
  title,
  tone = 'neutral',
  onClick,
  children,
}: {
  title: string;
  tone?: 'neutral' | 'danger';
  onClick?: () => void;
  children: ReactNode;
}) {
  const toneClasses =
    tone === 'danger'
      ? 'border-rose-300 text-rose-600 hover:bg-rose-50 focus-visible:ring-rose-300'
      : 'border-slate-300 text-slate-700 hover:bg-slate-50 focus-visible:ring-blue-300';

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border bg-white shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow focus-visible:outline-none focus-visible:ring-2 ${toneClasses}`}
    >
      {children}
    </button>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V5h6v2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M4 8h3l1.5-2h7L17 8h3v11H4V8z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13.5" r="3.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M6 4v16M6 5h10l-2 3 2 3H6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function VereadoresPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [modalCadastroAberto, setModalCadastroAberto] = useState(false);
  const [modalEdicaoAberto, setModalEdicaoAberto] = useState(false);

  const [vereadorSelecionado, setVereadorSelecionado] =
    useState<Usuario | null>(null);

  async function carregarUsuarios() {
    setCarregando(true);

    try {
      const response = await api.get('/usuarios');

      const vereadores = response.data.filter(
        (usuario: Usuario) =>
          usuario.role === 'VEREADOR' || usuario.role === 'PRESIDENTE',
      );

      setUsuarios(vereadores);
    } finally {
      setCarregando(false);
    }
  }

  function abrirEdicao(usuario: Usuario) {
    setVereadorSelecionado(usuario);
    setModalEdicaoAberto(true);
  }

  async function alterarStatus(usuario: Usuario) {
    await api.patch(`/usuarios/${usuario.id}/status`, {
      ativo: !usuario.ativo,
    });

    await carregarUsuarios();
  }

  async function excluirUsuario(usuario: Usuario) {
    const confirmou = confirm(
      `Tem certeza que deseja excluir o vereador ${usuario.nome}?`,
    );

    if (!confirmou) {
      return;
    }

    try {
      const response = await api.delete(`/usuarios/${usuario.id}`);

      if (response?.data?.ok === false) {
        alert(response.data.mensagem || 'Nao foi possivel excluir o usuario.');
        return;
      }

      await carregarUsuarios();
      alert('Usuario excluido com sucesso.');
    } catch (error: any) {
      alert(
        error?.response?.data?.message ||
          'Erro ao excluir usuario. Verifique se ha registros vinculados.',
      );
    }
  }

  async function uploadFoto(
    usuarioId: string,
    arquivo: File,
  ) {
    const formData = new FormData();

    formData.append('foto', arquivo);

    const response = await api.post(
      `/usuarios/${usuarioId}/foto`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      },
    );

    if (response.data?.ok === false) {
      alert(response.data?.mensagem || 'Nao foi possivel salvar a foto.');
      return;
    }

    await carregarUsuarios();
  }

  async function removerFoto(
    usuarioId: string,
  ) {
    await api.delete(`/usuarios/${usuarioId}/foto`);

    await carregarUsuarios();
  }

  async function uploadLogoPartido(
    usuarioId: string,
    arquivo: File,
  ) {
    const formData = new FormData();
    formData.append('logo', arquivo);

    const response = await api.post(
      `/usuarios/${usuarioId}/logo-partido`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );

    if (response.data?.ok === false) {
      alert(response.data?.mensagem || 'Nao foi possivel salvar o logo do partido.');
      return;
    }
    await carregarUsuarios();
  }

  async function removerLogoPartido(
    usuarioId: string,
  ) {
    await api.delete(`/usuarios/${usuarioId}/logo-partido`);
    await carregarUsuarios();
  }

  useEffect(() => {
    carregarUsuarios();
  }, []);

  return (
    <main className="admin-page">
      <Sidebar />

      <section className="admin-content">
        <div className="admin-container">
        <div className="admin-header">
          <div>
            <h1 className="admin-title">
              Vereadores
            </h1>

            <p className="admin-subtitle">
              Gerencie os vereadores cadastrados no sistema.
            </p>
          </div>

          <button
            onClick={() => setModalCadastroAberto(true)}
            className="btn btn-primary"
          >
            Cadastrar Vereador
          </button>
        </div>

        <div className="table-shell overflow-x-hidden">
          {carregando ? (
            <p className="p-6 text-slate-600">
              Carregando vereadores...
            </p>
          ) : (
            <table className="w-full table-fixed">
              <thead className="table-head">
                <tr>
                  <th className="table-th w-[14%]">
                    Foto
                  </th>

                  <th className="table-th w-[12%]">
                    Nome
                  </th>

                  <th className="table-th w-[18%]">
                    Email
                  </th>

                  <th className="table-th w-[10%]">
                    Perfil
                  </th>

                  <th className="table-th w-[12%]">
                    Cargo da mesa
                  </th>

                  <th className="table-th w-[8%]">
                    Partido
                  </th>

                  <th className="table-th w-[7%]">
                    Cadeira
                  </th>

                  <th className="table-th w-[9%]">
                    Status
                  </th>

                  <th className="table-th w-[10%] pr-6">
                    Ações
                  </th>
                </tr>
              </thead>

              <tbody>
                {usuarios.map((usuario) => (
                  <tr
                    key={usuario.id}
                    className="table-row"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex w-14 flex-col items-center gap-2">
                          {usuario.foto_url ? (
                            <img
                              src={usuario.foto_url}
                              alt={usuario.nome}
                              className="rounded-full object-cover w-14 h-14"
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-full bg-gray-300" />
                          )}
                          {usuario.partido_logo_url ? (
                            <img
                              src={usuario.partido_logo_url}
                              alt={`Logo do partido ${usuario.partido || ''}`}
                              className="h-7 w-7 rounded border border-slate-200 object-contain"
                            />
                          ) : (
                            <div className="h-7 w-7 rounded border border-slate-200 bg-slate-100" />
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <label
                              title="Adicionar/alterar foto"
                              className="cursor-pointer"
                            >
                              <span className="sr-only">
                                Adicionar/alterar foto
                              </span>
                              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
                                <CameraIcon />
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(event) => {
                                  const arquivo = event.target.files?.[0];
                                  if (!arquivo) return;
                                  uploadFoto(usuario.id, arquivo);
                                }}
                              />
                            </label>
                            {usuario.foto_url && (
                              <IconButton
                                title="Remover foto"
                                tone="danger"
                                onClick={() => removerFoto(usuario.id)}
                              >
                                <TrashIcon />
                              </IconButton>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <label
                              title="Adicionar/alterar logo do partido"
                              className="cursor-pointer"
                            >
                              <span className="sr-only">
                                Adicionar/alterar logo do partido
                              </span>
                              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow">
                                <FlagIcon />
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(event) => {
                                  const arquivo = event.target.files?.[0];
                                  if (!arquivo) return;
                                  uploadLogoPartido(usuario.id, arquivo);
                                }}
                              />
                            </label>
                            {usuario.partido_logo_url && (
                              <IconButton
                                title="Remover logo do partido"
                                tone="danger"
                                onClick={() => removerLogoPartido(usuario.id)}
                              >
                                <TrashIcon />
                              </IconButton>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="table-td font-semibold text-slate-900">
                      {usuario.nome}
                    </td>

                    <td className="table-td break-all">
                      {usuario.email}
                    </td>

                    <td className="table-td">
                      {usuario.role === 'PRESIDENTE' ? (
                        <span className="pill pill-slate">
                          Presidente
                        </span>
                      ) : (
                        <span className="pill pill-slate">
                          Vereador
                        </span>
                      )}
                    </td>

                    <td className="table-td">
                      {usuario.cargo_mesa === 'PRESIDENTE'
                        ? 'Presidente da Mesa'
                        : usuario.cargo_mesa === 'VICE_PRESIDENTE'
                          ? 'Vice-presidente'
                          : usuario.cargo_mesa === 'SECRETARIO_GERAL'
                            ? 'Secretário-geral'
                            : '-'}
                    </td>

                    <td className="table-td whitespace-normal break-words [overflow-wrap:anywhere] leading-tight">
                      {usuario.partido || '-'}
                    </td>

                    <td className="table-td">
                      {usuario.cadeiraNumero ?? '-'}
                    </td>

                    <td className="p-4">
                      {usuario.ativo ? (
                        <span className="pill pill-green">
                          Ativo
                        </span>
                      ) : (
                        <span className="pill pill-red">
                          Inativo
                        </span>
                      )}
                    </td>

                    <td className="table-td pr-6">
                      <div className="flex flex-col items-start gap-1.5">
                      <button
                        onClick={() => abrirEdicao(usuario)}
                        className="action-link leading-tight"
                      >
                        Editar
                      </button>

                      <button
                        onClick={() => alterarStatus(usuario)}
                        className={
                          usuario.ativo
                            ? 'action-link-danger leading-tight'
                            : 'action-link leading-tight'
                        }
                      >
                        {usuario.ativo ? 'Desativar' : 'Ativar'}
                      </button>

                      <button
                        onClick={() => excluirUsuario(usuario)}
                        className="action-link-danger leading-tight"
                      >
                        Excluir
                      </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        </div>
      </section>

      <CreateVereadorModal
        aberto={modalCadastroAberto}
        fechar={() => setModalCadastroAberto(false)}
        aoCadastrar={carregarUsuarios}
      />

      <EditVereadorModal
        aberto={modalEdicaoAberto}
        vereador={vereadorSelecionado}
        fechar={() => setModalEdicaoAberto(false)}
        aoAtualizar={carregarUsuarios}
      />
    </main>
  );
}

