"use client";

import { useEffect, useState } from "react";

import { api } from "@/services/api";

type Sessao = {
  id: string;
  titulo: string;
};

type TipoMaioria = "SIMPLES" | "ABSOLUTA" | "DOIS_TERCOS";

type Pauta = {
  id: string;
  sessao_id: string;
  numero_ordem: number;
  titulo: string;
  descricao: string | null;
  tipo_maioria: TipoMaioria;
};

type Props = {
  aberto: boolean;
  pauta: Pauta | null;
  fechar: () => void;
  aoAtualizar: () => void;
};

export function EditPautaModal({ aberto, pauta, fechar, aoAtualizar }: Props) {
  const [sessoes, setSessoes] = useState<Sessao[]>([]);

  const [sessaoId, setSessaoId] = useState("");
  const [numeroOrdem, setNumeroOrdem] = useState("");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tipoMaioria, setTipoMaioria] = useState<TipoMaioria>("SIMPLES");

  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function carregarSessoes() {
    const response = await api.get("/sessoes");

    setSessoes(response.data);
  }

  useEffect(() => {
    if (aberto) {
      carregarSessoes();
    }
  }, [aberto]);

  useEffect(() => {
    if (pauta) {
      setSessaoId(pauta.sessao_id);
      setNumeroOrdem(String(pauta.numero_ordem));
      setTitulo(pauta.titulo);
      setDescricao(pauta.descricao ?? "");
      setTipoMaioria(pauta.tipo_maioria ?? "SIMPLES");
      setErro("");
    }
  }, [pauta]);

  if (!aberto || !pauta) {
    return null;
  }

  async function editarPauta(event: React.FormEvent) {
    event.preventDefault();

    if (!pauta) {
      return;
    }

    setErro("");
    setCarregando(true);

    try {
      const response = await api.put(`/pautas/${pauta.id}`, {
        sessao_id: sessaoId,
        numero_ordem: Number(numeroOrdem),
        titulo,
        descricao,
        tipo_maioria: tipoMaioria,
      });

      if (!response.data.ok) {
        setErro(response.data.mensagem || "Erro ao atualizar pauta.");
        return;
      }

      aoAtualizar();
      fechar();
    } catch {
      setErro("Erro ao atualizar pauta.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl p-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Editar Pauta</h2>

        <form onSubmit={editarPauta} className="flex flex-col gap-4">
          <select
            className="border border-gray-300 rounded-lg p-3 text-gray-800"
            value={sessaoId}
            onChange={(event) => setSessaoId(event.target.value)}
          >
            <option value="">Selecione uma sessão</option>

            {sessoes.map((sessao) => (
              <option key={sessao.id} value={sessao.id}>
                {sessao.titulo}
              </option>
            ))}
          </select>

          <input
            type="number"
            placeholder="Número da ordem"
            className="border border-gray-300 rounded-lg p-3 text-gray-800"
            value={numeroOrdem}
            onChange={(event) => setNumeroOrdem(event.target.value)}
          />

          <input
            type="text"
            placeholder="Título da pauta"
            className="border border-gray-300 rounded-lg p-3 text-gray-800"
            value={titulo}
            onChange={(event) => setTitulo(event.target.value)}
          />

          <select
            className="border border-gray-300 rounded-lg p-3 text-gray-800"
            value={tipoMaioria}
            onChange={(event) =>
              setTipoMaioria(event.target.value as TipoMaioria)
            }
          >
            <option value="SIMPLES">Maioria simples</option>
            <option value="ABSOLUTA">Maioria absoluta</option>
            <option value="DOIS_TERCOS">Dois terços</option>
          </select>

          <textarea
            placeholder="Descrição"
            className="border border-gray-300 rounded-lg p-3 text-gray-800 min-h-24"
            value={descricao}
            onChange={(event) => setDescricao(event.target.value)}
          />

          {erro && <p className="text-red-600 text-sm">{erro}</p>}

          <div className="flex gap-3 justify-end mt-4">
            <button
              type="button"
              onClick={fechar}
              className="px-5 py-3 rounded-lg border border-gray-300 text-gray-700"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={carregando}
              className="px-5 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold"
            >
              {carregando ? "Salvando..." : "Salvar Alterações"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
