import { useState } from "react";
import { Mail } from "lucide-react";

interface Props {
  open: boolean;
  fromEmail: string;
  toEmail: string;
  summary: string; // z.B. "Wohnung Anne 2 · 12.08. – 19.08.2026"
  error?: string;
  onConfirm: () => Promise<void>;
  onSkip: () => void;
}

export function NotifyDialog({ open, fromEmail, toEmail, summary, error, onConfirm, onSkip }: Props) {
  const [sending, setSending] = useState(false);

  if (!open) return null;

  const handleConfirm = async () => {
    setSending(true);
    try {
      await onConfirm();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-200">
          <Mail className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-bold text-gray-900">Benachrichtigung senden?</h2>
        </div>

        <div className="px-6 py-5 space-y-3">
          <p className="text-sm text-gray-700">{summary}</p>
          <p className="text-sm text-gray-600">
            Diese Buchung liegt in den nächsten 10 Tagen. Soll eine Benachrichtigung von{" "}
            <span className="font-medium text-gray-900">{fromEmail || "–"}</span> an{" "}
            <span className="font-medium text-gray-900">{toEmail || "–"}</span> geschickt werden?
          </p>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3">{error}</div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onSkip}
            disabled={sending}
            className="px-4 py-2 text-sm font-semibold text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-lg transition disabled:opacity-50"
          >
            Nein
          </button>
          <button
            onClick={handleConfirm}
            disabled={sending}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50"
          >
            {sending ? "Sendet…" : "Ja, senden"}
          </button>
        </div>
      </div>
    </div>
  );
}
