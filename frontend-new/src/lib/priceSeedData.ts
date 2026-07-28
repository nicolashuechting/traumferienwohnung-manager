import type { PriceGroupSettings } from "@/types";

// Echte Werte aus den Baltrumdirekt-Preislisten/Saisonzeiten-PDFs (Stand 2026).
// Wird nur einmalig genutzt, um leere priceSettings-Dokumente zu befüllen —
// danach ausschließlich über die Einstellungsseite pflegen.

// Kamin & Terrasse teilen sich je einen Satz Zeiträume (identisch für beide
// Gruppen), nur die Preise unterscheiden sich.
const UPS_2026_RANGES = {
  winter: [
    { start: "2026-01-05", end: "2026-03-20" },
    { start: "2026-04-12", end: "2026-04-30" },
    { start: "2026-05-18", end: "2026-05-22" },
    { start: "2026-11-01", end: "2026-12-22" },
    { start: "2027-01-05", end: "2027-03-19" },
    { start: "2027-04-05", end: "2027-04-30" },
  ],
  erste_woche: [
    { start: "2026-03-21", end: "2026-03-27" },
    { start: "2026-05-01", end: "2026-05-12" },
    { start: "2026-12-23", end: "2026-12-27" },
  ],
  neben: [
    { start: "2026-03-28", end: "2026-04-11" },
    { start: "2026-05-28", end: "2026-07-03" },
    { start: "2026-09-01", end: "2026-10-31" },
    { start: "2026-12-28", end: "2027-01-04" },
    { start: "2027-03-20", end: "2027-04-04" },
  ],
  haupt: [
    { start: "2026-05-13", end: "2026-05-17" },
    { start: "2026-05-23", end: "2026-05-27" },
    { start: "2026-07-04", end: "2026-08-31" },
  ],
};

const kamin: PriceGroupSettings = {
  id: "kamin",
  maxPersons: 5,
  flatRate: false,
  cleaningFee: 60,
  extraFees: [],
  dogFee: 30,
  years: [{
    year: 2026,
    seasons: [
      { id: "winter", label: "Winter", dateRanges: UPS_2026_RANGES.winter, pricePerPerson: { 1: 65, 2: 70, 3: 70, 4: 70, 5: 75 } },
      { id: "erste_woche", label: "1. Woche", dateRanges: UPS_2026_RANGES.erste_woche, pricePerPerson: { 1: 82, 2: 92, 3: 92, 4: 92, 5: 97 } },
      { id: "neben", label: "Neben-Saison", dateRanges: UPS_2026_RANGES.neben, pricePerPerson: { 1: 92, 2: 102, 3: 102, 4: 102, 5: 107 } },
      { id: "haupt", label: "Haupt-Saison", dateRanges: UPS_2026_RANGES.haupt, pricePerPerson: { 1: 137, 2: 137, 3: 137, 4: 137, 5: 142 } },
    ],
  }],
};

const terrasse: PriceGroupSettings = {
  id: "terrasse",
  maxPersons: 4,
  flatRate: false,
  cleaningFee: 60,
  extraFees: [],
  dogFee: 30,
  years: [{
    year: 2026,
    seasons: [
      { id: "winter", label: "Winter", dateRanges: UPS_2026_RANGES.winter, pricePerPerson: { 1: 50, 2: 55, 3: 60, 4: 65 } },
      { id: "erste_woche", label: "1. Woche", dateRanges: UPS_2026_RANGES.erste_woche, pricePerPerson: { 1: 67, 2: 72, 3: 77, 4: 82 } },
      { id: "neben", label: "Neben-Saison", dateRanges: UPS_2026_RANGES.neben, pricePerPerson: { 1: 72, 2: 82, 3: 87, 4: 92 } },
      { id: "haupt", label: "Haupt-Saison", dateRanges: UPS_2026_RANGES.haupt, pricePerPerson: { 1: 112, 2: 112, 3: 117, 4: 122 } },
    ],
  }],
};

// Anne: gleiche Zeiträume für alle 5 Wohnungen, aber "Winter 26/27" bzw.
// "Winter 27/28" sind PREISLICH eigene Stufen (nicht identisch mit "Winter"!),
// daher als eigene Saison geführt statt in "winter" gemerged.
const ANNE_RANGES_2026 = {
  winter: [{ start: "2026-01-05", end: "2026-03-31" }, { start: "2026-11-01", end: "2026-12-20" }],
  neben: [{ start: "2026-04-01", end: "2026-06-30" }, { start: "2026-09-14", end: "2026-10-31" }],
  haupt: [{ start: "2026-07-01", end: "2026-09-13" }],
  winter_uebergang: [{ start: "2026-12-21", end: "2027-01-03" }],
};
const ANNE_RANGES_2027 = {
  winter: [{ start: "2027-01-04", end: "2027-03-31" }, { start: "2027-11-01", end: "2027-12-19" }],
  neben: [{ start: "2027-04-01", end: "2027-06-30" }, { start: "2027-09-13", end: "2027-10-31" }],
  haupt: [{ start: "2027-07-01", end: "2027-09-12" }],
  winter_uebergang: [{ start: "2027-12-20", end: "2028-01-09" }],
};

function annePricePerPerson(maxPersons: number, value: number): Record<number, number> {
  const m: Record<number, number> = {};
  for (let p = 1; p <= maxPersons; p++) m[p] = value;
  return m;
}

function anneGroup(
  id: PriceGroupSettings["id"],
  maxPersons: number,
  winterUebergang26_27: number,
  winterUebergang27_28: number,
): PriceGroupSettings {
  return {
    id,
    maxPersons,
    flatRate: true,
    cleaningFee: 70,
    extraFees: [{ label: "Wäschepaket", amount: 10, perPerson: true }],
    dogFee: 30,
    years: [
      {
        year: 2026,
        seasons: [
          { id: "winter", label: "Winter 26", dateRanges: ANNE_RANGES_2026.winter, pricePerPerson: annePricePerPerson(maxPersons, 90) },
          { id: "neben", label: "Nebensaison 26", dateRanges: ANNE_RANGES_2026.neben, pricePerPerson: annePricePerPerson(maxPersons, 125) },
          { id: "haupt", label: "Hauptsaison 26", dateRanges: ANNE_RANGES_2026.haupt, pricePerPerson: annePricePerPerson(maxPersons, 160) },
          { id: "winter_uebergang", label: "Winter 26/27", dateRanges: ANNE_RANGES_2026.winter_uebergang, pricePerPerson: annePricePerPerson(maxPersons, winterUebergang26_27) },
        ],
      },
      {
        year: 2027,
        seasons: [
          { id: "winter", label: "Winter 27", dateRanges: ANNE_RANGES_2027.winter, pricePerPerson: annePricePerPerson(maxPersons, 90) },
          { id: "neben", label: "Nebensaison 27", dateRanges: ANNE_RANGES_2027.neben, pricePerPerson: annePricePerPerson(maxPersons, 125) },
          { id: "haupt", label: "Hauptsaison 27", dateRanges: ANNE_RANGES_2027.haupt, pricePerPerson: annePricePerPerson(maxPersons, 160) },
          { id: "winter_uebergang", label: "Winter 27/28", dateRanges: ANNE_RANGES_2027.winter_uebergang, pricePerPerson: annePricePerPerson(maxPersons, winterUebergang27_28) },
        ],
      },
    ],
  };
}

// Winter-Übergang-Werte: anne-1 "Winter 27/28" hat im PDF für die 3-Personen-Spalte
// einen offensichtlichen Tippfehler ("120500,00" statt vermutlich "125,00") — auf
// Basis der übrigen 3 Spalten (je 125,00) mit 125 angenommen. Bitte in den
// Preiseinstellungen gegenprüfen.
export const PRICE_SEED_DATA: PriceGroupSettings[] = [
  kamin,
  terrasse,
  anneGroup("anne-1", 4, 125, 125),
  anneGroup("anne-2", 5, 125, 120),
  anneGroup("anne-3", 5, 125, 120),
  anneGroup("anne-4", 4, 125, 125),
  anneGroup("anne-5", 4, 125, 120),
];
