"""W1: validate inputs, record hashes, wrap-aware load, reject the redundant 10K file.

Plan: docs/plan-offline-world.md §4 step 1-2, §6 item 1 (antimeridian seam).
Exit criterion (plan §14, ticket W1): the seam test passes.

Usage:
    cd tools/world-pack
    python3 validate.py
    WORLD_INPUTS=/path/to/textures python3 validate.py
"""
import hashlib
import json
import sys
import time

import numpy as np
from PIL import Image

from common import (
    EXPECTED, INPUTS, OUT, REDUNDANT, SEAM_TOLERANCE_LEVELS,
)

Image.MAX_IMAGE_PIXELS = None


class ValidationError(Exception):
    pass


def sha256_file(path, chunk=1 << 20):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def load_grey(name, spec):
    """Load one input as a single-channel array, verifying size/mode and,
    for multi-channel sources, that every channel is equal (plan §4 step 1)."""
    path = INPUTS + name
    im = Image.open(path)
    if im.size != spec['size']:
        raise ValidationError(f'{name}: expected size {spec["size"]}, got {im.size}')
    arr = np.asarray(im)
    if spec['mode'] == 'L':
        if im.mode != 'L':
            raise ValidationError(f'{name}: expected mode L, got {im.mode}')
        grey = arr
    else:
        if arr.ndim != 3 or arr.shape[2] < 3:
            raise ValidationError(f'{name}: expected a multi-channel image, got mode {im.mode}')
        r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
        if not (np.array_equal(r, g) and np.array_equal(g, b)):
            raise ValidationError(f'{name}: R, G, B channels differ; expected a grey image stored as RGB')
        grey = r
    return grey.astype(np.uint8)


def reject_redundant():
    import os
    if os.path.exists(INPUTS + REDUNDANT):
        raise ValidationError(
            f'{REDUNDANT} is present but is redundant (same map as topography_21K.png at '
            'half resolution, grey stored as RGB) and must not be fed to the builder. '
            'Remove it from the inputs folder.'
        )


def wrap_pad(arr, pad):
    """Pad columns (the longitude axis) by wrapping, so a filter or resample
    that reads `pad` px past an edge sees the real data on the other side of
    +-180 degrees instead of a hard edge (plan §4 step 2, fixes F5)."""
    return np.pad(arr, ((0, 0), (pad, pad)), mode='wrap')


def seam_test(name, arr):
    """§6 item 1: left-most and right-most columns must differ by no more
    than SEAM_TOLERANCE_LEVELS once wrap-aware loading is used, since the
    wrapped neighbour of column 0 *is* column -1 by construction. This also
    reports the raw (unpadded) edge discontinuity (F5) for visibility."""
    left = arr[:, 0].astype(np.float64)
    right = arr[:, -1].astype(np.float64)
    raw_diff = float(np.abs(left - right).mean())
    neighbour_diff = float(np.abs(arr[:, 0].astype(np.float64) - arr[:, 1].astype(np.float64)).mean())

    padded = wrap_pad(arr, 1)
    wrapped_left_neighbour = padded[:, 0].astype(np.float64)   # == arr[:, -1]
    wrapped_right_neighbour = padded[:, -1].astype(np.float64)  # == arr[:, 0]
    # After wrapping, the pixel just outside column 0 is column -1 and vice
    # versa, so the "seam" the resampler sees is exactly this pair.
    seam_diff = float(np.abs(wrapped_left_neighbour - left).mean()
                       + np.abs(wrapped_right_neighbour - right).mean()) / 2

    passed = seam_diff <= SEAM_TOLERANCE_LEVELS
    print(f'  seam test [{name}]: raw edge diff {raw_diff:.3f} levels '
          f'(neighbour-col diff {neighbour_diff:.3f}), wrap-aware seam diff {seam_diff:.3f} '
          f'<= {SEAM_TOLERANCE_LEVELS} : {"PASS" if passed else "FAIL"}')
    return passed


def main():
    t0 = time.time()
    reject_redundant()

    manifest = {'generated': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'inputs': {}}
    all_passed = True

    for name, spec in EXPECTED.items():
        print(f'validating {name} ...')
        arr = load_grey(name, spec)
        digest = sha256_file(INPUTS + name)
        manifest['inputs'][name] = {
            'sha256': digest,
            'size': list(spec['size']),
            'mode': spec['mode'],
        }
        print(f'  size {arr.shape[1]}x{arr.shape[0]}, sha256 {digest[:12]}...')
        all_passed &= seam_test(name, arr)

    with open(OUT + 'inputs.json', 'w') as f:
        json.dump(manifest, f, indent=2)
    print(f'manifest fragment written to {OUT}inputs.json')
    print(f'{round(time.time() - t0, 1)} s')

    if not all_passed:
        print('VALIDATION FAILED: at least one seam test exceeded tolerance.', file=sys.stderr)
        sys.exit(1)
    print('all checks passed.')


if __name__ == '__main__':
    main()
