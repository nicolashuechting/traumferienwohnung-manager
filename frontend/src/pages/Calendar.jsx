import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';

function Calendar() {
  const [bookings, setBookings] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date(2026, 4, 22)); // 22.05.2026
  const [showModal, setShowModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [formData, setFormData] = useState({
    apartment: 'Hus Upstalsboom 1',
    guestName: '',
    email: '',
    phone: '',
    checkIn: '',
    checkOut: '',
    persons: 1,
    hasDog: false,
    specialRequests: '',
    notes: '',
    paid: false,
  });

  const apartments = [
    'Hus Upstalsboom 1', 'Hus Upstalsboom 2', 'Hus Upstalsboom 3', 'Hus Upstalsboom 4', 'Hus Upstalsboom 5', 'Hus Upstalsboom 6',
    'Haus Anne 1', 'Haus Anne 2', 'Haus Anne 3', 'Haus Anne 4', 'Haus Anne 5',
  ];

  const colors = [
    'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-yellow-500', 'bg-pink-500', 'bg-indigo-500', 'bg-red-500', 'bg-cyan-500'
  ];

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
      const q = query(collection(db, 'bookings'), where('userId', '==', auth.currentUser.uid));
      const querySnapshot = await getDocs(q);
      const bookingsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      console.log('📅 Buchungen geladen:', bookingsData);
      setBookings(bookingsData);
    } catch (error) {
      console.error('❌ Error fetching bookings:', error);
    }
  };

  const handleAddBooking = async () => {
    if (!formData.guestName || !formData.checkIn || !formData.checkOut) {
      alert('Bitte alle Felder ausfüllen');
      return;
    }

    try {
      const newBooking = {
        ...formData,
        userId: auth.currentUser.uid,
        createdAt: new Date(),
      };

      console.log('💾 Speichere Buchung:', newBooking);

      if (selectedBooking) {
        await updateDoc(doc(db, 'bookings', selectedBooking.id), newBooking);
        console.log('✏️ Buchung aktualisiert');
      } else {
        await addDoc(collection(db, 'bookings'), newBooking);
        console.log('✅ Buchung hinzugefügt');
      }

      fetchBookings();
      setShowModal(false);
      setFormData({
        apartment: 'Hus Upstalsboom 1',
        guestName: '',
        email: '',
        phone: '',
        checkIn: '',
        checkOut: '',
        persons: 1,
        hasDog: false,
        specialRequests: '',
        notes: '',
        paid: false,
      });
      setSelectedBooking(null);
    } catch (error) {
      console.error('❌ Error saving booking:', error);
      alert('Fehler beim Speichern: ' + error.message);
    }
  };

  const handleDeleteBooking = async () => {
    if (selectedBooking && window.confirm('Buchung wirklich löschen?')) {
      try {
        await deleteDoc(doc(db, 'bookings', selectedBooking.id));
        fetchBookings();
        setShowModal(false);
        setSelectedBooking(null);
      } catch (error) {
        console.error('Error deleting booking:', error);
      }
    }
  };

  const getDaysInRange = (days = 14) => {
    return Array.from({ length: days }, (_, i) => {
      const date = new Date(currentDate);
      date.setDate(date.getDate() + i);
      return date;
    });
  };

  const getBookingsForApartment = (apartment) => {
    return bookings.filter(b => b.apartment === apartment);
  };

  const getBookingPosition = (booking, days) => {
    const checkIn = new Date(booking.checkIn);
    const checkOut = new Date(booking.checkOut);
    checkIn.setHours(0, 0, 0, 0);
    checkOut.setHours(0, 0, 0, 0);

    const startDay = days.findIndex(d => {
      const dayNorm = new Date(d);
      dayNorm.setHours(0, 0, 0, 0);
      return dayNorm.getTime() === checkIn.getTime();
    });

    const endDay = days.findIndex(d => {
      const dayNorm = new Date(d);
      dayNorm.setHours(0, 0, 0, 0);
      return dayNorm.getTime() === checkOut.getTime();
    });

    if (startDay === -1) return null;

    return {
      startDay,
      duration: endDay === -1 ? days.length - startDay : Math.max(1, endDay - startDay),
    };
  };

  const days = getDaysInRange();
  const dayWidth = 100; // pixels per day

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Kalender</h2>
          <p className="text-sm text-gray-600 mt-1">Total: {bookings.length} Buchung(en)</p>
        </div>
        <button
          onClick={() => {
            setShowModal(true);
            setSelectedBooking(null);
            setFormData({
              apartment: 'Hus Upstalsboom 1',
              guestName: '',
              email: '',
              phone: '',
              checkIn: '',
              checkOut: '',
              persons: 1,
              hasDog: false,
              specialRequests: '',
              notes: '',
              paid: false,
            });
          }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
        >
          <Plus className="w-5 h-5" /> Buchung hinzufügen
        </button>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mb-6 bg-white p-4 rounded-lg border border-gray-200">
        <button
          onClick={() => {
            const newDate = new Date(currentDate);
            newDate.setDate(newDate.getDate() - 14);
            setCurrentDate(newDate);
          }}
          className="p-2 hover:bg-gray-100 rounded-lg transition"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-sm font-semibold text-gray-700">
          {days[0].toLocaleDateString('de-DE')} - {days[days.length - 1].toLocaleDateString('de-DE')}
        </span>
        <button
          onClick={() => {
            const newDate = new Date(currentDate);
            newDate.setDate(newDate.getDate() + 14);
            setCurrentDate(newDate);
          }}
          className="p-2 hover:bg-gray-100 rounded-lg transition"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Calendar Header */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {/* Days Header */}
        <div className="flex border-b border-gray-200">
          <div className="w-32 flex-shrink-0 px-4 py-3 font-semibold text-gray-900 bg-gray-50 border-r border-gray-200">
            Wohnung
          </div>
          <div className="flex overflow-x-auto">
            {days.map((day, i) => (
              <div
                key={i}
                className="flex-shrink-0 text-center py-3 border-r border-gray-200 bg-gray-50"
                style={{ width: dayWidth }}
              >
                <div className="text-xs font-medium text-gray-600">
                  {day.toLocaleDateString('de-DE', { weekday: 'short' })}
                </div>
                <div className="text-sm font-semibold text-gray-900">
                  {day.getDate()}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Apartments */}
        {apartments.map((apt, aptIdx) => {
          const aptBookings = getBookingsForApartment(apt);
          return (
            <div key={apt} className="flex border-b border-gray-200 hover:bg-blue-50 transition">
              <div className="w-32 flex-shrink-0 px-4 py-4 font-medium text-gray-900 bg-white border-r border-gray-200">
                {apt}
              </div>
              <div className="flex-1 relative overflow-x-auto bg-white" style={{ minHeight: '80px' }}>
                <div className="flex relative" style={{ minWidth: days.length * dayWidth }}>
                  {/* Grid lines */}
                  {days.map((_, i) => (
                    <div
                      key={`grid-${i}`}
                      className="flex-shrink-0 border-r border-gray-100"
                      style={{ width: dayWidth }}
                    />
                  ))}

                  {/* Bookings */}
                  <div className="absolute inset-0 px-2 py-2">
                    {aptBookings.map((booking, bookingIdx) => {
                      const pos = getBookingPosition(booking, days);
                      if (!pos) return null;

                      const colorClass = colors[bookingIdx % colors.length];

                      return (
                        <button
                          key={booking.id}
                          onClick={() => {
                            setSelectedBooking(booking);
                            setFormData(booking);
                            setShowModal(true);
                          }}
                          className={`absolute top-2 ${colorClass} text-white text-xs px-3 py-2 rounded-lg font-medium hover:shadow-lg transition cursor-pointer truncate`}
                          style={{
                            left: `${pos.startDay * dayWidth + 8}px`,
                            width: `${Math.max(pos.duration * dayWidth - 16, 60)}px`,
                            top: `${bookingIdx * 35 + 8}px`,
                          }}
                          title={booking.guestName}
                        >
                          {booking.guestName}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-screen overflow-y-auto">
            <div className="sticky top-0 flex items-center justify-between p-6 border-b border-gray-200 bg-white">
              <h3 className="text-xl font-bold text-gray-900">
                {selectedBooking ? 'Buchung bearbeiten' : 'Neue Buchung'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Wohnung</label>
                  <select
                    value={formData.apartment}
                    onChange={(e) => setFormData({ ...formData, apartment: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  >
                    {apartments.map(apt => <option key={apt} value={apt}>{apt}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Gast Name *</label>
                  <input
                    type="text"
                    value={formData.guestName}
                    onChange={(e) => setFormData({ ...formData, guestName: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Telefon</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Check-in *</label>
                  <input
                    type="date"
                    value={formData.checkIn}
                    onChange={(e) => setFormData({ ...formData, checkIn: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Check-out *</label>
                  <input
                    type="date"
                    value={formData.checkOut}
                    onChange={(e) => setFormData({ ...formData, checkOut: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Personenanzahl</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.persons}
                    onChange={(e) => setFormData({ ...formData, persons: parseInt(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                <div className="flex items-end gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.hasDog}
                      onChange={(e) => setFormData({ ...formData, hasDog: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-medium text-gray-700">Hund? 🐕</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.paid}
                      onChange={(e) => setFormData({ ...formData, paid: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-medium text-gray-700">Bezahlt</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Spezielle Anforderungen</label>
                <textarea
                  value={formData.specialRequests}
                  onChange={(e) => setFormData({ ...formData, specialRequests: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none h-20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Notizen</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none h-20"
                />
              </div>
            </div>

            <div className="sticky bottom-0 flex gap-3 p-6 border-t border-gray-200 bg-white">
              {selectedBooking && (
                <button
                  onClick={handleDeleteBooking}
                  className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition font-medium"
                >
                  Löschen
                </button>
              )}
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition font-medium"
              >
                Abbrechen
              </button>
              <button
                onClick={handleAddBooking}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition font-medium"
              >
                {selectedBooking ? 'Speichern' : 'Hinzufügen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Calendar;
