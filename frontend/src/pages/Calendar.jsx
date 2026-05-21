import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, Plus, Star, X } from 'lucide-react';

function Calendar() {
  const [bookings, setBookings] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date(2024, 4, 21));
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

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
      const q = query(collection(db, 'bookings'), where('userId', '==', auth.currentUser.uid));
      const querySnapshot = await getDocs(q);
      const bookingsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setBookings(bookingsData);
    } catch (error) {
      console.error('Error fetching bookings:', error);
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

      if (selectedBooking) {
        await updateDoc(doc(db, 'bookings', selectedBooking.id), newBooking);
      } else {
        await addDoc(collection(db, 'bookings'), newBooking);
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
      console.error('Error saving booking:', error);
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

  const isBookingOnDay = (apartment, date) => {
    return bookings.filter(b => {
      const checkIn = new Date(b.checkIn);
      const checkOut = new Date(b.checkOut);
      return b.apartment === apartment && checkIn <= date && date < checkOut;
    });
  };

  const days = getDaysInRange();

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-3xl font-bold text-gray-900">Kalender</h2>
        <button
          onClick={() => {
            setShowModal(true);
            setSelectedBooking(null);
          }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
        >
          <Plus className="w-5 h-5" /> Buchung hinzufügen
        </button>
      </div>

      <div className="flex items-center justify-between mb-6 bg-white p-4 rounded-lg border border-gray-200">
        <button
          onClick={() => setCurrentDate(new Date(currentDate.setDate(currentDate.getDate() - 14)))}
          className="p-2 hover:bg-gray-100 rounded-lg transition"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-sm font-semibold text-gray-700">
          {days[0].toLocaleDateString('de-DE')} - {days[days.length - 1].toLocaleDateString('de-DE')}
        </span>
        <button
          onClick={() => setCurrentDate(new Date(currentDate.setDate(currentDate.getDate() + 14)))}
          className="p-2 hover:bg-gray-100 rounded-lg transition"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-3 text-left font-semibold text-gray-900 sticky left-0 bg-gray-50 z-10 w-32">Wohnung</th>
              {days.map((day, i) => (
                <th key={i} className="px-2 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">
                  <div className="text-xs">{day.toLocaleDateString('de-DE', { weekday: 'short' })}</div>
                  <div className="text-sm">{day.getDate()}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {apartments.map((apt) => (
              <tr key={apt} className="border-b border-gray-200 hover:bg-gray-50">
                <td className="px-4 py-3 font-semibold text-gray-900 sticky left-0 bg-white z-10 w-32">{apt}</td>
                {days.map((day, i) => {
                  const dayBookings = isBookingOnDay(apt, day);
                  return (
                    <td key={i} className="px-2 py-3 text-center">
                      {dayBookings.length > 0 && (
                        <button
                          onClick={() => {
                            setSelectedBooking(dayBookings[0]);
                            setFormData(dayBookings[0]);
                            setShowModal(true);
                          }}
                          className="w-full bg-blue-600 text-white text-xs px-2 py-1 rounded hover:bg-blue-700 transition truncate"
                        >
                          {dayBookings[0].guestName}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
