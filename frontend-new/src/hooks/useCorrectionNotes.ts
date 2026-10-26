import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, arrayUnion } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useAllowedUsers } from "@/hooks/useAllowedUsers";
import { INVOICE_TEST_MODE, houseIdOf } from "@/lib/invoice";
import type { Booking, CorrectionNote } from "@/types";

const COLLECTION = "correctionNotes";

function toISO(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "toDate" in v) return (v as { toDate: () => Date }).toDate().toISOString();
  return "";
}

async function fetchNotes(): Promise<CorrectionNote[]> {
  const snap = await getDocs(collection(db, COLLECTION));
  return snap.docs
    .map((d) => {
      const r = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        booking_id: String(r.booking_id ?? ""),
        booking_number: String(r.booking_number ?? ""),
        house_id: (r.house_id ?? "haus-anne") as CorrectionNote["house_id"],
        guest_name: String(r.guest_name ?? ""),
        text: String(r.text ?? ""),
        changes: Array.isArray(r.changes) ? (r.changes as string[]) : [],
        source: (r.source === "manuell" ? "manuell" : "sperre") as CorrectionNote["source"],
        status: (r.status === "erledigt" ? "erledigt" : "offen") as CorrectionNote["status"],
        created_at: toISO(r.created_at),
        created_by: String(r.created_by ?? ""),
        created_by_name: String(r.created_by_name ?? ""),
        resolved_at: r.resolved_at ? toISO(r.resolved_at) : null,
        resolved_by: r.resolved_by ? String(r.resolved_by) : null,
        resolution_note: String(r.resolution_note ?? ""),
        test: Boolean(r.test),
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function useCorrectionNotes() {
  return useQuery({ queryKey: ["correctionNotes"], queryFn: fetchNotes });
}

// Anzeigename des angemeldeten Nutzers (aus allowedUsers), sonst die E-Mail.
function useMyName() {
  const { data: users = [] } = useAllowedUsers();
  const email = (auth.currentUser?.email ?? "").toLowerCase();
  return users.find((u) => u.email.toLowerCase() === email)?.displayName || email;
}

export function useCreateCorrectionNote() {
  const qc = useQueryClient();
  const myName = useMyName();
  return useMutation({
    mutationFn: async ({ booking, text, source }: { booking: Booking; text: string; source: CorrectionNote["source"] }) => {
      const ref = await addDoc(collection(db, COLLECTION), {
        booking_id: booking.id,
        booking_number: booking.booking_number,
        house_id: houseIdOf(booking.property_id),
        guest_name: booking.guest_name,
        text: text.trim(),
        changes: [],
        source,
        status: "offen",
        created_at: serverTimestamp(),
        created_by: auth.currentUser?.email ?? "",
        created_by_name: myName,
        resolved_at: null,
        resolved_by: null,
        resolution_note: "",
        test: INVOICE_TEST_MODE,
      });
      return ref.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["correctionNotes"] }),
  });
}

// Hängt die beim Speichern tatsächlich geänderten Felder an eine Notiz an.
export async function appendNoteChanges(noteId: string, changes: string[]) {
  if (changes.length === 0) return;
  await updateDoc(doc(db, COLLECTION, noteId), { changes: arrayUnion(...changes) });
}

export function useResolveCorrectionNote() {
  const qc = useQueryClient();
  const myName = useMyName();
  return useMutation({
    mutationFn: async ({ id, resolutionNote }: { id: string; resolutionNote: string }) => {
      await updateDoc(doc(db, COLLECTION, id), {
        status: "erledigt",
        resolved_at: serverTimestamp(),
        resolved_by: myName,
        resolution_note: resolutionNote.trim(),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["correctionNotes"] }),
  });
}

// Nur für Testnotizen (Sicherheitsregel erlaubt Löschen nur bei test == true).
export function useDeleteTestNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => deleteDoc(doc(db, COLLECTION, id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["correctionNotes"] }),
  });
}
