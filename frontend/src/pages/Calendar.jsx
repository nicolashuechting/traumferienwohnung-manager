import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';

function Calendar() {
  const [bookings, setBookings] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date()); // Heute
  const [showModal, setShowModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [formData, setFormData] = useState({
    apartment: 'Upstalsboom 1',
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
    'Upstalsboom 1', 'Upstalsboom 2', 'Upstalsboom 3', 'Upstalsboom 4', 'Upstalsboom 5', 'Upstalsboom 6',
    'Anne 1', 'Anne 2', 'Anne 3', 'Anne 4', 'Anne 5',
  ];

  const colors = [
    'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-yellow-500', 'bg-pink-500', 'bg-indigo-500', 'bg-red-500', 'bg-cyan-500'
  ];

  useEffect(() => {
    // Normalize today to start of day
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setCurrentDate(today);
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
        apartment: 'Upstalsboom 1',
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

  // Group bookings by day to determine row position
  const getBookingRow = (booking, apartment, days) => {
    const pos = getBookingPosition(booking, days);
    if (!pos) return 0;

    const aptBookings = getBookingsForApartment(apartment);
    const bookingsOnSameDay = aptBookings.filter(b => {
      const bPos = getBookingPosition(b, days);
      if (!bPos) return false;
      return bPos.startDay <= pos.startDay && pos.startDay < bPos.startDay + bPos.duration;
    });

    return bookingsOnSameDay.indexOf(booking);
  };

  const days = getDaysInRange();
  const dayWidth = 80; // pixels per day

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
              apartment: 'Upstalsboom 1',
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

      {/* Calendar Container */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {/* Wrapper with flex */}
        <div className="flex overflow-x-auto">
          {/* Apartments Column (Fixed) */}
          <div className="flex-shrink-0">
            {/* Header */}
            <div className="w-40 px-4 py-3 font-semibold text-gray-900 bg-gray-50 border-r border-gray-200 border-b">
              Wohnung
            </div>
            {/* Rows */}
            {apartments.map((apt) => (
              <div
                key={apt}
                className="w-40 px-4 py-4 font-medium text-gray-900 bg-white border-r border-gray-200 border-b hover:bg-blue-50 transition"
                style={{ minHeight: '80px' }}
              >
                {apt}
              </div>
            ))}
          </div>

          {/* Days Grid (Scrollable) */}
          <div className="flex-1 overflow-x-auto">
            {/* Days Header */}
            <div className="flex border-b border-gray-200 bg-gray-50">
              {days.map((day, i) => (
                <div
                  key={i}
                  className="flex-shrink-0 text-center py-3 border-r border-gray-200"
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

            {/* Apartment Rows */}
            {apartments.map((apt) => {
              const aptBookings = getBookingsForApartment(apt);
              return (
                <div key={apt} className="flex border-b border-gray-200 hover:bg-blue-50 transition">
                  {days.map((_, dayIdx) => (
                    <div
                      key={dayIdx}
                      className="flex-shrink-0 border-r border-gray-200 relative"
                      style={{ width: dayWidth, minHeight: '80px' }}
                    >
                      {/* Bookings for this day */}
                      {aptBookings
                        .filter((booking) => {
                          const pos = getBookingPosition(booking, days);
                          if (!pos) return false;
                          return pos.startDay <= dayIdx && dayIdx < pos.startDay + pos.duration;
                        })
                        .map((booking, bookingIdx) => {
                          const pos = getBookingPosition(booking, days);
                          const row = getBookingRow(booking, apt, days);
                          const colorClass = colors[bookingIdx % colors.length];
                          const isFirstDay = pos.startDay === dayIdx;
                          const isLastDay = dayIdx === pos.startDay + pos.duration - 1;

                          // Calculate width
                          let width = dayWidth - 4;
                          if (isFirstDay && isLastDay) {
                            width = dayWidth * pos.duration - 4;
                          } else if (isFirstDay) {
                            width = dayWidth - 4;
                          } else if (isLastDay) {
                            width = dayWidth - 4;
                          }

                          return (
                            <button
                              key={booking.id}
                              onClick={() => {
                                setSelectedBooking(booking);
                                setFormData(booking);
                                setShowModal(true);
                              }}
                              className={`absolute ${colorClass} text-white text-xs px-2 py-1 rounded font-medium hover:shadow-lg transition cursor-pointer truncate`}
                              style={{
                                left: isFirstDay ? '2px' : '0',
                                top: `${row * 35 + 4}px`,
                                width: `${width}px`,
                                height: '30px',
                                zIndex: row,
                              }}
                              title={booking.guestName}
                            >
                              {isFirstDay && booking.guestName}
                            </button>
                          );
                        })}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
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
