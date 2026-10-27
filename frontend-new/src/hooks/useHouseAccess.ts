import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAllowedUsers } from "@/hooks/useAllowedUsers";
import { properties, houseIdOf } from "@/lib/properties";
import type { HouseId, Property } from "@/types";

// Welche Häuser darf das eingeloggte Konto sehen? Steht im allowedUsers-Dokument im
// Feld "houses" (z.B. ["upstalsboom"]). Fehlt das Feld oder ist es leer, sieht das
// Konto beide Häuser. Wirkt nur in der Oberfläche (Buchungen, Kalender, Gäste, …
// werden gefiltert) — eine harte Sperre auf Datenbank-Ebene wären die Security Rules.

export const ALL_HOUSES: HouseId[] = ["upstalsboom", "haus-anne"];
export const HOUSE_LABEL: Record<HouseId, Property["house"]> = { upstalsboom: "Upstalsboom", "haus-anne": "Haus Anne" };

export function useHouseAccess() {
  const { user } = useAuth();
  const { data: allowedUsers, isLoading } = useAllowedUsers();
  return useMemo(() => {
    const email = (user?.email ?? "").trim().toLowerCase();
    const entry = allowedUsers?.find((u) => u.email.toLowerCase() === email);
    // Solange die Liste lädt, nichts zeigen statt kurz das falsche Haus.
    const houses: HouseId[] = !allowedUsers ? [] : entry?.houses.length ? entry.houses : ALL_HOUSES;
    const allHouses = houses.length === ALL_HOUSES.length;
    const houseSet = new Set(houses);
    const canSeeProperty = (propertyId: string) => houseSet.has(houseIdOf(propertyId));
    return {
      houses,
      allHouses,
      // genau ein Haus → Umschalter ausblenden, dieses Haus fest vorauswählen
      onlyHouse: houses.length === 1 ? houses[0] : null,
      onlyHouseLabel: houses.length === 1 ? HOUSE_LABEL[houses[0]] : null,
      houseLabels: houses.map((h) => HOUSE_LABEL[h]),
      visibleProperties: properties.filter((p) => canSeeProperty(p.id)),
      canSeeProperty,
      isLoading,
    };
  }, [user, allowedUsers, isLoading]);
}
