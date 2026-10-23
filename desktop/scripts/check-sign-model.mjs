// El instalador debe llevar el modelo de señas: sin él la app solo funciona con clic y atajos.
import { existsSync } from 'node:fs';

const MODEL = 'src/renderer/src/assets/sign-model.json';

if (!existsSync(MODEL)) {
  console.error(
    `Falta ${MODEL}. Genéralo con training/ (ver training/README.md) antes de empaquetar.`,
  );
  process.exit(1);
}
