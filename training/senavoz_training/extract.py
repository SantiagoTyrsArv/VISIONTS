"""Landmarks de los vídeos crudos de LSC-54 con MediaPipe Hand Landmarker, como en la app.

La app detecta en cada frame de la cámara (modo VIDEO, con seguimiento) y guarda uno cada
FRAME_INTERVAL_MS; aquí se hace lo mismo con los vídeos de 30 fps y se guarda una caché .npy
por vídeo: <cache>/<tema>/<seña>/<persona>__<n>.npy, de forma (T, 126).

Uso (desde training/):
    python -m senavoz_training.extract --zips data/lsc54/RawVideos --cache data/lsc54/cache
"""

import argparse
import os
import tempfile
import zipfile
from collections.abc import Callable
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions, vision

from senavoz_training.preprocess import VALUES_PER_HAND, assign_slots, normalize_frame

# FRAME_INTERVAL_MS = 66 en landmarks.ts: un frame de cada 2 a 30 fps.
FRAME_STEP = 2
# HAND_HOLD_FRAMES en landmarks.ts.
HAND_HOLD_FRAMES = 3
MODEL_PATH = (
    Path(__file__).resolve().parents[2]
    / "desktop/src/renderer/public/models/hand_landmarker.task"
)


def create_landmarker() -> vision.HandLandmarker:
    """Mismas opciones que createDefaultLandmarker de la app."""
    options = vision.HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(MODEL_PATH)),
        running_mode=vision.RunningMode.VIDEO,
        num_hands=2,
    )
    return vision.HandLandmarker.create_from_options(options)


def hold_missing(seq: np.ndarray, frames: int) -> np.ndarray:
    """Mantiene una mano perdida hasta `frames` frames, como LandmarkSequenceBuffer."""
    out = seq.copy()
    for slot in range(2):
        cols = slice(slot * VALUES_PER_HAND, (slot + 1) * VALUES_PER_HAND)
        last, missing = None, 0
        for t in range(len(out)):
            if out[t, cols].any():
                last, missing = out[t, cols].copy(), 0
            elif last is not None and missing < frames:
                missing += 1
                out[t, cols] = last
            else:
                last = None
    return out


def _hands(result) -> list[tuple[np.ndarray, str | None]]:
    hands = []
    for i, landmarks in enumerate(result.hand_landmarks):
        categories = result.handedness[i] if i < len(result.handedness) else []
        label = categories[0].category_name if categories else None
        points = np.array([[p.x, p.y, p.z] for p in landmarks], np.float64).reshape(-1, 3)
        hands.append((points, label if label in ("Left", "Right") else None))
    return hands


def extract_video(path: Path, landmarker) -> np.ndarray:
    """(T, 126) float32: un frame normalizado de cada FRAME_STEP, con la mano perdida mantenida."""
    cap = cv2.VideoCapture(str(path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frames, index = [], 0
    try:
        while True:
            ok, bgr = cap.read()
            if not ok:
                break
            rgb = np.ascontiguousarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = landmarker.detect_for_video(image, round(index * 1000 / fps))
            if index % FRAME_STEP == 0:
                frames.append(normalize_frame(*assign_slots(_hands(result))))
            index += 1
    finally:
        cap.release()
    seq = np.stack(frames) if frames else np.zeros((0, 2 * VALUES_PER_HAND), np.float32)
    return hold_missing(seq, HAND_HOLD_FRAMES)


def member_name(filename: str, flag_bits: int) -> str:
    """Los zips de LSC-54 guardan los nombres en UTF-8 sin marcarlo; zipfile los lee como cp437."""
    if flag_bits & 0x800:
        return filename
    try:
        return filename.encode("cp437").decode("utf-8")
    except UnicodeError:
        return filename


def _videos(zips_dir: Path, cache_dir: Path) -> list[tuple[Path, str, Path]]:
    """(zip, miembro, destino) de cada .avi: <zip>/<persona>/<tema>/<seña>/<n>.avi."""
    jobs = []
    for zip_path in sorted(Path(zips_dir).glob("*.zip")):
        with zipfile.ZipFile(zip_path) as zf:
            for info in zf.infolist():
                parts = member_name(info.filename, info.flag_bits).split("/")
                if len(parts) != 5 or not parts[4].lower().endswith(".avi"):
                    continue
                _, signer, topic, sign, file = parts
                target = cache_dir / topic / sign / f"{signer}__{Path(file).stem}.npy"
                jobs.append((zip_path, info.filename, target))
    return jobs


def _extract_member(
    zip_path: Path, member: str, target: Path, make_landmarker: Callable = create_landmarker
) -> int:
    with tempfile.TemporaryDirectory() as tmp:
        video = Path(tmp) / "video.avi"
        with zipfile.ZipFile(zip_path) as zf, zf.open(member) as src:
            video.write_bytes(src.read())
        # Un landmarker por vídeo: su seguimiento y sus timestamps empiezan de cero.
        landmarker = make_landmarker()
        try:
            seq = extract_video(video, landmarker)
        finally:
            close = getattr(landmarker, "close", None)
            if close:
                close()
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_suffix(".tmp.npy")
    np.save(partial, seq)
    partial.replace(target)
    return len(seq)


def extract_all(
    zips_dir: Path,
    cache_dir: Path,
    *,
    make_landmarker: Callable = create_landmarker,
    workers: int = 1,
) -> None:
    """Extrae los vídeos que aún no están en la caché."""
    cache_dir = Path(cache_dir)
    jobs = [job for job in _videos(Path(zips_dir), cache_dir) if not job[2].exists()]
    total = len(jobs)
    print(f"Vídeos por extraer: {total}", flush=True)

    def report(done: int, target: Path, n_frames: int) -> None:
        print(f"[{done}/{total}] {target.relative_to(cache_dir)}: {n_frames} frames", flush=True)

    if workers <= 1:
        for done, (zip_path, member, target) in enumerate(jobs, 1):
            report(done, target, _extract_member(zip_path, member, target, make_landmarker))
        return
    with ProcessPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(_extract_member, *job): job[2] for job in jobs}
        for done, future in enumerate(as_completed(futures), 1):
            report(done, futures[future], future.result())


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--zips", type=Path, required=True)
    p.add_argument("--cache", type=Path, required=True)
    p.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    args = p.parse_args()
    extract_all(args.zips, args.cache, workers=args.workers)


if __name__ == "__main__":
    main()
