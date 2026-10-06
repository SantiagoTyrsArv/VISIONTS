import { describe, expect, it, vi } from 'vitest';

import { cameraErrorKey, listCameras, openCamera } from '@/services/camera/camera';

const domError = (name: string) => Object.assign(new Error(name), { name });
const stream = {} as MediaStream;

describe('cameraErrorKey', () => {
  it.each([
    ['NotAllowedError', 'camera.permissionDenied'],
    ['SecurityError', 'camera.permissionDenied'],
    ['NotFoundError', 'camera.noCamera'],
    ['OverconstrainedError', 'camera.noCamera'],
    ['NotReadableError', 'camera.inUse'],
    ['AbortError', 'camera.error'],
  ])('%s → %s', (name, key) => {
    expect(cameraErrorKey(domError(name))).toBe(key);
  });

  it('errores desconocidos → genérico', () => {
    expect(cameraErrorKey('x')).toBe('camera.error');
  });
});

describe('openCamera', () => {
  it('pide la cámara preferida exacta', async () => {
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    await openCamera('cam-2', { getUserMedia });
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { deviceId: { exact: 'cam-2' } },
      audio: false,
    });
  });

  it.each(['OverconstrainedError', 'NotFoundError'])(
    'si la preferida ya no existe (%s) cae a la predeterminada',
    async (name) => {
      const getUserMedia = vi
        .fn()
        .mockRejectedValueOnce(domError(name))
        .mockResolvedValueOnce(stream);
      await expect(openCamera('desenchufada', { getUserMedia })).resolves.toBe(stream);
      expect(getUserMedia).toHaveBeenLastCalledWith({ video: true, audio: false });
    },
  );

  it('no reintenta si el error es de permiso o de cámara en uso', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(domError('NotReadableError'));
    await expect(openCamera('cam-1', { getUserMedia })).rejects.toMatchObject({
      name: 'NotReadableError',
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('sin preferida pide la predeterminada', async () => {
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    await openCamera(null, { getUserMedia });
    expect(getUserMedia).toHaveBeenCalledWith({ video: true, audio: false });
  });
});

describe('listCameras', () => {
  it('devuelve solo entradas de vídeo, con etiqueta de respaldo', async () => {
    const enumerateDevices = vi.fn().mockResolvedValue([
      { kind: 'videoinput', deviceId: 'a', label: 'Integrated Webcam' },
      { kind: 'audioinput', deviceId: 'm', label: 'Mic' },
      { kind: 'videoinput', deviceId: 'b', label: '' },
    ]);
    expect(await listCameras({ enumerateDevices })).toEqual([
      { id: 'a', label: 'Integrated Webcam' },
      { id: 'b', label: 'Cámara 2' },
    ]);
  });
});
