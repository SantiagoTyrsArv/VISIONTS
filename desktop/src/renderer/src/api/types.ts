export type User = {
  id: string;
  email: string;
  display_name: string;
  is_active: boolean;
  created_at: string;
};

export type TokenPair = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
};

export type Phrase = {
  id: string;
  code: string;
  text_es: string;
  is_default: boolean;
};

export type SampleSummary = { counts: Record<string, number> };

export type ModelMetrics = {
  val_accuracy: number;
  per_label: Record<string, number>;
  samples: Record<string, number>;
};

export type ReadyModel = {
  id: string;
  labels: string[];
  metrics: ModelMetrics;
  created_at: string;
};

export type ModelJob = {
  id: string;
  status: 'queued' | 'training' | 'failed';
  error: string | null;
  created_at: string;
};

export type ModelStatus = { ready: ReadyModel | null; latest: ModelJob | null };
