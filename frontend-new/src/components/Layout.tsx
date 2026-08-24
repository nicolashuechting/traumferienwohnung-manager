import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Calendar, Users, Settings, LogOut, Menu, X, User, BookOpen, Home, TrendingUp, Trash2, Bell } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAutoCompleteBookings } from "@/hooks/useBookings";
import { useNotifications } from "@/hooks/useNotifications";

const NAV = [
  { path: "/",             label: "Home",             Icon: Home },
  { path: "/calendar",     label: "Kalender",         Icon: Calendar },
  { path: "/bookings",     label: "Buchungen",        Icon: BookOpen },
  { path: "/notifications", label: "Benachrichtigungen", Icon: Bell },
  { path: "/analytics",    label: "Analysen",         Icon: TrendingUp },
  { path: "/guests",       label: "Gäste",            Icon: Users },
  { path: "/trash",        label: "Papierkorb",       Icon: Trash2 },
  { path: "/settings",     label: "Einstellungen",    Icon: Settings },
];

export function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  useAutoCompleteBookings();
  const { groups } = useNotifications();
  const notificationCount = groups.length;

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className={`${open ? "w-56" : "w-16"} bg-gradient-to-b from-blue-900 to-blue-800 text-white transition-all duration-200 flex flex-col flex-shrink-0`}>
        <div className="h-14 flex items-center justify-between px-3 border-b border-blue-700">
          {open && (
            <span className="font-bold text-sm truncate">Traumferienwohnung</span>
          )}
          <button onClick={() => setOpen(!open)} className="p-1.5 hover:bg-blue-700 rounded-lg transition flex-shrink-0">
            {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
          {NAV.map(({ path, label, Icon }) => {
            const badge = path === "/notifications" && notificationCount > 0 ? notificationCount : 0;
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition
                  ${location.pathname === path ? "bg-blue-600 text-white font-semibold" : "text-blue-100 hover:bg-blue-700"}`}
              >
                <span className="relative flex-shrink-0">
                  <Icon className="w-4 h-4" />
                  {!open && badge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-2 h-2 rounded-full bg-red-500" />
                  )}
                </span>
                {open && <span className="flex-1 text-left">{label}</span>}
                {open && badge > 0 && (
                  <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-blue-700 px-2 py-2">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-blue-100 hover:bg-blue-700 transition"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {open && <span>Abmelden</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Topbar */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
          <h1 className="text-base font-bold text-gray-900">Traumferienwohnung Manager</h1>

          <div className="relative">
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition"
            >
              <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-white">
                <User className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium text-gray-700 hidden sm:block">
                {user?.email?.split("@")[0]}
              </span>
            </button>

            {profileOpen && (
              <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-lg border border-gray-200 z-50 py-1">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-xs text-gray-500">Angemeldet als</p>
                  <p className="text-sm font-semibold text-gray-900 truncate">{user?.email}</p>
                </div>
                <button
                  onClick={() => { navigate("/settings"); setProfileOpen(false); }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
                >
                  Einstellungen
                </button>
                <button
                  onClick={logout}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition"
                >
                  Abmelden
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
