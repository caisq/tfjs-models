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

import {hideCandidateWords, logToStatusDisplay, plotPredictions, populateCandidateWords, showCandidateWords} from './ui';

const startButton = document.getElementById('start');
const stopButton = document.getElementById('stop');
const predictionCanvas = document.getElementById('prediction-canvas');
const probaThresholdInput = document.getElementById('proba-threshold');

let recognizer;
export function setRecognizer(r) {
  recognizer = r;
}

if (startButton != null) {
  startButton.addEventListener('click', () => {
    populateCandidateWords(recognizer.wordLabels());
  
    const suppressionTimeMillis = 1000;
    recognizer
        .listen(
            result => {
              plotPredictions(
                  predictionCanvas, recognizer.wordLabels(),
                  result.scores, 3, suppressionTimeMillis);
            },
            {
              includeSpectrogram: true,
              suppressionTimeMillis,
              probabilityThreshold: Number.parseFloat(probaThresholdInput.value)
            })
        .then(() => {
          startButton.disabled = true;
          stopButton.disabled = false;
          showCandidateWords();
          logToStatusDisplay('Streaming recognition started.');
        })
        .catch(err => {
          logToStatusDisplay(
              'ERROR: Failed to start streaming display: ' + err.message);
        });
  });

  stopButton.addEventListener('click', () => {
    recognizer.stopListening()
        .then(() => {
          startButton.disabled = false;
          stopButton.disabled = true;
          hideCandidateWords();
          logToStatusDisplay('Streaming recognition stopped.');
        })
        .catch(err => {
          logToStatusDisplay(
              'ERROR: Failed to stop streaming display: ' + err.message);
        });
  });
}