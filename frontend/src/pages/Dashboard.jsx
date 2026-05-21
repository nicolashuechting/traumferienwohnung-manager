import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Calendar, Users, TrendingUp, Home } from 'lucide-react';

function Dashboard() {
  const [stats, setStats] = useState({
    totalBookings: 0,
    occupancyRate: 0,
    topApartment: '',
    recurringGuests: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const q = query(collection(db, 'bookings'), where('userId', '==', auth.currentUser.uid));
        const bookingsSnap = await getDocs(q);
        const bookings = bookingsSnap.docs.map(doc => doc.data());

        setStats({
          totalBookings: bookings.length,
          occupancyRate: Math.floor(Math.random() * 30) + 65,
          topApartment: 'Hus Upstalsboom 3',
          recurringGuests: Math.floor(bookings.length * 0.15),
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      }
    };

    fetchStats();
  }, []);

  const StatCard = ({ icon: Icon, label, value, color }) => (
    <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200 hover:shadow-md transition">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-600 text-sm font-medium">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-8">
      <h2 className="text-3xl font-bold text-gray-900 mb-8">Dashboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          icon={Calendar}
          label="Gesamtbuchungen"
          value={stats.totalBookings}
          color="bg-blue-600"
        />
        <StatCard
          icon={TrendingUp}
          label="Auslastung"
          value={`${stats.occupancyRate}%`}
          color="bg-green-600"
        />
        <StatCard
          icon={Home}
          label="Top Wohnung"
          value={stats.topApartment}
          color="bg-purple-600"
        />
        <StatCard
          icon={Users}
          label="Stammgäste"
          value={stats.recurringGuests}
          color="bg-orange-600"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Buchungen pro Monat</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={[
              { name: 'Jan', bookings: 24 },
              { name: 'Feb', bookings: 13 },
              { name: 'Mär', bookings: 22 },
              { name: 'Apr', bookings: 29 },
            ]}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="bookings" stroke="#2563EB" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Auslastung pro Haus</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={[
                { name: 'Hus Upstalsboom', value: 65 },
                { name: 'Haus Anne', value: 72 },
              ]} cx="50%" cy="50%" labelLine={false} label outerRadius={100} fill="#2563EB" dataKey="value">
                <Cell fill="#2563EB" />
                <Cell fill="#1E40AF" />
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
