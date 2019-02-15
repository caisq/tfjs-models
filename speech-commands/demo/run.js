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
import {populateSavedTransferModelsSelect, registerRecognizer, registerTransferRecognizerCreationCallback} from './model-io';
import * as basicInference from './basic-inference';

import * as SpeechCommands from '../src';
import { getTextureShapeFromLogicalShape } from '@tensorflow/tfjs-core/dist/kernels/webgl/webgl_util';

const startButton = document.getElementById('start');
const stopButton = document.getElementById('stop');
const startActionTreeButton = document.getElementById('start-action-tree');
const probaThresholdInput = document.getElementById('proba-threshold');
const actionTreeGroupDiv = document.getElementById('action-tree-group');
const messageSpan = document.getElementById('message');

let recognizer;
let transferRecognizer;

registerTransferRecognizerCreationCallback(createdTransferRecognizer => {
  transferRecognizer = createdTransferRecognizer;
  basicInference.setRecognizer(transferRecognizer);
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

const toTrainingButton = document.getElementById('to-training');

toTrainingButton.addEventListener('click', () => {
  window.location.href = './train.html';
});

const actionTreeConfigButton = document.getElementById('action-tree-config');
const actionTreeConfigInner = document.getElementById('action-tree-config-inner');

actionTreeConfigButton.addEventListener('click', () => {
  if (actionTreeConfigButton.textContent.endsWith(' >>')) {
    actionTreeConfigInner.style.display = 'inline-block';
    actionTreeConfigButton.textContent =
        actionTreeConfigButton.textContent.replace(' >>', ' <<');
  } else {
    actionTreeConfigInner.style.display = 'none';
    actionTreeConfigButton.textContent =
        actionTreeConfigButton.textContent.replace(' <<', ' >>');
  }
});

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

    const timedMenuTickMillis = 500;
    timedMenu = new SpeechCommands.TimedMenu(
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
        }, {tickMillis: timedMenuTickMillis});

    const suppressionTimeMillis = 1000;
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
        probabilityThreshold: Number.parseFloat(probaThresholdInput.value)
      });
    startButton.disabled = true;
    stopButton.disabled = false;
    refreshStartActionTreeButtonStatus();

    showMessage(
        `Action tree started, recognizing words: ` +
        `${wordLabelsNoNoise.join(', ')}`);
  } catch (err) {
    console.error(err);
    actionTreeGroupDiv.style.display = 'none';
    showMessage(err.message, 'error');
        // 'Invalid action tree. Create or load a valid tree first.', 'error');
  }
});

stopButton.addEventListener('click', () => {
  if (timedMenu != null) {
    timedMenu.stopTimer();
    timedMenu = null;
    actionTreeGroupDiv.style.display = 'none';
  }
  refreshStartActionTreeButtonStatus();
});

const cachedAudioObjects = {};
function playAudio(audioFile) {
  if (!(audioFile in cachedAudioObjects)) {
    cachedAudioObjects[audioFile] = new Audio(audioFile);
  }
  cachedAudioObjects[audioFile].play();
}

(async function() {
  recognizer = SpeechCommands.create('BROWSER_FFT');

  recognizer.ensureModelLoaded().then(() => {
    registerRecognizer(recognizer);
    basicInference.setRecognizer(recognizer);
  });

  const modelIOButton = document.getElementById('model-io');
  modelIOButton.click();

  populateSavedTransferModelsSelect();
})();

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