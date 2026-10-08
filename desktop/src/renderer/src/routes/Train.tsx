import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { apiErrorStatus } from '@/api/client';
import { modelsApi, SAMPLES_KEY, samplesApi } from '@/api/endpoints';
import { usePhrases } from '@/api/usePhrases';
import { useSignRecognition } from '@/hooks/useSignRecognition';
import { t } from '@/i18n';
import {
  BURSTS_PER_SESSION,
  BurstRecorder,
  type BurstEvent,
  type BurstOptions,
} from '@/services/training/burstRecorder';
import { isTraining, useSignModel } from '@/store/signModel';
import { Button } from '@/ui/Button';

import styles from './routes.module.css';
import train from './train.module.css';

export const MIN_SAMPLES = 20;
const NEUTRAL = 'neutral';
const LOW_ACCURACY = 0.8;

type Timing = Pick<BurstOptions, 'countdownSeconds' | 'pauseMs'>;
type Session = { label: string; message: string };

const pct = (v: number) => String(Math.round(v * 100));

export default function Train({ timing }: { timing?: Timing }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const queryClient = useQueryClient();
  const { data: phrases } = usePhrases();
  const { data: summary } = useQuery({ queryKey: SAMPLES_KEY, queryFn: samplesApi.summary });
  const model = useSignModel(
    useShallow((s) => ({ status: s.status, metrics: s.metrics, job: s.job })),
  );
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const recorderRef = useRef<BurstRecorder | null>(null);

  useSignRecognition(videoRef, () => {}, {
    classify: false,
    onFrame: (frame) => recorderRef.current?.addFrame(frame),
  });

  // Al salir de la pantalla se cancela la sesión en curso.
  useEffect(() => () => recorderRef.current?.stop(), []);

  const counts = summary?.counts ?? {};
  const rows = [
    { label: NEUTRAL, text: t('train.neutral') },
    ...(phrases ?? []).map((p) => ({ label: p.code, text: p.text_es })),
  ];
  const readyPhrases = rows.filter(
    (r) => r.label !== NEUTRAL && (counts[r.label] ?? 0) >= MIN_SAMPLES,
  ).length;
  const training = isTraining(model.job);
  const canTrain =
    (counts[NEUTRAL] ?? 0) >= MIN_SAMPLES && readyPhrases >= 2 && !training && !session;

  const stopSession = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setSession(null);
  };

  const onEvent = (label: string) => (event: BurstEvent) => {
    switch (event.type) {
      case 'countdown':
        setSession({ label, message: t('train.countdown', { n: String(event.secondsLeft) }) });
        break;
      case 'recording':
        setSession({
          label,
          message: t('train.recording', {
            n: String(event.burst),
            total: String(BURSTS_PER_SESSION),
          }),
        });
        break;
      case 'rejected':
        setNotice(t('train.rejected'));
        break;
      case 'sample':
        setNotice(null);
        // Se envía al momento; si falla, la muestra se pierde (no hay cola local).
        samplesApi.create(label, event.frames).then(
          () => void queryClient.invalidateQueries({ queryKey: SAMPLES_KEY }),
          (e: unknown) => {
            stopSession();
            setError(t(apiErrorStatus(e) === 409 ? 'train.labelFull' : 'train.uploadError'));
          },
        );
        break;
      case 'done':
        recorderRef.current = null;
        setSession(null);
        setNotice(t('train.done'));
        break;
    }
  };

  const startSession = (label: string) => {
    setError(null);
    setNotice(null);
    const recorder = new BurstRecorder(onEvent(label), {
      requireHands: label !== NEUTRAL,
      ...timing,
    });
    recorderRef.current = recorder;
    setSession({ label, message: '' });
    recorder.start();
  };

  const onDelete = async (label: string) => {
    if (confirmDelete !== label) {
      setConfirmDelete(label);
      return;
    }
    setConfirmDelete(null);
    try {
      await samplesApi.remove(label);
      await queryClient.invalidateQueries({ queryKey: SAMPLES_KEY });
    } catch {
      setError(t('error.generic'));
    }
  };

  const onTrain = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await modelsApi.train();
    } catch (e) {
      const status = apiErrorStatus(e);
      setError(
        t(status === 409 ? 'train.inProgress' : status === 422 ? 'train.missing' : 'error.generic'),
      );
    } finally {
      setSubmitting(false);
      await useSignModel.getState().refresh();
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>{t('train.title')}</h1>
          <p className={styles.hint}>{t('train.subtitle')}</p>
        </div>
      </header>

      <div className={train.layout}>
        <div className={train.stage}>
          <video ref={videoRef} className={train.video} autoPlay muted playsInline />
          {session?.message ? (
            <p role="status" className={train.overlay}>
              {session.message}
            </p>
          ) : null}
        </div>

        <div className={styles.aside}>
          {error ? (
            <p role="alert" className={train.error}>
              {error}
            </p>
          ) : null}
          {notice ? <p className={styles.muted}>{notice}</p> : null}

          <ul className={train.list}>
            {rows.map(({ label, text }) => {
              const n = counts[label] ?? 0;
              const acc = model.metrics?.per_label[label];
              const active = session?.label === label;
              return (
                <li
                  key={label}
                  aria-label={text}
                  className={active ? `${train.item} ${train.itemActive}` : train.item}
                >
                  <div className={train.itemText}>
                    <span className={train.itemName}>{text}</span>
                    <span className={n >= MIN_SAMPLES ? train.countDone : train.count}>
                      {t('train.count', { n: String(n), min: String(MIN_SAMPLES) })}
                    </span>
                    {acc !== undefined && label !== NEUTRAL ? (
                      <span className={acc < LOW_ACCURACY ? train.low : train.count}>
                        {t('train.labelAccuracy', { pct: pct(acc) })}
                        {acc < LOW_ACCURACY ? ` · ${t('train.needMore')}` : ''}
                      </span>
                    ) : null}
                  </div>
                  <div className={train.actions}>
                    {active ? (
                      <Button variant="secondary" label={t('train.stop')} onClick={stopSession} />
                    ) : (
                      <Button
                        label={t('train.record')}
                        disabled={!!session}
                        onClick={() => startSession(label)}
                      />
                    )}
                    {n > 0 && !active ? (
                      <Button
                        variant="danger"
                        label={t(confirmDelete === label ? 'train.confirmDelete' : 'train.delete')}
                        disabled={!!session}
                        onClick={() => void onDelete(label)}
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>

          <section className={train.footer}>
            {model.metrics ? (
              <p>{t('train.accuracy', { pct: pct(model.metrics.val_accuracy) })}</p>
            ) : null}
            {model.job?.status === 'failed' ? (
              <p className={train.error}>
                {t('train.failed', { error: model.job.error ?? t('error.generic') })}
              </p>
            ) : null}
            {training ? <p role="status">{t('train.training')}</p> : null}
            <Button
              label={t('train.trainButton')}
              disabled={!canTrain}
              loading={submitting}
              onClick={() => void onTrain()}
            />
            <p className={styles.muted}>{t('train.trainHint')}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
