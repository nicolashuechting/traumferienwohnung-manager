import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Star, Mail, Phone } from 'lucide-react';

function GuestManagement() {
  const [guests, setGuests] = useState([]);

  useEffect(() => {
    fetchGuests();
  }, []);

  const fetchGuests = async () => {
    try {
      const q = query(collection(db, 'bookings'), where('userId', '==', auth.currentUser.uid));
      const querySnapshot = await getDocs(q);
      const bookings = querySnapshot.docs.map(doc => doc.data());
      
      const guestMap = new Map();
      bookings.forEach(booking => {
        const key = booking.guestName;
        if (!guestMap.has(key)) {
          guestMap.set(key, {
            name: booking.guestName,
            email: booking.email,
            phone: booking.phone,
            count: 0,
          });
        }
        guestMap.get(key).count += 1;
      });

      const guestList = Array.from(guestMap.values()).sort((a, b) => b.count - a.count);
      setGuests(guestList);
    } catch (error) {
      console.error('Error fetching guests:', error);
    }
  };

  return (
    <div className="p-8">
      <h2 className="text-3xl font-bold text-gray-900 mb-8">Gäste</h2>

      <div className="grid gap-6">
        {guests.map((guest) => (
          <div key={guest.name} className="bg-white rounded-lg p-6 border border-gray-200 hover:shadow-md transition">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">{guest.name}</h3>
                  {guest.count >= 2 && (
                    <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" title="Wiederkehrender Gast" />
                  )}
                </div>
                <div className="space-y-1">
                  {guest.email && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Mail className="w-4 h-4" />
                      <a href={`mailto:${guest.email}`} className="hover:text-blue-600">{guest.email}</a>
                    </div>
                  )}
                  {guest.phone && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Phone className="w-4 h-4" />
                      <a href={`tel:${guest.phone}`} className="hover:text-blue-600">{guest.phone}</a>
                    </div>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-blue-600">{guest.count}</p>
                <p className="text-sm text-gray-600">Buchung{guest.count !== 1 ? 'en' : ''}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {guests.length === 0 && (
        <div className="bg-white rounded-lg p-12 border border-gray-200 text-center">
          <p className="text-gray-600 text-lg">Noch keine Gäste. Füge eine Buchung im Kalender hinzu.</p>
        </div>
      )}
    </div>
  );
}

export default GuestManagement;
