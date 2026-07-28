import type { PriceGroupId } from "@/types";

// Zuordnung Wohnung → Preisgruppe. Kamin/Terrasse teilen sich je eine Preisgruppe
// (identische Preise laut Baltrumdirekt), jede Anne-Wohnung hat ihre eigene.
const PROPERTY_TO_GROUP: Record<string, PriceGroupId> = {
  "ups-2": "kamin",
  "ups-6": "kamin",
  "ups-7": "kamin",
  "ups-3": "terrasse",
  "ups-4": "terrasse",
  "ups-5": "terrasse",
  "anne-1": "anne-1",
  "anne-2": "anne-2",
  "anne-3": "anne-3",
  "anne-4": "anne-4",
  "anne-5": "anne-5",
};

export function priceGroupOf(propertyId: string): PriceGroupId | undefined {
  return PROPERTY_TO_GROUP[propertyId];
}

export const PRICE_GROUP_LABELS: Record<PriceGroupId, string> = {
  kamin: "Kamin (Upstalsboom 2, 6, 7)",
  terrasse: "Terrasse (Upstalsboom 3, 4, 5)",
  "anne-1": "Anne 1",
  "anne-2": "Anne 2",
  "anne-3": "Anne 3",
  "anne-4": "Anne 4",
  "anne-5": "Anne 5",
};

export const PRICE_GROUP_ORDER: PriceGroupId[] = [
  "kamin", "terrasse", "anne-1", "anne-2", "anne-3", "anne-4", "anne-5",
];
