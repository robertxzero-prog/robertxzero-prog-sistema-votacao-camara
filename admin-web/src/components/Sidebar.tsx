"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { api } from "@/services/api";

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [nomeCamara, setNomeCamara] = useState("Câmara Municipal");
  const [brasaoUrl, setBrasaoUrl] = useState<string | null>(null);

  useEffect(() => {
    try {
      const nome = localStorage.getItem("config_camara_nome");
      const brasao = localStorage.getItem("config_camara_brasao");
      if (nome && nome.trim()) setNomeCamara(nome.trim());
      if (brasao && brasao.trim()) setBrasaoUrl(brasao);
    } catch {}
    api
      .get("/configuracao/camara")
      .then((response) => {
        const conf = response.data?.config;
        if (!conf) return;
        if (conf.nome_oficial) setNomeCamara(conf.nome_oficial);
        if (conf.brasao_url) setBrasaoUrl(conf.brasao_url);
      })
      .catch(() => undefined);
  }, []);

  function deslogar() {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    router.push("/");
  }

  const itens = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/vereadores", label: "Vereadores" },
    { href: "/sessoes", label: "Sessões" },
    { href: "/pautas", label: "Pautas" },
    { href: "/atas", label: "Atas" },
    { href: "/relatorios", label: "Relatórios" },
    { href: "/configuracoes", label: "Configurações" },
  ];

  return (
    <aside className="flex min-h-screen w-72 flex-col border-r border-blue-900/80 bg-blue-950 p-6 text-white">
      <div>
        <div className="mb-4 flex flex-col items-start">
          {brasaoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brasaoUrl}
              alt="Brasão da câmara"
              className="h-[70px] w-[70px] object-contain"
            />
          ) : (
            <div className="flex h-[70px] w-[70px] items-center justify-center bg-white/10 text-xl font-bold">
              CM
            </div>
          )}
          <h1 className="mt-2 text-2xl font-black">Sistema Câmara</h1>
        </div>

        <p className="text-xs uppercase tracking-[0.14em] text-blue-200">Painel Municipal</p>
        <p className="mb-8 mt-1 text-sm font-semibold text-blue-100">{nomeCamara}</p>

        <nav className="flex flex-col gap-2">
          {itens.map((item) => {
            const ativo = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg p-3 font-medium transition ${
                  ativo ? "bg-white text-blue-950" : "text-blue-100 hover:bg-blue-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto border-t border-blue-900 pt-6">
        <button
          onClick={deslogar}
          className="w-full rounded-lg bg-white/10 px-4 py-3 text-left font-semibold transition hover:bg-white/20"
        >
          Deslogar
        </button>
      </div>
    </aside>
  );
}
