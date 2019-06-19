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

import Plotly from 'plotly.js-dist';

import * as SpeechCommands from '../src';
import {BACKGROUND_NOISE_TAG, UNKNOWN_TAG} from '../src';

const statusDisplay = document.getElementById('status-display');
const candidateWordsContainer = document.getElementById('candidate-words');
const realTimeProbabilitiesDiv =
    document.getElementById('real-time-probabilities');

/**
 * Log a message to a textarea.
 *
 * @param {string} message Message to be logged.
 */
export function logToStatusDisplay(message) {
  const date = new Date();
  statusDisplay.value += `[${date.toISOString()}] ` + message + '\n';
  statusDisplay.scrollTop = statusDisplay.scrollHeight;
}

let candidateWordSpans;

/**
 * Display candidate words in the UI.
 *
 * The background-noise "word" will be omitted.
 *
 * @param {*} words Candidate words.
 */
export function populateCandidateWords(words) {
  candidateWordSpans = {};
  while (candidateWordsContainer.firstChild) {
    candidateWordsContainer.removeChild(candidateWordsContainer.firstChild);
  }

  for (const word of words) {
    if (word === BACKGROUND_NOISE_TAG || word === UNKNOWN_TAG) {
      continue;
    }
    const wordSpan = document.createElement('span');
    wordSpan.textContent = word;
    wordSpan.classList.add('candidate-word');
    wordSpan.classList.add('mdc-typography--body1');
    candidateWordsContainer.appendChild(wordSpan);
    candidateWordSpans[word] = wordSpan;
  }
}

export function showCandidateWords() {
  candidateWordsContainer.classList.remove('candidate-words-hidden');
}

export function hideCandidateWords() {
  candidateWordsContainer.classList.add('candidate-words-hidden');
}

let probabilitiesPlotT0;
const maxProbabilityPlotPoints = 100;
let plottedWordProbs = [];

export function plotRealTimeProbabilities(wordLabels, probs, probThreshold) {
  if (wordLabels.length !== probs.length) {
    throw new Error('wordLabels and probs have mismatching lengths');
  }

  let minX = Infinity;
  let maxX = -Infinity;
  const names = plottedWordProbs.map(entry => entry.name);
  wordLabels.forEach((wordLabel, i) => {
    const timeSec = (new Date().getTime() - probabilitiesPlotT0) / 1e3;
    const index = names.indexOf(wordLabel);
    if (index === -1) {
      plottedWordProbs.push({
        x: [timeSec],
        y: [probs[i]],
        name: wordLabel
      });
      if (timeSec < minX) {
        minX = timeSec;
      }
      if (timeSec > maxX) {
        maxX = timeSec;
      }
    } else {
      plottedWordProbs[index].x.push(timeSec);
      plottedWordProbs[index].y.push(probs[i]);
      if (plottedWordProbs[index].x.length > maxProbabilityPlotPoints) {
        plottedWordProbs[index].x.shift();
        plottedWordProbs[index].y.shift();
      }
      const xs = plottedWordProbs[index].x;
      if (xs[0] < minX) {
        minX = xs[0];
      }
      if (xs[xs.length - 1] > maxX) {
        maxX = xs[xs.length - 1];
      }
    }
  });

  const plottedData = plottedWordProbs.slice();
  if (probThreshold != null) {
    plottedData.push({
      x: [minX - 1, maxX + 1],
      y: [probThreshold, probThreshold],
      name: 'Threshold',
      line: {
        widht: 1,
        dash: 'dash'
      }
    });
  }
  Plotly.newPlot(
    'real-time-probabilities',
    plottedData,
    {
      width: '100%',
      height: 300,
      xaxis: {title: 'Time (s)'},
      yaxis: {title: 'Probability score'}
    });
}

export function clearRealTimeProbabilities() {
  plottedWordProbs = [];
  while (realTimeProbabilitiesDiv.firstChild) {
    realTimeProbabilitiesDiv.removeChild(
        realTimeProbabilitiesDiv.firstChild);
  }
  probabilitiesPlotT0 = new Date().getTime();
}

/**
 * Show an audio spectrogram in a canvas.
 *
 * @param {HTMLCanvasElement} canvas The canvas element to draw the
 *   spectrogram in.
 * @param {Float32Array} frequencyData The flat array for the spectrogram
 *   data.
 * @param {number} fftSize Number of frequency points per frame.
 * @param {number} fftDisplaySize Number of frequency points to show. Must be
 * @param {Object} config Optional configuration object, with the following
 *   supported fields:
 *   - pixelsPerFrame {number} Number of pixels along the width dimension of
 *     the canvas for each frame of spectrogram.
 *   - maxPixelWidth {number} Maximum width in pixels.
 *   - markKeyFrame {bool} Whether to mark the index of the frame
 *     with the maximum intensity or a predetermined key frame.
 *   - keyFrameIndex {index?} Predetermined key frame index.
 *
 *   <= fftSize.
 */
export async function plotSpectrogram(
    canvas, frequencyData, fftSize, fftDisplaySize, config) {
  if (fftDisplaySize == null) {
    fftDisplaySize = fftSize;
  }
  if (config == null) {
    config = {};
  }

  // Get the maximum and minimum.
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < frequencyData.length; ++i) {
    const x = frequencyData[i];
    if (x !== -Infinity) {
      if (x < min) {
        min = x;
      }
      if (x > max) {
        max = x;
      }
    }
  }
  if (min >= max) {
    return;
  }

  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);

  const numFrames = frequencyData.length / fftSize;
  if (config.pixelsPerFrame != null) {
    let realWidth = Math.round(config.pixelsPerFrame * numFrames);
    if (config.maxPixelWidth != null && realWidth > config.maxPixelWidth) {
      realWidth = config.maxPixelWidth;
    }
    canvas.width = realWidth;
  }

  const pixelWidth = canvas.width / numFrames;
  const pixelHeight = canvas.height / fftDisplaySize;
  for (let i = 0; i < numFrames; ++i) {
    const x = pixelWidth * i;
    const spectrum = frequencyData.subarray(i * fftSize, (i + 1) * fftSize);
    if (spectrum[0] === -Infinity) {
      break;
    }
    for (let j = 0; j < fftDisplaySize; ++j) {
      const y = canvas.height - (j + 1) * pixelHeight;

      let colorValue = (spectrum[j] - min) / (max - min);
      colorValue = Math.pow(colorValue, 3);
      colorValue = Math.round(255 * colorValue);
      const fillStyle =
          `rgb(${colorValue},${255 - colorValue},${255 - colorValue})`;
      context.fillStyle = fillStyle;
      context.fillRect(x, y, pixelWidth, pixelHeight);
    }
  }

  if (config.markKeyFrame) {
    const keyFrameIndex =
        config.keyFrameIndex == null ?
        await SpeechCommands.getMaxIntensityFrameIndex({
          data: frequencyData,
          frameSize: fftSize
        }).data() : config.keyFrameIndex;
    // Draw lines to mark the maximum-intensity frame.
    context.strokeStyle = 'black';
    context.beginPath();
    context.moveTo(pixelWidth * keyFrameIndex, 0);
    context.lineTo(pixelWidth * keyFrameIndex, canvas.height * 0.1);
    context.stroke();
    context.beginPath();
    context.moveTo(pixelWidth * keyFrameIndex, canvas.height * 0.9);
    context.lineTo(pixelWidth * keyFrameIndex, canvas.height);
    context.stroke();
  }
}

/**
 * Plot top-K predictions from a speech command recognizer.
 *
 * @param {HTMLCanvasElement} canvas The canvas to render the predictions in.
 * @param {string[]} candidateWords Candidate word array.
 * @param {Float32Array | number[]} probabilities Probability scores from the
 *   speech command recognizer. Must be of the same length as `candidateWords`.
 * @param {number} timeToLiveMillis Optional time to live for the active label
 *   highlighting. If not provided, will the highlighting will live
 *   indefinitely till the next highlighting.
 * @param {number} topK Top _ scores to render.
 */
export function plotPredictions(
    canvas, candidateWords, probabilities, topK, timeToLiveMillis) {
  if (topK != null) {
    let wordsAndProbs = [];
    for (let i = 0; i < candidateWords.length; ++i) {
      wordsAndProbs.push([candidateWords[i], probabilities[i]]);
    }
    wordsAndProbs.sort((a, b) => (b[1] - a[1]));
    wordsAndProbs = wordsAndProbs.slice(0, topK);
    candidateWords = wordsAndProbs.map(item => item[0]);
    probabilities = wordsAndProbs.map(item => item[1]);

    // Highlight the top word.
    const topWord = wordsAndProbs[0][0];
    console.log(
        `"${topWord}" (p=${wordsAndProbs[0][1].toFixed(6)}) @ ` +
        new Date().toTimeString());
    for (const word in candidateWordSpans) {
      if (word === topWord) {
        candidateWordSpans[word].classList.add('candidate-word-active');
        if (timeToLiveMillis != null) {
          setTimeout(() => {
            if (candidateWordSpans[word]) {
              candidateWordSpans[word].classList.remove(
                  'candidate-word-active');
            }
          }, timeToLiveMillis);
        }
      } else {
        candidateWordSpans[word].classList.remove('candidate-word-active');
      }
    }
  }
}

export function showErrorOnButton(button, errorMsg, timeoutMs) {
  const originalText = button.textContent;
  const originalColor = button.style['color'];
  button.textContent = errorMsg;
  button.style['color'] = 'red';
  button.disabled = true;
  setTimeout(() => {
    button.textContent = originalText;
    button.style['color'] = originalColor;
    button.disabled = false;
  }, timeoutMs);
}

export function showInfoOnButton(button, infoMsg, timeoutMs) {
  const originalText = button.textContent;
  const originalColor = button.style['color'];
  button.textContent = infoMsg;
  button.disabled = true;
  setTimeout(() => {
    button.textContent = originalText;
    button.style['color'] = originalColor;
    button.disabled = false;
  }, timeoutMs);
}

/** Get the base name of the downloaded files based on current dataset. */
export function getDateString() {
  const d = new Date();
  const year = `${d.getFullYear()}`;
  let month = `${d.getMonth() + 1}`;
  let day = `${d.getDate()}`;
  if (month.length < 2) {
    month = `0${month}`;
  }
  if (day.length < 2) {
    day = `0${day}`;
  }
  let hour = `${d.getHours()}`;
  if (hour.length < 2) {
    hour = `0${hour}`;
  }
  let minute = `${d.getMinutes()}`;
  if (minute.length < 2) {
    minute = `0${minute}`;
  }
  let second = `${d.getSeconds()}`;
  if (second.length < 2) {
    second = `0${second}`;
  }
  return `${year}-${month}-${day}T${hour}.${minute}.${second}`;
}