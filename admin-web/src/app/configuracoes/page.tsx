"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { api } from "@/services/api";

export default function ConfiguracoesPage() {
  const [confirmarReordenacao, setConfirmarReordenacao] = useState(true);
  const [nomeCamara, setNomeCamara] = useState("Câmara Municipal");
  const [brasaoPreview, setBrasaoPreview] = useState<string | null>(null);

  useEffect(() => {
    carregarConfiguracao();
  }, []);

  async function carregarConfiguracao() {
    try {
      const raw = localStorage.getItem("config_confirmar_reordenacao_fila");
      if (raw !== null) setConfirmarReordenacao(raw === "true");

      const response = await api.get("/configuracao/camara");
      const conf = response.data?.config;
      if (!conf) return;

      setNomeCamara(conf.nome_oficial || "Câmara Municipal");
      setBrasaoPreview(conf.brasao_url || null);
      localStorage.setItem("config_camara_nome", conf.nome_oficial || "Câmara Municipal");
      if (conf.brasao_url) localStorage.setItem("config_camara_brasao", conf.brasao_url);
    } catch {}
  }

  async function salvarIdentidadeCamara() {
    await api.patch("/configuracao/camara", {
      nome_oficial: nomeCamara.trim() || "Câmara Municipal",
      brasao_url: brasaoPreview || null,
    });
    localStorage.setItem("config_camara_nome", nomeCamara.trim() || "Câmara Municipal");
    if (brasaoPreview) localStorage.setItem("config_camara_brasao", brasaoPreview);
    alert("Identidade da câmara salva com sucesso.");
  }

  function alterarBrasao(file?: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      setBrasaoPreview(dataUrl);
      localStorage.setItem("config_camara_brasao", dataUrl);
    };
    reader.readAsDataURL(file);
  }

  function removerBrasao() {
    setBrasaoPreview(null);
    localStorage.removeItem("config_camara_brasao");
  }

  return (
    <main className="flex min-h-screen bg-slate-100">
      <Sidebar />
      <section className="flex-1 p-8">
        <h1 className="text-4xl font-black text-slate-900">Configurações</h1>
        <p className="mt-2 text-slate-600">Ajustes operacionais da câmara.</p>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <article className="rounded-xl bg-white p-6 shadow">
            <h2 className="text-xl font-black text-slate-900">Identidade da Câmara</h2>
            <p className="mt-2 text-slate-700">Defina nome oficial e brasão institucional.</p>

            <label className="mt-4 block text-sm font-semibold text-slate-700">Nome oficial</label>
            <input
              type="text"
              value={nomeCamara}
              onChange={(e) => setNomeCamara(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800"
              placeholder="Ex.: Câmara Municipal de Vitória do Jari"
            />

            <div className="mt-4 flex items-center gap-3">
              {brasaoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={brasaoPreview} alt="Brasão" className="h-14 w-14 border border-slate-300 object-contain" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center border border-slate-300 bg-slate-100 text-sm font-bold text-slate-600">
                  Sem
                </div>
              )}
              <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Alterar brasão
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => alterarBrasao(e.target.files?.[0])}
                />
              </label>
              <button onClick={removerBrasao} className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700">
                Remover
              </button>
            </div>

            <button onClick={salvarIdentidadeCamara} className="mt-4 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800">
              Salvar identidade
            </button>
          </article>

          <article className="rounded-xl bg-white p-6 shadow">
            <h2 className="text-xl font-black text-slate-900">Fila de oradores</h2>
            <label className="mt-4 flex items-center gap-2 text-slate-800">
              <input
                type="checkbox"
                checked={confirmarReordenacao}
                onChange={(e) => {
                  setConfirmarReordenacao(e.target.checked);
                  localStorage.setItem("config_confirmar_reordenacao_fila", String(e.target.checked));
                }}
              />
              Exigir confirmação para reordenar/remover da fila
            </label>
          </article>

          <article className="rounded-xl bg-white p-6 shadow">
            <h2 className="text-xl font-black text-slate-900">Acessos avançados</h2>
            <div className="mt-4 grid gap-2">
              <Link href="/telao" className="rounded-lg bg-slate-100 px-3 py-2 font-semibold text-slate-800 hover:bg-slate-200">Abrir Telão</Link>
              <Link href="/presidente" className="rounded-lg bg-slate-100 px-3 py-2 font-semibold text-slate-800 hover:bg-slate-200">Painel do Presidente</Link>
              <Link href="/tablet" className="rounded-lg bg-slate-100 px-3 py-2 font-semibold text-slate-800 hover:bg-slate-200">Modo Tablet (Web)</Link>
              <Link href="/votacao" className="rounded-lg bg-slate-100 px-3 py-2 font-semibold text-slate-800 hover:bg-slate-200">Teste de Votação</Link>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}

