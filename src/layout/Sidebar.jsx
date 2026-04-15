import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Calendar, Megaphone, Wallet, Search,
  SearchCheck, Settings, FileText, Image, Lightbulb,
  Bell, Scale, Menu, X, Brain
} from 'lucide-react';
import { useAlerts } from '../contexts/AlertsContext';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/meta-ads', label: 'Meta Ads', icon: Megaphone },
  { path: '/saldos-meta', label: 'Saldos Meta', icon: Wallet },
  { path: '/visao-detalhada', label: 'Visão Detalhada', icon: SearchCheck },
  { path: '/relatorio-texto', label: 'Relatório Texto', icon: FileText },
  { path: '/relatorio-visual', label: 'Relatório Visual', icon: Image },
  { path: '/analise-ia', label: 'Análise com IA', icon: Brain },
  { path: '/avisos', label: 'Avisos Automáticos', icon: Bell },
  { path: '/configuracoes', label: 'Configurações', icon: Settings },
];

export default function Sidebar() {
  const { unreadCount, criticalCount } = useAlerts();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = previousOverflow || '';
    }

    return () => {
      document.body.style.overflow = previousOverflow || '';
    };
  }, [mobileOpen]);

  const sidebarContent = (
    <>
      {/* ── Logo with glow ── */}
      <div className="px-5 py-7 border-b border-white/[0.04] flex justify-center items-center relative">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.06] via-primary/[0.02] to-transparent pointer-events-none" />
        <img src="/favicon.png" alt="Logo Vilas" className="w-36 h-auto object-contain relative drop-shadow-[0_0_24px_rgba(15,165,174,0.2)]" />
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 py-5 px-3 space-y-1 overflow-y-auto">
        {/* eslint-disable-next-line no-unused-vars -- Icon is used inside the NavLink render prop */}
        {navItems.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-250 group
              ${isActive
                ? 'bg-gradient-to-r from-primary/[0.12] to-primary/[0.03] text-primary-light border border-primary/[0.08]'
                : 'text-text-secondary hover:text-text-primary hover:bg-white/[0.04] border border-transparent'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-gradient-to-b from-primary-light to-primary shadow-[0_0_12px_rgba(15,165,174,0.6)]" />
                )}
                <Icon size={17} className={`shrink-0 transition-all duration-250 ${isActive ? 'text-primary-light drop-shadow-[0_0_8px_rgba(15,165,174,0.4)]' : 'text-text-secondary group-hover:text-text-primary'}`} />
                <span className="truncate">{label}</span>
                {path === '/' && unreadCount > 0 && (
                  <span className={`ml-auto text-[10px] font-bold min-w-[18px] text-center px-1.5 py-0.5 rounded-full leading-none
                    ${criticalCount > 0
                      ? 'bg-danger text-white shadow-[0_0_8px_rgba(248,113,113,0.3)]'
                      : 'bg-warning text-black shadow-[0_0_8px_rgba(251,191,36,0.2)]'
                    }`}>
                    {unreadCount}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ── Footer ── */}
      <div className="px-5 py-4 border-t border-white/[0.04]">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_6px_rgba(52,211,153,0.5)] animate-pulse" />
          <p className="text-[10px] text-text-secondary/40 font-medium tracking-wider uppercase">v1.0 — Painel VilasMKT</p>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* ── Mobile hamburger button ── */}
      <button
        className="lg:hidden fixed top-4 left-4 z-[60] p-2 rounded-lg bg-[#080A0F] border border-border/40 text-text-secondary"
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menu"
      >
        <Menu size={20} />
      </button>

      {/* ── Mobile overlay ── */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 z-[55]"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Mobile drawer ── */}
      <aside
        className={`lg:hidden fixed left-0 top-0 h-screen w-60 bg-[#060810]/95 backdrop-blur-xl border-r border-white/[0.04] flex flex-col z-[56]
          shadow-[4px_0_32px_-4px_rgba(0,0,0,0.7)] transition-transform duration-300
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <button
          className="absolute top-4 right-4 p-1.5 text-text-secondary hover:text-text-primary transition-colors rounded-lg hover:bg-white/[0.04]"
          onClick={() => setMobileOpen(false)}
          aria-label="Fechar menu"
        >
          <X size={18} />
        </button>
        {sidebarContent}
      </aside>

      {/* ── Desktop sidebar (always visible on lg+) ── */}
      <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-60 bg-[#060810]/95 backdrop-blur-xl border-r border-white/[0.04] flex-col z-50
        shadow-[4px_0_32px_-4px_rgba(0,0,0,0.7)]">
        {sidebarContent}
      </aside>
    </>
  );
}
