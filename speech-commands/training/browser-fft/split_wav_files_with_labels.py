# Copyright 2018 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
# ==============================================================================

'''Cut long .wav files into smaller .wav files using .label files.

Assumed format:

- Each .wav file is accompanies by a .label file of the same base name.
  E.g.,
  * x1.wav, x1.labels, y1.wav, y2.labels
- Each .labels file is assumed to contain a series of starting time
  stamps, with the unit of seconds (s), on separate lines.
'''

from __future__ import absolute_import
from __future__ import division
from __future__ import print_function

import argparse
import glob
import os

from scipy.io import wavfile


def _assert_monotonically_increasing(xs):
  for i in range(len(xs) - 1):
    if xs[i + 1] <= xs[i]:
      raise ValueError('Not monotonically increasing')


def cut_wav_files(in_path, duration, out_path):
  print('in_path: %s' % in_path)
  print('out_path: %s' % out_path)

  if not os.path.isdir(out_path):
    os.makedirs(out_path)

  wav_paths = sorted(glob.glob(os.path.join(in_path, '*.wav')))
  for wav_path in wav_paths:
    basename, _ = os.path.splitext(os.path.split(wav_path)[-1])
    labels_path = os.path.join(in_path, basename + '.labels')
    with open(labels_path, 'rt') as f:
      labels = f.read().split('\n')
      start_ts = [float(l) for l in labels if l]
      _assert_monotonically_increasing(start_ts)

    fs, signal = wavfile.read(wav_path)
    print('%s: fs = %g Hz, len = %f s' % (in_path, fs, len(signal) / fs))

    split_len = int(duration * fs)

    file_out_dir = os.path.join(out_path, basename)
    if not os.path.isdir(file_out_dir):
      os.makedirs(file_out_dir)

    for i, start_t in enumerate(start_ts):
      start_ind = int(start_t * fs)
      end_ind = start_ind + split_len
      split_signal = signal[start_ind : end_ind]

      out_wav_path = os.path.join(
          file_out_dir, '%s_%d.wav' % (basename, i + 1))
      wavfile.write(out_wav_path, fs, split_signal)
      print('  %g s --> %s' % (start_t, out_wav_path))


if __name__ == '__main__':
  parser = argparse.ArgumentParser(
     'Cut long .wav files into smaller .wav files using .label files.')
  parser.add_argument('in_path', type=str, help='Input path.')
  parser.add_argument(
      'duration', type=float, help='Duration of each split .wav file, in s')
  parser.add_argument('out_path', type=str, help='Output path.')

  args, _ =  parser.parse_known_args()
  cut_wav_files(args.in_path, args.duration, args.out_path)
