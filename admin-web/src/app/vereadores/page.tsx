'use client';

import { useEffect, useState } from 'react';

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
  ativo: boolean;
  partido?: string;
  cadeiraNumero?: number | null;
  cargo_mesa?: 'PRESIDENTE' | 'VICE_PRESIDENTE' | 'SECRETARIO_GERAL' | null;
};

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

    await api.post(
      `/usuarios/${usuarioId}/foto`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      },
    );

    await carregarUsuarios();
  }

  async function removerFoto(
    usuarioId: string,
  ) {
    await api.delete(`/usuarios/${usuarioId}/foto`);

    await carregarUsuarios();
  }

  useEffect(() => {
    carregarUsuarios();
  }, []);

  return (
    <main className="flex min-h-screen bg-gray-100">
      <Sidebar />

      <section className="flex-1 p-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-800">
              Vereadores
            </h1>

            <p className="text-gray-600 mt-2">
              Gerencie os vereadores cadastrados no sistema.
            </p>
          </div>

          <button
            onClick={() => setModalCadastroAberto(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-lg font-semibold"
          >
            Cadastrar Vereador
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow overflow-hidden">
          {carregando ? (
            <p className="p-6 text-gray-600">
              Carregando vereadores...
            </p>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-200">
                <tr>
                  <th className="text-left p-4 text-gray-700">
                    Foto
                  </th>

                  <th className="text-left p-4 text-gray-700">
                    Nome
                  </th>

                  <th className="text-left p-4 text-gray-700">
                    Email
                  </th>

                  <th className="text-left p-4 text-gray-700">
                    Perfil
                  </th>

                  <th className="text-left p-4 text-gray-700">
                    Cargo da mesa
                  </th>

                  <th className="text-left p-4 text-gray-700">
                    Partido
                  </th>

                  <th className="text-left p-4 text-gray-700">
                    Cadeira
                  </th>

                  <th className="text-left p-4 text-gray-700">
                    Status
                  </th>

                  <th className="text-left p-4 text-gray-700">
                    Ações
                  </th>
                </tr>
              </thead>

              <tbody>
                {usuarios.map((usuario) => (
                  <tr
                    key={usuario.id}
                    className="border-t border-gray-200"
                  >
                    <td className="p-4">
                      <div className="flex flex-col gap-2">
                        {usuario.foto_url ? (
                          <img
                            src={usuario.foto_url}
                            alt={usuario.nome}
                            className="rounded-full object-cover w-14 h-14"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-full bg-gray-300" />
                        )}

                        <label className="text-xs text-blue-600 hover:underline cursor-pointer">
                          Alterar Foto

                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(event) => {
                              const arquivo =
                                event.target.files?.[0];

                              if (!arquivo) {
                                return;
                              }

                              uploadFoto(
                                usuario.id,
                                arquivo,
                              );
                            }}
                          />
                        </label>

                        {usuario.foto_url && (
                          <button
                            onClick={() =>
                              removerFoto(usuario.id)
                            }
                            className="text-xs text-red-600 hover:underline text-left"
                          >
                            Remover Foto
                          </button>
                        )}
                      </div>
                    </td>

                    <td className="p-4 text-gray-800 font-medium">
                      {usuario.nome}
                    </td>

                    <td className="p-4 text-gray-600">
                      {usuario.email}
                    </td>

                    <td className="p-4 text-gray-600">
                      {usuario.role === 'PRESIDENTE' ? (
                        <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-semibold">
                          Presidente
                        </span>
                      ) : (
                        <span className="bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-sm">
                          Vereador
                        </span>
                      )}
                    </td>

                    <td className="p-4 text-gray-600">
                      {usuario.cargo_mesa === 'PRESIDENTE'
                        ? 'Presidente da Mesa'
                        : usuario.cargo_mesa === 'VICE_PRESIDENTE'
                          ? 'Vice-presidente'
                          : usuario.cargo_mesa === 'SECRETARIO_GERAL'
                            ? 'Secretário-geral'
                            : '-'}
                    </td>

                    <td className="p-4 text-gray-600">
                      {usuario.partido || '-'}
                    </td>

                    <td className="p-4 text-gray-600">
                      {usuario.cadeiraNumero ?? '-'}
                    </td>

                    <td className="p-4">
                      {usuario.ativo ? (
                        <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm">
                          Ativo
                        </span>
                      ) : (
                        <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm">
                          Inativo
                        </span>
                      )}
                    </td>

                    <td className="p-4 flex gap-3">
                      <button
                        onClick={() => abrirEdicao(usuario)}
                        className="text-blue-600 hover:underline"
                      >
                        Editar
                      </button>

                      <button
                        onClick={() => alterarStatus(usuario)}
                        className={
                          usuario.ativo
                            ? 'text-red-600 hover:underline'
                            : 'text-green-600 hover:underline'
                        }
                      >
                        {usuario.ativo ? 'Desativar' : 'Ativar'}
                      </button>

                      <button
                        onClick={() => excluirUsuario(usuario)}
                        className="text-red-700 hover:underline font-medium"
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
