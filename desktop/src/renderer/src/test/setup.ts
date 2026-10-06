import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import { installFakeSenavoz } from './fakeSenavoz';

installFakeSenavoz();

// Sin `globals: true`, Testing Library no registra su limpieza automática.
afterEach(cleanup);
