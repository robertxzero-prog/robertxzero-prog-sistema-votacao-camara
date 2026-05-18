"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { api } from "@/services/api";

type MenuItem = {
  href: string;
  label: string;
  destaque?: boolean;
};

type MenuGroup = {
  titulo: string;
  itens: MenuItem[];
};

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

  const grupos: MenuGroup[] = [
    {
      titulo: "Operação",
      itens: [
        { href: "/controle-da-sessao", label: "Controle da Sessão", destaque: true },
      ],
    },
    {
      titulo: "Preparação",
      itens: [
        { href: "/sessoes", label: "Sessões" },
        { href: "/pautas", label: "Pautas" },
        { href: "/vereadores", label: "Vereadores" },
      ],
    },
    {
      titulo: "Documentos",
      itens: [
        { href: "/atas", label: "Atas" },
        { href: "/relatorios", label: "Relatórios" },
      ],
    },
    {
      titulo: "Sistema",
      itens: [{ href: "/configuracoes", label: "Configurações" }],
    },
  ];

  return (
    <aside className="flex min-h-screen w-72 min-w-72 shrink-0 flex-col border-r border-blue-950 bg-[radial-gradient(circle_at_top_left,#0f2d62_0,#07172f_34%,#020617_82%)] p-5 text-white shadow-2xl">
      <div>
        <div className="mb-5 flex items-center gap-3">
          {brasaoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brasaoUrl}
              alt="Brasão da câmara"
              className="h-14 w-14 object-contain"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-white/10 bg-white/10 text-lg font-black">
              CM
            </div>
          )}
          <div>
            <h1 className="text-xl font-black">SILCAM</h1>
            <p className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-200">
              Painel de Controle
            </p>
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-blue-300/20 bg-blue-950/45 p-3 shadow-inner shadow-black/20">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">
            Câmara
          </p>
          <p className="mt-1 text-sm font-semibold leading-snug text-white">
            {nomeCamara}
          </p>
        </div>

        <nav className="space-y-5">
          {grupos.map((grupo) => (
            <div key={grupo.titulo}>
              <p className="mb-2 px-2 text-[11px] font-black uppercase tracking-[0.24em] text-blue-300/80">
                {grupo.titulo}
              </p>
              <div className="space-y-1.5">
                {grupo.itens.map((item) => {
                  const ativo = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center rounded-xl px-4 py-3 font-semibold transition ${
                        ativo
                          ? "bg-white text-slate-950 shadow-xl shadow-black/25"
                          : item.destaque
                            ? "bg-blue-500/25 text-white shadow-inner shadow-blue-950/40 hover:bg-blue-500/35"
                            : "text-slate-100/90 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <span className="whitespace-nowrap">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <div className="mt-auto border-t border-blue-300/10 pt-5">
        <button
          onClick={deslogar}
          className="w-full rounded-xl bg-white/10 px-4 py-3 text-left font-semibold text-slate-100 transition hover:bg-white/20"
        >
          Deslogar
        </button>
      </div>
    </aside>
  );
}

