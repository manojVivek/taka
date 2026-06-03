'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { originOf, normalizeOrigin, truncateId } from '@/lib/utils';
import { Ico } from '@/components/taka/Icons';
import { Button, IconButton } from '@/components/taka/Button';
import { Input } from '@/components/taka/Input';

interface Props {
  projectId: string;
  sessionId: string;
  /** The session's recorded URL — used to prefill the default (same-origin) target. */
  sessionUrl: string;
  /** Optional human label (title) shown in the dialog header. */
  sessionLabel?: string;
  onClose: () => void;
  onStarted: (testId: string) => void;
}

// Replay-target dialog: pick the origin a recorded session is replayed against.
// Defaults to the recorded origin (same-origin replay); point it at a preview /
// staging deployment to validate that environment against the baseline.
export function ReplayDialog({
  projectId,
  sessionId,
  sessionUrl,
  sessionLabel,
  onClose,
  onStarted,
}: Props) {
  const recordedOrigin = originOf(sessionUrl);
  const [target, setTarget] = useState(recordedOrigin);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const normalized = normalizeOrigin(target);
  const crossOrigin = normalized.ok && normalized.origin !== recordedOrigin;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!normalized.ok) {
      setErr(normalized.error);
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const { testId } = await api.replaySession(projectId, sessionId, {
        targetOrigin: normalized.origin,
      });
      onStarted(testId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed to start replay');
      setSubmitting(false);
    }
  };

  return (
    <div className="tk-modal-backdrop" onClick={onClose}>
      <form className="tk-modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="tk-panel-head">
          <h3>// replay session</h3>
          <div className="right">
            <IconButton type="button" onClick={onClose}>
              <Ico.X className="h-3 w-3" />
            </IconButton>
          </div>
        </div>

        <div className="flex flex-col gap-4 p-5">
          <div className="text-dim text-[11px]">
            {sessionLabel ? (
              <span className="text-fg">{sessionLabel}</span>
            ) : (
              <span className="text-fg">session {truncateId(sessionId, 10)}</span>
            )}
            <span className="text-border mx-2">·</span>
            recorded on <span className="text-mid">{recordedOrigin}</span>
          </div>

          <div>
            <label className="text-dim mb-1.5 block text-[11px] uppercase tracking-[0.18em]">
              // target origin
            </label>
            <Input
              leading={<Ico.External className="ico" />}
              value={target}
              onChange={e => {
                setTarget(e.target.value);
                setErr(null);
              }}
              placeholder="https://preview-xyz.vercel.app"
              autoFocus
              spellCheck={false}
              wrapperStyle={{ width: '100%' }}
            />
            <div className="text-dim mt-1.5 text-[11px]">
              replay against a preview URL — defaults to where it was recorded. same-origin
              requests are rebased onto this origin; third-party URLs are left as recorded.
            </div>
            {crossOrigin && (
              <div className="text-blue mt-1.5 text-[11px]">
                ● cross-origin replay → {normalized.origin}
              </div>
            )}
            {err && <div className="text-diff-r mt-1.5 text-[11px]">{err}</div>}
          </div>
        </div>

        <div className="border-border bg-panel-2 flex justify-end gap-2 border-t px-4 py-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            cancel
          </Button>
          <Button type="submit" variant="primary" disabled={submitting || !normalized.ok}>
            <Ico.Play className="ico" />
            {submitting ? 'starting…' : 'replay'}
          </Button>
        </div>
      </form>
    </div>
  );
}
