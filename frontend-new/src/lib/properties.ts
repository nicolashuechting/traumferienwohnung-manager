import type { HouseId, Property } from "@/types";

export const properties: Property[] = [
  { id: "ups-2", name: "Upstalsboom 2", house: "Upstalsboom", allowsDogs: true },
  { id: "ups-3", name: "Upstalsboom 3", house: "Upstalsboom", allowsDogs: true },
  { id: "ups-4", name: "Upstalsboom 4", house: "Upstalsboom", allowsDogs: true },
  { id: "ups-5", name: "Upstalsboom 5", house: "Upstalsboom", allowsDogs: true },
  { id: "ups-6", name: "Upstalsboom 6", house: "Upstalsboom", allowsDogs: true },
  { id: "ups-7", name: "Upstalsboom 7", house: "Upstalsboom", allowsDogs: true },
  { id: "anne-1", name: "Anne 1", house: "Haus Anne", allowsDogs: true },
  { id: "anne-2", name: "Anne 2", house: "Haus Anne", allowsDogs: false },
  { id: "anne-3", name: "Anne 3", house: "Haus Anne", allowsDogs: true },
  { id: "anne-4", name: "Anne 4", house: "Haus Anne", allowsDogs: false },
  { id: "anne-5", name: "Anne 5", house: "Haus Anne", allowsDogs: false },
];

// Haus-Schlüssel zu einer Wohnung, z.B. "anne-3" → "haus-anne". Wird für Rechnungsnummern,
// Ablageordner und die nach Haus getrennten Gast-Profile verwendet.
export function houseIdOf(propertyId: string): HouseId {
  return properties.find((p) => p.id === propertyId)?.house === "Haus Anne" ? "haus-anne" : "upstalsboom";
}
