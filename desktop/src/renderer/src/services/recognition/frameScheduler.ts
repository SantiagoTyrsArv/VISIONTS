type FrameCallback = (timestamp: number) => void;

/** Programa una llamada por frame de vídeo nuevo; `timestamp` es el mediaTime en ms. */
export type FrameScheduler = {
  request(video: HTMLVideoElement, callback: FrameCallback): number;
  cancel(video: HTMLVideoElement, id: number): void;
};

export const frameScheduler: FrameScheduler = {
  request(video, callback) {
    if (video.requestVideoFrameCallback) {
      return video.requestVideoFrameCallback((_now, metadata) =>
        callback(metadata.mediaTime * 1000),
      );
    }
    return requestAnimationFrame(callback);
  },
  cancel(video, id) {
    if (video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(id);
    else cancelAnimationFrame(id);
  },
};
