import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Calendar, Megaphone, Wallet,
  SearchCheck, Settings, FileText, Image,
  Bell, Scale, Menu, X
} from 'lucide-react';
import { useAlerts } from '../contexts/AlertsContext';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/agenda', label: 'Agenda', icon: Calendar },
  { path: '/meta-ads', label: 'Meta Ads', icon: Megaphone },
  { path: '/saldos-meta', label: 'Saldos Meta', icon: Wallet },
  { path: '/visao-detalhada', label: 'Visão Detalhada', icon: SearchCheck },
  { path: '/relatorio-texto', label: 'Relatório Texto', icon: FileText },
  { path: '/relatorio-visual', label: 'Relatório Visual', icon: Image },
  { path: '/avisos', label: 'Avisos Automáticos', icon: Bell },
  { path: '/regras-campanha', label: 'Regras de Campanha', icon: Scale },
  { path: '/configuracoes', label: 'Configurações', icon: Settings },
];

export default function Sidebar() {
  const { unreadCount, criticalCount } = useAlerts();
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarContent = (
    <>
      {/* ── Logo with glow ── */}
      <div className="px-5 py-6 border-b border-border/30 flex justify-center items-center relative">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.04] to-transparent pointer-events-none" />
        <img src="/favicon.png" alt="Logo Vilas" className="w-36 h-auto object-contain relative drop-shadow-[0_0_20px_rgba(15,165,174,0.15)]" />
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
        {/* eslint-disable-next-line no-unused-vars -- Icon is used inside the NavLink render prop */}
        {navItems.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200 group
              ${isActive
                ? 'bg-gradient-to-r from-primary/15 to-primary/[0.04] text-primary-light shadow-[0_0_20px_-8px_rgba(15,165,174,0.2)]'
                : 'text-text-secondary hover:text-text-primary hover:bg-white/[0.03]'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-gradient-to-b from-primary-light to-primary shadow-[0_0_8px_rgba(15,165,174,0.5)]" />
                )}
                <Icon size={17} className={`shrink-0 transition-colors duration-200 ${isActive ? 'text-primary-light drop-shadow-[0_0_6px_rgba(15,165,174,0.3)]' : 'text-text-secondary group-hover:text-text-primary'}`} />
                <span className="truncate">{label}</span>
                {path === '/' && unreadCount > 0 && (
                  <span className={`ml-auto text-[10px] font-bold min-w-[18px] text-center px-1 py-0.5 rounded-full leading-none shadow-sm
                    ${criticalCount > 0
                      ? 'bg-danger/90 text-white shadow-danger/30'
                      : 'bg-warning/90 text-black shadow-warning/20'
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
      <div className="px-5 py-3.5 border-t border-border/30">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          <p className="text-[10px] text-text-secondary/50 font-medium tracking-wider uppercase">v1.0 — Painel VilasMKT</p>
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
        className={`lg:hidden fixed left-0 top-0 h-screen w-60 bg-[#080A0F] border-r border-border/40 flex flex-col z-[56]
          shadow-[4px_0_24px_-4px_rgba(0,0,0,0.5)] transition-transform duration-300
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <button
          className="absolute top-4 right-4 p-1 text-text-secondary"
          onClick={() => setMobileOpen(false)}
          aria-label="Fechar menu"
        >
          <X size={18} />
        </button>
        {sidebarContent}
      </aside>

      {/* ── Desktop sidebar (always visible on lg+) ── */}
      <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-60 bg-[#080A0F] border-r border-border/40 flex-col z-50
        shadow-[4px_0_24px_-4px_rgba(0,0,0,0.5)]">
        {sidebarContent}
      </aside>
    </>
  );
}
