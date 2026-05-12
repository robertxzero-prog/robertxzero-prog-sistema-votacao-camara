'use client';

import { useEffect, useState } from 'react';
import { api } from '@/services/api';

type Props = {
  aberto: boolean;
  fechar: () => void;
  aoCadastrar: () => void;
};

type TipoFala =
  | 'PEQUENAS_COMUNICACOES'
  | 'GRANDE_EXPEDIENTE'
  | 'ORDEM_DO_DIA'
  | 'EXPLICACOES_PESSOAIS';

type FilaItem = { vereador_id: string; tipo_fala: TipoFala };

export function CreateSessaoModal({ aberto, fechar, aoCadastrar }: Props) {
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dataSessao, setDataSessao] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [vereadores, setVereadores] = useState<
    Array<{
      id: string;
      nome: string;
      partido?: string | null;
      cadeiraNumero?: number | null;
      vereadores?: { id: string } | null;
      ativo?: boolean;
    }>
  >([]);
  const [novoVereadorId, setNovoVereadorId] = useState('');
  const [abaFala, setAbaFala] = useState<TipoFala>('PEQUENAS_COMUNICACOES');
  const [filaPlanejada, setFilaPlanejada] = useState<FilaItem[]>([]);

  useEffect(() => {
    if (!aberto) return;
    api.get('/usuarios').then((response) => {
      const lista = (response.data || []).filter(
        (u: any) => !!u.vereadores && u.ativo !== false,
      );
      setVereadores(lista);
      if (!novoVereadorId && lista[0]?.vereadores?.id) {
        setNovoVereadorId(lista[0].vereadores.id);
      }
    });
  }, [aberto]);

  if (!aberto) return null;

  function tituloAba(tipo: TipoFala) {
    if (tipo === 'PEQUENAS_COMUNICACOES') return 'Pequenas comunicações';
    if (tipo === 'GRANDE_EXPEDIENTE') return 'Grande expediente';
    if (tipo === 'ORDEM_DO_DIA') return 'Ordem do dia';
    return 'Explicações pessoais';
  }

  const filaDaAba = filaPlanejada.filter((i) => i.tipo_fala === abaFala);

  function adicionarFila() {
    if (!novoVereadorId) return;
    setFilaPlanejada((atual) => [
      ...atual,
      { vereador_id: novoVereadorId, tipo_fala: abaFala },
    ]);
  }

  function removerFila(indexGlobal: number) {
    setFilaPlanejada((atual) => atual.filter((_, i) => i !== indexGlobal));
  }

  async function cadastrarSessao(event: React.FormEvent) {
    event.preventDefault();
    setErro('');
    setCarregando(true);

    try {
      const response = await api.post('/sessoes', {
        titulo,
        descricao,
        data_sessao: dataSessao,
        fila_planejada: filaPlanejada,
      });

      if (!response.data.ok) {
        setErro(response.data.mensagem || 'Erro ao cadastrar sessão.');
        return;
      }

      setTitulo('');
      setDescricao('');
      setDataSessao('');
      setFilaPlanejada([]);
      aoCadastrar();
      fechar();
    } catch {
      setErro('Erro ao cadastrar sessão. Verifique os dados.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-8 shadow-xl">
        <h2 className="mb-6 text-2xl font-bold text-gray-800">Criar Sessão</h2>

        <form onSubmit={cadastrarSessao} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="Título da sessão"
            className="rounded-lg border border-gray-300 p-3 text-gray-800 placeholder:text-gray-500"
            value={titulo}
            onChange={(event) => setTitulo(event.target.value)}
          />

          <textarea
            placeholder="Descrição"
            className="min-h-24 rounded-lg border border-gray-300 p-3 text-gray-800 placeholder:text-gray-500"
            value={descricao}
            onChange={(event) => setDescricao(event.target.value)}
          />

          <input
            type="date"
            className="rounded-lg border border-gray-300 p-3 text-gray-800"
            value={dataSessao}
            onChange={(event) => setDataSessao(event.target.value)}
          />

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-800">
              Fila planejada de oradores (opcional)
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  'PEQUENAS_COMUNICACOES',
                  'GRANDE_EXPEDIENTE',
                  'ORDEM_DO_DIA',
                  'EXPLICACOES_PESSOAIS',
                ] as TipoFala[]
              ).map((tipo) => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => setAbaFala(tipo)}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                    abaFala === tipo
                      ? 'bg-violet-700 text-white'
                      : 'border border-slate-300 bg-white text-slate-700'
                  }`}
                >
                  {tituloAba(tipo)}
                </button>
              ))}
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              <select
                value={novoVereadorId}
                onChange={(event) => setNovoVereadorId(event.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Selecione vereador</option>
                {vereadores.map((v) => (
                  <option key={v.id} value={v.vereadores?.id || ''}>
                    {v.nome} - {v.partido || '-'} - Cadeira {v.cadeiraNumero ?? '-'}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={adicionarFila}
                className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-800"
              >
                Adicionar em {tituloAba(abaFala)}
              </button>
            </div>

            <div className="mt-2 grid gap-2">
              {filaDaAba.length === 0 ? (
                <p className="text-sm text-slate-600">
                  Nenhum orador planejado nesta etapa.
                </p>
              ) : (
                filaDaAba.map((item, index) => {
                  const indexGlobal = filaPlanejada.findIndex(
                    (f, i) =>
                      i >= 0 &&
                      f.vereador_id === item.vereador_id &&
                      f.tipo_fala === item.tipo_fala,
                  );
                  const vereador = vereadores.find(
                    (v) => v.vereadores?.id === item.vereador_id,
                  );
                  return (
                    <div
                      key={`${item.vereador_id}-${index}`}
                      className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm"
                    >
                      <span>
                        {index + 1}. {vereador?.nome || 'Vereador'}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          removerFila(indexGlobal >= 0 ? indexGlobal : index)
                        }
                        className="text-rose-700 hover:underline"
                      >
                        Remover
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {erro && <p className="text-sm text-red-600">{erro}</p>}

          <div className="mt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={fechar}
              className="rounded-lg border border-gray-300 px-5 py-3 text-gray-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={carregando}
              className="rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
            >
              {carregando ? 'Criando...' : 'Criar Sessão'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

