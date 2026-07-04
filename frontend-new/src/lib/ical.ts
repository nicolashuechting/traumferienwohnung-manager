// Minimal iCal (RFC 5545) parser — extracts VEVENT blocks
// Handles DATE (YYYYMMDD) and DATETIME (YYYYMMDDTHHMMSSZ / local) formats

export interface IcalEvent {
  uid: string;
  summary: string;
  description: string;
  dtstart: string; // "YYYY-MM-DD"
  dtend: string;   // "YYYY-MM-DD"
}

function parseDate(value: string): string {
  // Strip any TZID prefix or VALUE=DATE param  →  take the raw value after ":"
  const raw = value.includes(":") ? value.split(":").pop()! : value;
  const s = raw.trim();
  if (s.length >= 8) {
    const y = s.slice(0, 4);
    const m = s.slice(4, 6);
    const d = s.slice(6, 8);
    return `${y}-${m}-${d}`;
  }
  return "";
}

export function parseIcal(text: string): IcalEvent[] {
  // Unfold lines (RFC 5545 line folding: CRLF + space/tab)
  const unfolded = text.replace(/\r\n[ \t]/g, "").replace(/\r/g, "");
  const lines = unfolded.split("\n");

  const events: IcalEvent[] = [];
  let inEvent = false;
  let cur: Partial<IcalEvent> = {};

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "BEGIN:VEVENT") { inEvent = true; cur = {}; continue; }
    if (line === "END:VEVENT") {
      if (cur.uid && cur.dtstart && cur.dtend) {
        events.push({
          uid: cur.uid,
          summary: cur.summary ?? "",
          description: cur.description ?? "",
          dtstart: cur.dtstart,
          dtend: cur.dtend,
        });
      }
      inEvent = false;
      continue;
    }
    if (!inEvent) continue;

    // Split at first ":"
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key  = line.slice(0, colon).toUpperCase();
    const val  = line.slice(colon + 1);

    // Key may have params like DTSTART;TZID=Europe/Berlin — take base key
    const baseKey = key.split(";")[0];

    if (baseKey === "UID")         cur.uid         = val.trim();
    if (baseKey === "SUMMARY")     cur.summary     = val.trim();
    if (baseKey === "DESCRIPTION") cur.description = val.trim();
    if (baseKey === "DTSTART")     cur.dtstart     = parseDate(line);
    if (baseKey === "DTEND")       cur.dtend       = parseDate(line);
  }

  return events;
}

// CORS proxy — required because browsers block cross-origin iCal fetches.
// corsproxy.io is a reliable free proxy; for production use Firebase Cloud Functions instead.
const PROXY = "https://corsproxy.io/?url=";

export async function fetchIcal(url: string): Promise<IcalEvent[]> {
  const proxyUrl = `${PROXY}${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status} beim Abrufen von ${url}`);
  const text = await res.text();
  return parseIcal(text);
}
