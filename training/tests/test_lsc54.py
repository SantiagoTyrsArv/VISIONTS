import numpy as np

from senavoz_training.lsc54 import SEQUENCE_LENGTH, load_lsc54, load_shifted


def _save(root, topic, sign, name, seq):
    path = root / topic / sign / f"{name}.npy"
    path.parent.mkdir(parents=True, exist_ok=True)
    np.save(path, seq.astype(np.float32))


def _video(n_frames, hands=slice(None)):
    seq = np.zeros((n_frames, 126), np.float32)
    seq[hands, :63] = np.arange(n_frames, dtype=np.float32)[hands, None] + 1
    return seq


def test_signer_and_sign_come_from_the_path(tmp_path):
    _save(tmp_path, "Cordialidad", "Baño", "7__2", _video(40))
    (signer, sign, seq), = load_lsc54(tmp_path)
    assert (signer, sign) == ("7", "Baño")
    assert seq.shape == (SEQUENCE_LENGTH, 126)
    assert seq.dtype == np.float32


def test_long_video_is_centered_on_the_hands(tmp_path):
    _save(tmp_path, "Cordialidad", "Hola", "1__0", _video(60, slice(40, 50)))
    (_, _, seq), = load_lsc54(tmp_path)
    with_hands = np.flatnonzero(seq.any(axis=1))
    assert len(with_hands) == 10
    # 10 frames sin manos a cada lado
    assert with_hands[0] == 10
    assert with_hands[-1] == 19


def test_window_stays_inside_the_video(tmp_path):
    _save(tmp_path, "Cordialidad", "Hola", "1__0", _video(50, slice(45, 50)))
    (_, _, seq), = load_lsc54(tmp_path)
    np.testing.assert_array_equal(seq, _video(50, slice(45, 50))[20:])


def test_short_video_is_padded_with_no_hands_on_both_sides(tmp_path):
    _save(tmp_path, "Cordialidad", "Hola", "1__0", _video(20))
    (_, _, seq), = load_lsc54(tmp_path)
    assert not seq[:5].any()
    assert not seq[25:].any()
    np.testing.assert_array_equal(seq[5:25], _video(20))


def test_videos_without_hands_and_partial_files_are_skipped(tmp_path):
    _save(tmp_path, "Cordialidad", "Hola", "1__0", np.zeros((40, 126)))
    _save(tmp_path, "Cordialidad", "Hola", "1__1.tmp", _video(40))
    assert load_lsc54(tmp_path) == []


def test_shifted_windows_move_around_the_center_and_stay_inside(tmp_path):
    _save(tmp_path, "Cordialidad", "Hola", "1__0", _video(61))
    shifted = load_shifted(tmp_path, (-8, 8, 100))
    assert [(s, n) for s, n, _ in shifted] == [("1", "Hola")] * 3
    starts = [int(seq[0, 0]) - 1 for _, _, seq in shifted]  # el valor del frame i es i + 1
    assert starts == [7, 23, 31]  # la central empieza en 15; +100 se recorta al final


def test_shifted_windows_skip_short_videos_repeats_and_windows_without_hands(tmp_path):
    _save(tmp_path, "Cordialidad", "Hola", "1__0", _video(20))
    _save(tmp_path, "Cordialidad", "Chao", "1__1", _video(60, slice(0, 4)))
    assert load_shifted(tmp_path, (4, 30)) == []
