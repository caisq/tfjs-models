/**
 * @license
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */

import * as tf from '@tensorflow/tfjs';
import * as fs from 'fs';

import {normalize} from '../../src/browser_fft_utils';

// import '@tensorflow/tfjs-node';

const NUM_FRAMES_CUTOFF = 43;
const VALID_FRAME_COUNT_RANGE: [number, number] = [5, 50];

function sanityCheckSpectrogram(
    spectrogram: Float32Array, numFramesCutoff: number,
    fftSize: number): boolean {
  if (spectrogram.length < numFramesCutoff * fftSize) {
    return false;
  }
  for (const x of spectrogram) {
    if (!isFinite(x)) {
      return false;
    }
  }
  return true;
}

export function loadSpectrograms(
    datPath: string, wordLabel: string, uniqueWordLabels: string[],
    numFramesCutoff: number, fftSize: number): {xs: tf.Tensor, ys: tf.Tensor} {
  const spectrograms: tf.Tensor[] = [];

  const rawBytes = fs.readFileSync(datPath);
  const bufferLen = rawBytes.byteLength;
  tf.util.assert(
      bufferLen % 4 === 0,
      `Buffer length in file ${datPath} is not divisible by 4`);
  const numFloats = bufferLen / 4;
  tf.util.assert(
      numFloats % fftSize === 0,
      `Number of floats (${numFloats}) in file ${datPath} is not divisible ` +
          `by the number of FFT points per frame (${fftSize})`);
  const numFrames = numFloats / fftSize;

  const data = new Float32Array(numFloats);
  for (let i = 0; i < numFloats; ++i) {
    data[i] = rawBytes.readFloatLE(i * 4);
  }

  let numDiscarded = 0;
  let numKept = 0;
  let frame = 0;
  while (frame < numFrames) {
    const n0 = frame;
    let n1 = frame + 1;
    while (n1 < numFrames && isFinite(data[fftSize * n1]) &&
           data[fftSize * n1] !== 0) {
      n1++;
    }
    if (n1 > numFrames) {
      break;
    }

    const spectrogram = data.slice(fftSize * n0, fftSize * n1);
    const frameCount = n1 - n0;
    if (!sanityCheckSpectrogram(spectrogram, numFramesCutoff, fftSize)) {
      numDiscarded++;
    } else {
      // TODO(cais): Normalize.
      spectrograms.push(normalize(tf.tensor2d(
          spectrogram.slice(0, numFramesCutoff * fftSize),
          [NUM_FRAMES_CUTOFF, fftSize])));
      numKept++;
    }

    frame = n1 + 1;
    while (frame < numFrames &&
           (!isFinite(data[fftSize * frame]) || data[fftSize * frame] === 0)) {
      frame++;
    }
    if (frame > numFrames) {
      break;
    }
  }

  const xs = tf.stack(spectrograms, 0);
  console.log(xs.shape);  // DEBUG
  const numExamples = xs.shape[0];

  const targetIndex = uniqueWordLabels.indexOf(wordLabel);
  tf.util.assert(
      targetIndex !== -1,
      `Word label '${wordLabel}' is not found in unique word labels ` +
      `'${uniqueWordLabels}'`);
  const indices = [];
  for (let i = 0; i < numExamples; ++i) {
    indices.push(targetIndex);
  }
  const ys = tf.oneHot(indices, uniqueWordLabels.length);

  console.log(`Kept: ${numKept}; Discarded: ${numDiscarded}`);  // DEBUG
  return {xs, ys};
}

const filePath =
    '/usr/local/google/home/cais/ml-data/speech_commands_browser_clean/train/zero/0.dat';

loadSpectrograms(filePath, 'zero', ['zero', 'one'], NUM_FRAMES_CUTOFF, 232);
