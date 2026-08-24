import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { menuSectionsByRole, permissionForHref } from "../constants/menu";
import { useAuth } from "../context/AuthContext";
import logoParkPlaza from "../assets/park-plaza-mark.svg";

export function Sidebar({ open, onClose }) {
  const { user, hasPermission } = useAuth();
  const location = useLocation();
  const sections = filterSectionsByPermission(menuSectionsByRole[user?.role] || [], hasPermission);
  const [expanded, setExpanded] = useState({});

  return (
    <aside className={`${open ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-40 flex w-[17.5rem] flex-col bg-gradient-to-b from-[#0B1020] via-[#112244] to-[#0B1020] text-white shadow-drawer transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] lg:translate-x-0`}>
      <div className="border-b border-white/10 p-7 pb-5">
        <div className="flex flex-col items-center text-center">
          <img
            className="h-24 w-24 shrink-0 rounded-full border-2 border-white/45 bg-black object-cover shadow-[0_0_26px_rgba(255,255,255,0.16)] transition-transform hover:scale-105"
            src={logoParkPlaza}
            alt="Hotel Park Plaza"
          />
          <p className="mt-3 text-2xl font-black uppercase tracking-[0.18em] text-white">Park Plaza</p>
          <p className="mt-1 text-[10px] font-black uppercase tracking-[0.28em] text-white/65">La magia de Pucallpa</p>
        </div>
      </div>

      <nav className="sidebar-scroll grid gap-6 overflow-y-auto px-4 py-6">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="mb-2 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-white/45">{section.label}</p>
            <div className="grid gap-1.5">
              {section.items.map((item) => Array.isArray(item) ? (
                <SidebarLink item={item} key={item[1]} onClose={onClose} />
              ) : (
                <SidebarGroup
                  expanded={expanded[item.href] ?? item.children?.some((child) => location.pathname === child[1])}
                  item={item}
                  key={item.href}
                  onClose={onClose}
                  onToggle={() => setExpanded((state) => ({ ...state, [item.href]: !(state[item.href] ?? item.children?.some((child) => location.pathname === child[1])) }))}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="mt-auto border-t border-white/10 bg-black/20 p-5 text-xs text-white/60">
        <strong className="block text-white">{user?.firstName} {user?.lastName}</strong>
        <span>{user?.role} · Sistema ERP</span>
      </div>
    </aside>
  );
}

function SidebarLink({ item, onClose, child = false }) {
  const [label, href, Icon] = item;
  return (
    <NavLink
      to={href}
      onClick={onClose}
      className={({ isActive }) => `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${child ? "ml-6 py-2 text-xs" : ""} ${isActive ? "bg-park-green text-white shadow-[0_8px_20px_rgba(30,111,214,0.4)]" : "text-white/75 hover:bg-white/10 hover:text-white"}`}
    >
      <Icon size={child ? 15 : 18} className={`transition-transform duration-200 group-hover:scale-110`} />
      <span className="drop-shadow-sm">{label}</span>
    </NavLink>
  );
}

function SidebarGroup({ item, expanded, onToggle, onClose }) {
  const Icon = item.icon;
  return (
    <div className="overflow-hidden">
      <button
        className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-all duration-200 ${expanded ? "bg-white/15 text-white shadow-inner" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
        onClick={onToggle}
        type="button"
      >
        <Icon size={18} className="transition-transform duration-200 group-hover:scale-110" />
        <span className="flex-1 drop-shadow-sm">{item.label}</span>
        <ChevronDown className={`transition-transform duration-300 ease-in-out ${expanded ? "rotate-180 text-park-gold" : ""}`} size={16} />
      </button>
      <div className={`grid transition-all duration-300 ease-in-out ${expanded ? "grid-rows-[1fr] mt-1.5 opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <div className="grid gap-1 border-l border-white/10 ml-5 pl-2">
            {item.children.map((child) => <SidebarLink child item={child} key={child[1]} onClose={onClose} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function filterSectionsByPermission(sections, hasPermission) {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.map((item) => filterMenuItem(item, hasPermission)).filter(Boolean)
    }))
    .filter((section) => section.items.length > 0);
}

function filterMenuItem(item, hasPermission) {
  if (Array.isArray(item)) {
    const permission = permissionForHref(item[1]);
    return hasPermission(permission) ? item : null;
  }
  const children = (item.children || []).filter((child) => hasPermission(permissionForHref(child[1])));
  const ownAllowed = hasPermission(permissionForHref(item.href));
  if (!ownAllowed && !children.length) return null;
  return { ...item, children };
}
