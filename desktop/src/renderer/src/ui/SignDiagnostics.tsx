import { useEffect, type JSX } from 'react';

import { t, type TranslationKey } from '@/i18n';
import { loopTrace, type CycleTrace } from '@/services/recognition/eventLoopTrace';
import {
  observeLongTasks,
  subscribeInp,
  shortTarget,
  toInpReading,
  type InpReading,
} from '@/services/recognition/perfMonitor';
import {
  getRecognitionThread,
  setRecognitionThread,
} from '@/services/recognition/recognitionThread';
import { DEFAULT_THRESHOLD } from '@/services/recognition/SignClassifier';
import type { RecognitionThread } from '@/services/recognition/windowModels';
import { useSignDiagnostics, type RecognitionExecution } from '@/store/signDiagnostics';
import { Button } from '@/ui/Button';

import styles from './ui.module.css';

const NEUTRAL = 'neutral';
const percent = (p: number): string => `${Math.round(p * 100)} %`;
/** Duraciones de un ciclo: con décimas, porque los pasos se separan por menos de 1 ms. */
const preciseMs = (value: number): string =>
  value > 0 && value < 0.1 ? '< 0,1 ms' : `${value.toFixed(1).replace('.', ',')} ms`;
/** INP y long tasks: ms enteros. */
const ms = (value: number): string => `${Math.round(value)} ms`;

const threadOf = (execution: RecognitionExecution | null): RecognitionThread =>
  execution === null ? getRecognitionThread() : execution === 'main' ? 'main' : 'worker';

/**
 * Mientras el panel está montado: traza del event loop, long tasks e INP. El INP se atribuye
 * al modo en que corre la GRU (si el worker no arrancó, al hilo principal).
 */
function usePerformanceProbes(): void {
  useEffect(() => {
    const store = useSignDiagnostics.getState();
    const disconnectTrace = loopTrace.connect((trace) => store.setTrace(trace));
    const stopLongTasks = observeLongTasks((tasks) => store.addLongTasks(tasks));
    const stopInp = subscribeInp((metric) =>
      store.setInp(toInpReading(metric, threadOf(useSignDiagnostics.getState().execution))),
    );
    return () => {
      disconnectTrace();
      stopLongTasks();
      stopInp();
    };
  }, []);
}

function Probabilities({ names }: Readonly<{ names: Readonly<Record<string, string>> }>) {
  const probabilities = useSignDiagnostics((s) => s.probabilities);
  const rows = Object.entries(probabilities ?? {}).sort((a, b) => b[1] - a[1]);
  const [top] = rows;
  const label = (code: string): string =>
    code === NEUTRAL ? t('diagnostics.neutral') : (names[code] ?? code);

  let verdict: string | null = null;
  if (top) {
    if (top[0] === NEUTRAL) verdict = t('diagnostics.verdictNeutral');
    else if (top[1] >= DEFAULT_THRESHOLD) verdict = t('diagnostics.verdictAbove');
    else verdict = t('diagnostics.verdictBelow', { threshold: percent(DEFAULT_THRESHOLD) });
  }

  return (
    <div className={styles.diagnosticsBlock}>
      <h3 className={styles.diagnosticsSubtitle}>{t('diagnostics.probabilitiesTitle')}</h3>
      {rows.length ? (
        <>
          <ul className={styles.diagnosticsList} aria-label={t('diagnostics.probabilitiesTitle')}>
            {rows.map(([code, p]) => (
              <li key={code}>
                <span className={styles.diagnosticsRow}>
                  <span>{label(code)}</span>
                  <span>{percent(p)}</span>
                </span>
                <span className={styles.diagnosticsTrack} aria-hidden>
                  <span className={styles.diagnosticsBar} style={{ width: `${p * 100}%` }} />
                  <span
                    className={styles.diagnosticsThreshold}
                    style={{ left: `${DEFAULT_THRESHOLD * 100}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
          <p className={styles.diagnosticsHint}>{verdict}</p>
        </>
      ) : (
        <p className={styles.diagnosticsHint}>{t('diagnostics.idle')}</p>
      )}
    </div>
  );
}

const EXECUTION_KEY: Record<RecognitionExecution, TranslationKey> = {
  main: 'diagnostics.execution.main',
  'worker-shared': 'diagnostics.execution.workerShared',
  'worker-message': 'diagnostics.execution.workerMessage',
};

function ThreadInfo({ onSwitch }: Readonly<{ onSwitch: (thread: RecognitionThread) => void }>) {
  const execution = useSignDiagnostics((s) => s.execution);
  const thread = threadOf(execution);
  const other: RecognitionThread = thread === 'main' ? 'worker' : 'main';
  return (
    <div className={styles.diagnosticsBlock}>
      <h3 className={styles.diagnosticsSubtitle}>{t('diagnostics.threadTitle')}</h3>
      <dl className={styles.diagnosticsFacts}>
        <dt>{t('diagnostics.isolated')}</dt>
        <dd>{t(globalThis.crossOriginIsolated ? 'diagnostics.yes' : 'diagnostics.no')}</dd>
        <dt>{t('diagnostics.execution')}</dt>
        <dd>{t(execution ? EXECUTION_KEY[execution] : 'diagnostics.execution.loading')}</dd>
      </dl>
      <Button
        variant="secondary"
        label={t(other === 'main' ? 'diagnostics.useMain' : 'diagnostics.useWorker')}
        onClick={() => onSwitch(other)}
      />
      <p className={styles.diagnosticsHint}>{t('diagnostics.switchHint')}</p>
    </div>
  );
}

function EventLoop({ trace }: Readonly<{ trace: CycleTrace | null }>) {
  return (
    <div className={styles.diagnosticsBlock}>
      <h3 className={styles.diagnosticsSubtitle}>{t('diagnostics.loopTitle')}</h3>
      {trace ? (
        <>
          <ol className={styles.diagnosticsSteps} aria-label={t('diagnostics.loopTitle')}>
            {trace.steps.map((step, i) => (
              <li key={`${step.id}-${i}`} className={styles.diagnosticsStep} data-kind={step.kind}>
                <span>{t(`diagnostics.step.${step.id}` as const)}</span>
                <span className={styles.diagnosticsMeta}>
                  <span className={styles.diagnosticsKind}>
                    {t(`diagnostics.kind.${step.kind}` as const)}
                  </span>
                  <span>+{preciseMs(step.start)}</span>
                  {step.duration > 0 ? <span>{preciseMs(step.duration)}</span> : null}
                </span>
              </li>
            ))}
          </ol>
          <p className={styles.diagnosticsHint}>
            {t('diagnostics.loopTotal', { ms: preciseMs(trace.total) })}
          </p>
        </>
      ) : (
        <p className={styles.diagnosticsHint}>{t('diagnostics.loopIdle')}</p>
      )}
    </div>
  );
}

function LongTasks() {
  const stats = useSignDiagnostics((s) => s.longTasks);
  return (
    <div className={styles.diagnosticsBlock}>
      <h3 className={styles.diagnosticsSubtitle}>{t('diagnostics.longTitle')}</h3>
      {stats.count ? (
        <dl className={styles.diagnosticsFacts}>
          <dt>{t('diagnostics.longCount')}</dt>
          <dd>{stats.count}</dd>
          <dt>{t('diagnostics.longWorst')}</dt>
          <dd>{ms(stats.worstMs)}</dd>
          <dt>{t('diagnostics.longTotal')}</dt>
          <dd>{ms(stats.totalMs)}</dd>
          <dt>{t('diagnostics.longRecent')}</dt>
          <dd>{stats.recent.map((task) => ms(task.duration)).join(' · ')}</dd>
        </dl>
      ) : (
        <p className={styles.diagnosticsHint}>{t('diagnostics.longNone')}</p>
      )}
    </div>
  );
}

const inpText = (r: InpReading | undefined): string =>
  r
    ? `${ms(r.value)} (${t(`diagnostics.rating.${r.rating}` as const)})`
    : t('diagnostics.inpMissing');

function Inp() {
  const inp = useSignDiagnostics((s) => s.inp);
  const byThread = useSignDiagnostics((s) => s.inpByThread);
  return (
    <div className={styles.diagnosticsBlock}>
      <h3 className={styles.diagnosticsSubtitle}>{t('diagnostics.inpTitle')}</h3>
      {inp ? (
        <>
          <p className={styles.diagnosticsValue}>{inpText(inp)}</p>
          <dl className={styles.diagnosticsFacts}>
            <dt>{t('diagnostics.inpTarget')}</dt>
            <dd className={styles.diagnosticsCode} title={inp.target ?? undefined}>
              {shortTarget(inp.target)}
            </dd>
            <dt>{t('diagnostics.inpInputDelay')}</dt>
            <dd>{ms(inp.inputDelay)}</dd>
            <dt>{t('diagnostics.inpProcessing')}</dt>
            <dd>{ms(inp.processingDuration)}</dd>
            <dt>{t('diagnostics.inpPresentation')}</dt>
            <dd>{ms(inp.presentationDelay)}</dd>
          </dl>
        </>
      ) : (
        <p className={styles.diagnosticsHint}>{t('diagnostics.inpIdle')}</p>
      )}
      <h4 className={styles.diagnosticsSubtitle}>{t('diagnostics.inpCompare')}</h4>
      <dl className={styles.diagnosticsFacts} aria-label={t('diagnostics.inpCompare')}>
        <dt>{t('diagnostics.inpMain')}</dt>
        <dd>{inpText(byThread.main)}</dd>
        <dt>{t('diagnostics.inpWorker')}</dt>
        <dd>{inpText(byThread.worker)}</dd>
      </dl>
    </div>
  );
}

const reloadWith = (thread: RecognitionThread): void => {
  setRecognitionThread(thread);
  window.location.reload();
};

/**
 * Panel de diagnóstico (solo desarrollo): qué ve el modelo, en qué hilo corre, el orden de
 * ejecución en el event loop y lo que cuesta al hilo principal (long tasks e INP).
 */
export function SignDiagnostics({
  names,
  onSwitchThread = reloadWith,
}: Readonly<{
  names: Readonly<Record<string, string>>;
  onSwitchThread?: (thread: RecognitionThread) => void;
}>): JSX.Element {
  usePerformanceProbes();
  const trace = useSignDiagnostics((s) => s.trace);
  return (
    <section className={styles.diagnostics} aria-labelledby="diagnostics-title">
      <h2 className={styles.diagnosticsTitle} id="diagnostics-title">
        {t('diagnostics.title')}
      </h2>
      <Probabilities names={names} />
      <ThreadInfo onSwitch={onSwitchThread} />
      <EventLoop trace={trace} />
      <LongTasks />
      <Inp />
    </section>
  );
}
