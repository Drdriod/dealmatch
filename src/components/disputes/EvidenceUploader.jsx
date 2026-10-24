import { useId, useState } from 'react';
import { FileText, Loader2, Paperclip, X } from 'lucide-react';
import { EVIDENCE_LIMITS } from '@/lib/disputeStates';
import { uploadEvidence, validateEvidenceFile } from '@/data/disputesRepository';
import { btnSecondary } from '@/components/ui/styles';
import { InlineError } from '@/components/ui/StateBlock';

// Controlled. Paths are stored in the private dispute-evidence bucket under the uploader's folder.
export default function EvidenceUploader({ userId, paths, onChange, existingCount = 0, disabled = false }) {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const room = EVIDENCE_LIMITS.maxFiles - existingCount - paths.length;

  async function onPick(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    if (files.length > room) return setError(`You can add ${Math.max(room, 0)} more file(s).`);
    const bad = files.map(validateEvidenceFile).find(Boolean);
    if (bad) return setError(bad);
    setBusy(true);
    setError(null);
    try {
      const added = [];
      for (const f of files) added.push({ path: await uploadEvidence(f, userId) });
      onChange([...paths, ...added.map((a) => a.path)]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const nameOf = (p) => p.split('/').pop().replace(/^[0-9a-f-]{36}-/, '');

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="text-sm font-semibold">
        Evidence <span className="font-normal text-warm">(photos or PDF, up to 10 MB each)</span>
      </label>
      <div>
        <label htmlFor={inputId} className={`${btnSecondary} cursor-pointer ${disabled || busy || room <= 0 ? 'pointer-events-none opacity-50' : ''}`}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Paperclip className="h-4 w-4" aria-hidden="true" />}
          Add files
        </label>
        <input id={inputId} type="file" multiple accept={EVIDENCE_LIMITS.types.join(',')} className="sr-only" onChange={onPick} disabled={disabled || busy || room <= 0} />
      </div>
      <InlineError message={error} />
      {paths.length > 0 && (
        <ul className="space-y-1">
          {paths.map((p) => (
            <li key={p} className="flex items-center justify-between gap-2 rounded-lg bg-cream px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-warm" aria-hidden="true" />
                <span className="truncate">{nameOf(p)}</span>
              </span>
              <button type="button" aria-label={`Remove ${nameOf(p)}`} onClick={() => onChange(paths.filter((x) => x !== p))} className="rounded p-1 text-warm hover:text-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
