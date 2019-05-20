/**
 * @license
 * Copyright 2019 Google Inc. All Rights Reserved.
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

import {drawActionTree, executeTimedMenuAction, parseActionTreeConfig} from './action-tree';
import {populateSavedTransferModelsSelect, registerRecognizer, registerTransferRecognizerCreationCallback, setPostLoadTransferModelCallback} from './model-io';
// import * as basicInference from './basic-inference';

import * as SpeechCommands from '../src';
import {TimedMenu} from '../src/';

import * as runUI from './run-ui.js'
import {hideCandidateWords, logToStatusDisplay, plotPredictions, populateCandidateWords, showCandidateWords} from './ui';

const startActionTreeButton = document.getElementById('start-action-tree');
const actionTreeGroupDiv = document.getElementById('action-tree-group');
const messageSpan = document.getElementById('message');

let recognizer;
let transferRecognizer;

const startButton = document.getElementById('start');
const stopButton = document.getElementById('stop');
const predictionCanvas = document.getElementById('prediction-canvas');

if (startButton != null) {
  startButton.addEventListener('click', () => {
    runUI.openRunDialog();
    populateCandidateWords(recognizer.wordLabels());

    const suppressionTimeMillis = 1000;
    const probabilityThreshold = runUI.getPThreshSliderValue();
    console.log(`Starting listen() with p-threshold = ${probabilityThreshold}`);
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
              probabilityThreshold
            })
        .then(() => {
          startButton.disabled = true;
          stopButton.disabled = false;
          runUI.disablePThreshSlider();
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
          runUI.enablePThreshSlider();
          hideCandidateWords();
          runUI.closeRunDialog();
          logToStatusDisplay('Streaming recognition stopped.');
        })
        .catch(err => {
          logToStatusDisplay(
              'ERROR: Failed to stop streaming display: ' + err.message);
        });
  });
}

registerTransferRecognizerCreationCallback(createdTransferRecognizer => {
  transferRecognizer = createdTransferRecognizer;
  recognizer = transferRecognizer;
  console.log(
      `Transfer recognizer loaded with parameters: ` +
      `${JSON.stringify(transferRecognizer.params())}`);
  startButton.disabled = false;
  refreshStartActionTreeButtonStatus();
});

export function refreshStartActionTreeButtonStatus() {
  try {
    parseActionTreeConfig();
    if (transferRecognizer != null) {
      startActionTreeButton.disabled = false;
    }
  } catch (err) {
    startActionTreeButton.disabled = true;
  }
}

// TODO(cais): Restore.
// const toTrainingButton = document.getElementById('to-training');
// toTrainingButton.addEventListener('click', () => {
//   window.location.href = './train.html';
// });

let timedMenu;

startActionTreeButton.addEventListener('click',  async () =>  {
  try {
    actionTreeGroupDiv.style.display = 'block';
    const activeRecognizer =
        transferRecognizer == null ? recognizer : transferRecognizer;

    // Construct TimedMenu.
    const configAndUniqueNames = parseActionTreeConfig();

    const timedMenuConfig = configAndUniqueNames.config;
    const uniqueNames = configAndUniqueNames.uniqueNames;

    const wordLabelsNoNoise = activeRecognizer.wordLabels().slice();
    if (wordLabelsNoNoise.indexOf(SpeechCommands.BACKGROUND_NOISE_TAG) !== -1) {
      wordLabelsNoNoise.splice(
          wordLabelsNoNoise.indexOf(SpeechCommands.BACKGROUND_NOISE_TAG), 1);
    }
    uniqueNames.forEach(name => {
      if (wordLabelsNoNoise.indexOf(name) === -1) {
        throw new Error(
            `Cannot start action tree: ` +
            `The word "${name}" is missing from the model.`);
      }
    });

    const tickMillis = 250;
    const timeToLiveMultiplier = runUI.getTTLMultiplierSliderValue();
    timedMenu = new TimedMenu(
        timedMenuConfig,
        async (stateSequence, stateChangeType, timeOutAction) => {
          if (stateChangeType === 'advance') {
            playAudio('blip-c-04.wav');
          } else if (stateChangeType === 'regress') {
            playAudio('cancel-miss-chime.wav');
            if (timeOutAction != null) {
              executeTimedMenuAction(timeOutAction);
            }
          }
          drawActionTree('action-tree', timedMenuConfig, stateSequence);
        }, {tickMillis, timeToLiveMultiplier});

    if (timedMenuConfig.resetWord != null) {
      console.log(`Reset word: ${timedMenuConfig.resetWord}`);
    }

    const suppressionTimeMillis = runUI.getSuppressionTimeSliderValue();
    const probabilityThreshold = runUI.getPThreshSliderValue();
    console.log(
        `Starting listen() with p-threshold = ${probabilityThreshold}; ` +
        `suppression time = ${suppressionTimeMillis} ms`);
    await activeRecognizer.listen(result => {
        const wordLabels = activeRecognizer.wordLabels();
        let maxScore = -Infinity;
        let winningWord;
        for (let i = 0; i < wordLabels.length; ++i) {
          if (result.scores[i] > maxScore) {
            winningWord = wordLabels[i];
            maxScore = result.scores[i];
          }
        }
        console.log(
            `Winning word: ${winningWord} (p=${maxScore.toFixed(4)})`);

        const action = timedMenu.registerEvent(winningWord);
        if (action != null) {
          executeTimedMenuAction(action);
        }
        if (action != null) {
          console.log(`Timed-menu action: ${action}`);
        }
      }, {
        includeSpectrogram: true,
        suppressionTimeMillis,
        probabilityThreshold
      });
    runUI.disablePThreshSlider();
    runUI.disableSuppressionTimeSlider();
    startButton.disabled = true;
    stopButton.disabled = false;
    refreshStartActionTreeButtonStatus();

    startActionTreeButton.disabled = true;
    showMessage(
        `Action tree started, words: ` +
        `${wordLabelsNoNoise.join(', ')} ` +
        `(p-thresh: ${probabilityThreshold}; ` +
        `supression: ${suppressionTimeMillis} ms)`);
  } catch (err) {
    console.error(err);
    actionTreeGroupDiv.style.display = 'none';
    showMessage(err.message, 'error');
  }
});

stopButton.addEventListener('click', () => {
  if (timedMenu != null) {
    timedMenu.stopTimer();
    timedMenu = null;
    actionTreeGroupDiv.style.display = 'none';
  }
  runUI.enablePThreshSlider();
  runUI.enableSuppressionTimeSlider();
  refreshStartActionTreeButtonStatus();
});

const cachedAudioObjects = {};
function playAudio(audioFile) {
  if (!(audioFile in cachedAudioObjects)) {
    cachedAudioObjects[audioFile] = new Audio(audioFile);
  }
  cachedAudioObjects[audioFile].play();
}

const MESSAGE_DURATION_MILLIS = 4000;
export function showMessage(message, type) {
  messageSpan.textContent = message;
  if (type === 'error') {
    messageSpan.style['color'] = 'red';
    messageSpan.style['font-weight'] = 'bold';
  } else {
    messageSpan.style['color'] = 'blue';
    messageSpan.style['font-weight'] = 'regular';
  }
  setTimeout(() => {
    messageSpan.textContent = '';
  }, MESSAGE_DURATION_MILLIS);
}

(async function() {
  recognizer = SpeechCommands.create('BROWSER_FFT');

  recognizer.ensureModelLoaded().then(() => {
    registerRecognizer(recognizer);
  });

  populateSavedTransferModelsSelect();
})();
