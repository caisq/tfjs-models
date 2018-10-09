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
import * as path from 'path';

// import '@tensorflow/tfjs-node';

const NUM_FRAMES_CUTOFF = 43;

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

function sum(xs: Float32Array): number {
  return xs.reduce((x, p) => x + p);
}

function mean(xs: Float32Array): number {
  return sum(xs) / xs.length;
}

export function normalize(xs: Float32Array): Float32Array {
  const xMean = mean(xs);
  const demeaned = xs.map(x => x - xMean);
  const diff = xs.map(x => (x - xMean));
  const squareDiff = diff.map(d => d * d);
  const meanSquareDiff = sum(squareDiff) / xs.length;
  const std = Math.sqrt(meanSquareDiff);
  return demeaned.map(x => x / std);
}

export function loadSpectrogramsAndTargets(
  datPath: string, wordLabel: string, uniqueWordLabels: string[],
  numFramesCutoff: number, fftSize: number):
  {xs: Float32Array[], ys: Float32Array[]} {
  const spectrograms: Float32Array[] = [];
  const targets: Float32Array[] = [];

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
      spectrograms.push(normalize(spectrogram.slice(0, numFramesCutoff * fftSize)));
      numKept++;
    }

    frame = n1 + 1;
    while (
        frame < numFrames &&
        (!isFinite(data[fftSize * frame]) || data[fftSize * frame] === 0)) {
      frame++;
    }
    if (frame > numFrames) {
      break;
    }
  }

  const numExamples = spectrograms.length;
  const targetIndex = uniqueWordLabels.indexOf(wordLabel);
  tf.util.assert(
      targetIndex !== -1,
      `Word label '${wordLabel}' is not found in unique word labels ` +
          `'${uniqueWordLabels}'`);
  const oneHotVector = new Float32Array(uniqueWordLabels.length);
  oneHotVector[targetIndex] = 1;
  for (let i = 0; i < numExamples; ++i) {
    targets.push(oneHotVector);
  }

  if (numDiscarded > 0) {
    console.log(`Kept: ${numKept}; Discarded: ${numDiscarded}`);
  }
  return {
    xs: spectrograms,
    ys: targets
  };
}

export function Float32Concat(arrays: Float32Array[]): Float32Array {
  let totalLength = 0;
  for (const array of arrays) {
    totalLength += array.length;
  }
  const result = new Float32Array(totalLength);
  let offset = 0;
  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }
  return result;
}

export function loadData(
    rootDir: string, numFramesCutoff: number, fftSize: number):
    {xs: tf.Tensor, ys: tf.Tensor, wordLabels: string[]} {
  return tf.tidy(() => {
    const dirContent = fs.readdirSync(rootDir);
    const wordLabels: string[] = [];
    for (const item of dirContent) {
      if (fs.lstatSync(path.join(rootDir, item)).isDirectory()) {
        wordLabels.push(item);
      }
    }
    wordLabels.sort();

    let xsBuffers: Float32Array[] = [];
    let ysBuffers: Float32Array[] = [];
    let numExamples = 0;
    for (const wordItem of dirContent) {
      console.log(`--- Loading data for word '${wordItem}' ---`);
      const wordDir = fs.readdirSync(path.join(rootDir, wordItem));
      for (const fileItem of wordDir) {
        const filePath = path.join(rootDir, wordItem, fileItem);
        console.log(`Loading from file ${filePath}`);
        if (!fs.lstatSync(filePath).isFile()) {
          continue;
        }
        const {xs: fileXs, ys: fileYs} =
            loadSpectrogramsAndTargets(
                filePath, wordItem, wordLabels, numFramesCutoff, fftSize);
        numExamples += fileXs.length;
        xsBuffers.push(...fileXs);
        ysBuffers.push(...fileYs);
      }
    }

    // Shuffle all data.
    const xsAndYs: Array<[Float32Array, Float32Array]> = [];
    for (let i = 0; i < xsBuffers.length; ++i) {
      xsAndYs.push([xsBuffers[i], ysBuffers[i]]);
    }
    tf.util.shuffle(xsAndYs);

    const xs = tf.tensor4d(
        Float32Concat(xsAndYs.map(item => item[0])),
        [numExamples, numFramesCutoff, fftSize, 1]);
    const ys = tf.tensor2d(
        Float32Concat(xsAndYs.map(item => item[1])),
        [numExamples, wordLabels.length]);
    return {xs, ys, wordLabels};
  });
}