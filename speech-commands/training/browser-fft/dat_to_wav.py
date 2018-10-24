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

'''Convert a .dat file back to a .wav file.'''

from __future__ import absolute_import
from __future__ import division
from __future__ import print_function

import argparse
import struct

from matplotlib import pyplot as plt
import numpy as np
from scipy.io import wavfile


if __name__ == '__main__':
  parser = argparse.ArgumentParser('dat_to_wav')
  parser.add_argument('dat_path', type=str, help='Path to input .dat file')
  parser.add_argument('fs', type=int, help='Sampling frequency (Hz)')
  parser.add_argument('wav_path', type=str, help='Path to output .wav file')
  args = parser.parse_args()

  with open(args.dat_path, 'rb') as in_file:
    data = in_file.read()
    num_floats = int(len(data) / 4)
    waveform = np.array(struct.unpack('=%df' % num_floats, data))

    plt.plot(waveform)
    plt.show()

    wavfile.write(args.wav_path, args.fs, waveform)