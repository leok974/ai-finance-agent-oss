import * as React from 'react';
import { getMlStatus, mlSelftest } from '../lib/api';
import { emitToastSuccess, emitToastError } from '@/lib/toast-helpers';
import { useCoalescedRefresh } from '@/utils/refreshBus';
import CardHelpTooltip from './CardHelpTooltip';
import { getHelpBaseText } from '@/lib/helpBaseText';
import { t } from '@/lib/i18n';

type MlStatus = {
  classes?: string[];
  feedback_count?: number;
  updated_at?: string | null;
  details?: any;
};

export default function MLStatusCard() {
  const ok = emitToastSuccess; const err = emitToastError;
  const [status, setStatus] = React.useState<MlStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [running, setRunning] = React.useState(false);
  const [lastRunNote, setLastRunNote] = React.useState<string | null>(null);

  // Guards to prevent overlaps and interval duplication
  const busyRef = React.useRef(false);
  const intervalRef = React.useRef<number | ReturnType<typeof setInterval> | null>(null);
  const errorShownRef = React.useRef(false); // don't spam toasts

  async function load(opts?: { skipIfBusy?: boolean }) {
    if (opts?.skipIfBusy && (busyRef.current || document.hidden)) return;
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      setLoading(true);
      const s = await getMlStatus();
      setStatus(s || null);
      errorShownRef.current = false; // reset on success
    } catch (e: any) {
    if (!errorShownRef.current) {
  err(t('ui.toast.ml_refresh_failed', { error: e?.message ?? String(e) }));
        errorShownRef.current = true;
      }
    } finally {
      setLoading(false);
      busyRef.current = false;
    }
  }

  // Coalesced refresh (shared key prevents burst reloads)
  const scheduleMlStatusRefresh = useCoalescedRefresh('ml-status-refresh', () => load({ skipIfBusy: false }), 500);

  React.useEffect(() => {
    let id: any = null;
    const tick = () => load({ skipIfBusy: true });
    const start = () => { if (id) return; id = setInterval(tick, 6000); tick(); };
    const stop = () => { if (id) clearInterval(id); id = null; };
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVis);
    onVis(); // start if visible immediately
    return () => { document.removeEventListener('visibilitychange', onVis); stop(); };
  }, []);

  async function runSelftest() {
    try {
      setRunning(true);
      setLastRunNote(null);
      const t0 = performance.now();
      const res = await mlSelftest();
      const t1 = performance.now();
      const ms = Math.round(t1 - t0);

      const bumped = !!res?.mtime_bumped;
      const label = res?.label_used ?? '—';
      const txn = res?.used_txn_id ?? '—';
      const classes = (res?.classes_after ?? res?.classes_before ?? []).join(', ') || '—';

      const msg = bumped
        ? t('ui.toast.ml_selftest_ok', { ms, label, txn, classes })
        : t('ui.toast.ml_selftest_no_bump');

      setLastRunNote(
        bumped
          ? `mtime: ${res?.mtime_before ?? '∅'} → ${res?.mtime_after ?? '∅'}`
          : `no mtime bump; reason: ${res?.reason ?? 'unknown'}`
      );
  bumped ? ok(msg) : err(msg);

  // Coalesced status refresh to avoid back-to-back polling and selftest
  scheduleMlStatusRefresh();
    } catch (e: any) {
      err(t('ui.toast.ml_selftest_failed', { error: e?.message ?? String(e) }));
      setLastRunNote('request failed');
    } finally {
      setRunning(false);
      // auto-clear inline note
      setTimeout(() => setLastRunNote(null), 4500);
    }
  }

  const classesText =
    status?.classes && status.classes.length > 0 ? status.classes.join(', ') : '—';

  return (
  <div
    className="panel-tight md:p-5 lg:p-6 help-spot"
    data-explain-key="cards.ml_status"
  data-help-key="cards.ml_status"
  data-help-id="ml"
  >
      <div className="flex items-center justify-between border-b border-border pb-1">
  <h3 className="text-sm font-medium flex items-center">{t('ui.ml.title')} <CardHelpTooltip cardId="cards.ml_status" ctx={{ status }} baseText={getHelpBaseText('cards.ml_status')} className="ml-2" /></h3>
        <button
          className="text-xs opacity-80 hover:opacity-100"
          onClick={scheduleMlStatusRefresh}
          disabled={loading}
          title={t('ui.ml.refresh')}
        >
          {loading ? t('ui.ml.refreshing') : t('ui.ml.refresh')}
        </button>
      </div>

      <div className="mt-2 text-sm space-y-1">
        <div>
          <span className="opacity-70">{t('ui.ml.classes')}</span> <span>{classesText}</span>
        </div>
        <div>
          <span className="opacity-70">{t('ui.ml.feedback_count')}</span>{' '}
          <span>{status?.feedback_count ?? '—'}</span>
        </div>
        <div>
          <span className="opacity-70">{t('ui.ml.updated')}</span>{' '}
          <span>{status?.updated_at ?? '—'}</span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <button
          onClick={runSelftest}
          disabled={running}
          className="px-3 py-2 text-sm rounded-xl border border-border hover:opacity-90 disabled:opacity-50"
          title={t('ui.ml.selftest_run_title')}
        >
          {running ? t('ui.ml.selftest_running') : t('ui.ml.selftest_run')}
        </button>
        {lastRunNote && (
          <span className="text-xs text-muted-foreground">{lastRunNote}</span>
        )}
      </div>
    </div>
  );
}
