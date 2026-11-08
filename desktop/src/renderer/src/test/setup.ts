import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import { MotionGlobalConfig } from 'motion';

import { installFakeSenavoz } from './fakeSenavoz';

installFakeSenavoz();

// Sin animaciones en las pruebas: AnimatePresence desmonta al instante.
MotionGlobalConfig.skipAnimations = true;

// Sin `globals: true`, Testing Library no registra su limpieza automática.
afterEach(cleanup);
