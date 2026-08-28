import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { menuSectionsByRole, permissionForHref } from "../constants/menu";
import { useAuth } from "../context/AuthContext";

export function Sidebar({ open, onClose }) {
  const { user, hasPermission } = useAuth();
  const location = useLocation();
  const sections = filterSectionsByPermission(menuSectionsByRole[user?.role] || [], hasPermission);
  const [expanded, setExpanded] = useState({});
  const isV6Role = ["SUPERADMIN", "ADMINISTRADOR", "RESTAURANTE", "BARTENDER"].includes(user?.role);
  const roleTheme = user?.role === "RESTAURANTE" ? "theme-restaurant" : user?.role === "BARTENDER" ? "theme-bar" : "theme-hotel";

  return (
    <aside className={`${open ? "translate-x-0" : "-translate-x-full"} ${isV6Role ? `reception-v6-sidebar ${roleTheme}` : ""} fixed inset-y-0 left-0 z-40 flex w-[14.75rem] flex-col bg-[#0a1c15] text-white shadow-drawer transition-transform duration-200 lg:translate-x-0`}>
      <div className={`border-b border-white/10 p-7 pb-5 ${isV6Role ? "reception-v6-brand" : ""}`}>
        <div className={`flex flex-col items-center text-center ${isV6Role ? "reception-v6-brand-inner" : ""}`}>
          <span className="v6-crest" aria-hidden="true">P</span>
          <div className={isV6Role ? "text-left" : ""}><p className={`${isV6Role ? "mt-0 text-[15px]" : "mt-3 text-2xl"} v6-brand-title font-black uppercase text-white`}>Park Plaza</p><p className="mt-1 text-[9px] font-black uppercase text-[#e5c997]">★★★★★</p></div>
        </div>
      </div>

      <nav className="sidebar-scroll grid gap-6 overflow-y-auto px-4 py-6">
        {isV6Role ? sections.map((section) => <ReceptionSidebarSection key={section.label} section={section} expanded={Boolean(expanded[`section:${section.label}`]) || section.items.some((item) => Array.isArray(item) ? location.pathname === item[1] : item.children?.some((child) => location.pathname === child[1]))} onClose={onClose} onToggle={() => setExpanded((state) => ({ ...state, [`section:${section.label}`]: !state[`section:${section.label}`] }))} />) : sections.map((section) => (
          <div key={section.label}>
            <p className="mb-2 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-white/45">{section.label}</p>
            <div className="grid gap-1.5">
              {section.items.map((item) => Array.isArray(item) ? (
              <SidebarLink item={item} key={item[1]} onClose={onClose} receptionTheme={false} />
              ) : (
                <SidebarGroup
                  expanded={expanded[item.label] ?? item.children?.some((child) => location.pathname === child[1])}
                  item={item}
                  key={item.href}
                  onClose={onClose}
                  receptionTheme={false}
                  onToggle={() => setExpanded((state) => ({ ...state, [item.label]: !(state[item.label] ?? item.children?.some((child) => location.pathname === child[1])) }))}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="mt-auto border-t border-white/10 bg-black/20 p-5 text-xs text-white/60">
        <strong className="block text-white">{user?.firstName} {user?.lastName}</strong>
        <span>{user?.role === "SUPERADMIN" ? "Superadmin" : user?.role === "ADMINISTRADOR" ? "Admin de recepción" : user?.role} · Sistema ERP</span>
      </div>
    </aside>
  );
}

function ReceptionSidebarSection({ section, expanded, onToggle, onClose }) {
  const children = section.items.flatMap((item) => Array.isArray(item) ? [item] : (item.children || []));
  return <section className="reception-v6-section">
    <button className={`reception-v6-section-toggle ${expanded ? "is-open" : ""}`} onClick={onToggle} type="button" aria-expanded={expanded}>
      <span>{section.label}</span><ChevronRight size={16} />
    </button>
    <div className={`grid transition-all duration-300 ${expanded ? "grid-rows-[1fr] opacity-100 pt-1" : "grid-rows-[0fr] opacity-0"}`}>
      <div className="overflow-hidden"><div className="grid gap-1 px-1 pb-1">{children.map((item) => <SidebarLink child item={item} key={item[1]} onClose={onClose} receptionTheme />)}</div></div>
    </div>
  </section>;
}

function SidebarLink({ item, onClose, child = false, receptionTheme = false }) {
  const [label, href, Icon] = item;
  return (
    <NavLink
      to={href}
      onClick={onClose}
      className={({ isActive }) => `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors duration-200 ${child ? "ml-3 py-2 text-xs" : ""} ${receptionTheme ? `v6-sidebar-link ${isActive ? "is-active" : ""}` : isActive ? "bg-park-green text-white" : "text-white/75 hover:bg-white/10 hover:text-white"}`}
    >
      <Icon size={child ? 15 : 18} className={`transition-transform duration-200 group-hover:scale-110`} />
      <span className="drop-shadow-sm">{label}</span>
    </NavLink>
  );
}

function SidebarGroup({ item, expanded, onToggle, onClose, receptionTheme = false }) {
  const Icon = item.icon;
  return (
    <div className="overflow-hidden">
      <button
        className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-all duration-200 ${expanded ? (receptionTheme ? "bg-white/10 text-[#f3db91]" : "bg-white/15 text-white shadow-inner") : "text-white/70 hover:bg-white/10 hover:text-white"}`}
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
            {item.children.map((child) => <SidebarLink child item={child} key={child[1]} onClose={onClose} receptionTheme={receptionTheme} />)}
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
