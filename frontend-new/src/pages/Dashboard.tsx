import { useMemo } from "react";
import { Calendar, TrendingUp, Home, Euro } from "lucide-react";
import { useBookings } from "@/hooks/useBookings";
import { properties } from "@/lib/properties";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer, Legend,
} from "recharts";

const COLORS = ["#2563EB", "#1E40AF", "#3B82F6", "#60A5FA"];

export function Dashboard() {
  const { data: bookings = [], isLoading } = useBookings();

  const stats = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const active = bookings.filter((b) => b.check_in <= today && b.check_out > today);
    const unpaid = bookings.filter((b) => !b.is_paid);

    const byMonth: Record<string, number> = {};
    bookings.forEach((b) => {
      const month = b.check_in.slice(0, 7);
      byMonth[month] = (byMonth[month] ?? 0) + 1;
    });

    const monthData = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, count]) => ({
        name: new Date(month + "-01").toLocaleDateString("de-DE", { month: "short", year: "2-digit" }),
        Buchungen: count,
      }));

    const byProperty: Record<string, number> = {};
    bookings.forEach((b) => {
      const name = properties.find((p) => p.id === b.property_id)?.name ?? b.property_id;
      byProperty[name] = (byProperty[name] ?? 0) + 1;
    });
    const propertyData = Object.entries(byProperty)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }));

    return { active: active.length, unpaid: unpaid.length, monthData, propertyData };
  }, [bookings]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Dashboard</h2>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Gesamtbuchungen", value: bookings.length, Icon: Calendar, color: "bg-blue-600" },
          { label: "Aktive Buchungen", value: stats.active, Icon: Home, color: "bg-emerald-600" },
          { label: "Wohnungen", value: properties.length, Icon: TrendingUp, color: "bg-violet-600" },
          { label: "Offen (unbezahlt)", value: stats.unpaid, Icon: Euro, color: "bg-amber-500" },
        ].map(({ label, value, Icon, color }) => (
          <div key={label} className="bg-white rounded-xl p-5 border border-gray-200 hover:shadow-sm transition">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500">{label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
              </div>
              <div className={`${color} p-2.5 rounded-lg`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-5 border border-gray-200">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Buchungen pro Monat</h3>
          {stats.monthData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={stats.monthData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="Buchungen" stroke="#2563EB" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">
              Noch keine Buchungen vorhanden
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl p-5 border border-gray-200">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Buchungen nach Wohnung</h3>
          {stats.propertyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={stats.propertyData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name }) => name}>
                  {stats.propertyData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">
              Noch keine Buchungen vorhanden
            </div>
          )}
        </div>
      </div>

      {/* Recent bookings */}
      {bookings.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-900">Letzte Buchungen</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {[...bookings]
              .sort((a, b) => {
                const ta = typeof a.created_at === "object" && a.created_at !== null ? (a.created_at as { seconds: number }).seconds : 0;
                const tb = typeof b.created_at === "object" && b.created_at !== null ? (b.created_at as { seconds: number }).seconds : 0;
                return tb - ta;
              })
              .slice(0, 5)
              .map((b) => {
                const prop = properties.find((p) => p.id === b.property_id);
                return (
                  <div key={b.id} className="px-5 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{b.guest_name}</p>
                      <p className="text-xs text-gray-500">{prop?.name} · {b.check_in} – {b.check_out}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full
                      ${b.is_paid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {b.is_paid ? "Bezahlt" : "Offen"}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
