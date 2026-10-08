import { useState } from 'react';

import { SAMPLES_KEY, samplesApi } from '@/api/endpoints';
import { queryClient } from '@/api/queryClient';
import { t } from '@/i18n';
import { useSignModel } from '@/store/signModel';
import { Button } from '@/ui/Button';

import styles from '../routes.module.css';

export function TrainingDataSection() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onDelete = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setBusy(true);
    try {
      await samplesApi.remove();
      useSignModel.getState().clear();
      await queryClient.invalidateQueries({ queryKey: SAMPLES_KEY });
      await useSignModel.getState().refresh();
      setMessage(t('settings.trainingDataDeleted'));
    } catch {
      setMessage(t('error.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.section} aria-label={t('settings.trainingData')}>
      <h2 className={styles.sectionTitle}>{t('settings.trainingData')}</h2>
      <p className={styles.muted}>{t('settings.trainingDataHint')}</p>
      <Button
        variant="danger"
        label={t(confirming ? 'settings.confirmDeleteTrainingData' : 'settings.deleteTrainingData')}
        loading={busy}
        onClick={() => void onDelete()}
      />
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
