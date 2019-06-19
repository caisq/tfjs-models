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

import * as SpeechCommands from '../src';
import {TimedMenu} from '../src/';

import * as runUI from './run-ui.js'
import {clearRealTimeProbabilities, getDateString, hideCandidateWords, logToStatusDisplay, plotPredictions, plotRealTimeProbabilities, populateCandidateWords, showCandidateWords} from './ui';

const startActionTreeButton = document.getElementById('start-action-tree');
const actionTreeGroupDiv = document.getElementById('action-tree-group');
const messageSpan = document.getElementById('message');

let recognizer;
let transferRecognizer;

// Keep track of positive examples.
let positiveDataset;

// Records all examples, with the "__unlabeled__" label.
let fullTestDataset;

const startButton = document.getElementById('start');
const startRecordFullDatasetButton = document.getElementById('start-record-full-dataset');
const stopButton = document.getElementById('stop');
const predictionCanvas = document.getElementById('prediction-canvas');

const runDialogTitle = document.getElementById('run-dialog-title');

const UNLABELED = '__unlabeled__';

const downloadPositiveExamples =
    document.getElementById('download-positive-examples');
const downloadPositiveExamplesSpan =
    document.getElementById('download-positive-examples-span');
const downloadFullExamples =
    document.getElementById('download-full-examples');
const downloadFullExamplesSpan =
    document.getElementById('download-full-examples-span');

function refreshDownloadPositiveExamples(dataset) {
  if (dataset == null) {
    downloadPositiveExamplesSpan.textContent = `Download positive examples (0)`;
  } else {
    downloadPositiveExamplesSpan.textContent =
        `Download positive examples ` +
        `(${dataset.getExampleCounts()[SpeechCommands.BACKGROUND_NOISE_TAG]})`;
  }
}
refreshDownloadPositiveExamples(null);

function refreshDownloadFullExamples(dataset) {
  if (dataset == null) {
    downloadFullExamplesSpan.textContent = `Download full examples (0)`;
  } else {
    downloadFullExamplesSpan.textContent =
        `Download full examples ` +
        `(${dataset.getExampleCounts()[UNLABELED]})`;
  }
}
refreshDownloadFullExamples(null);

downloadPositiveExamples.addEventListener('click', () => {
  if (positiveDataset != null) {
    const basename = `${transferRecognizer.name}_fp_${getDateString()}`;
    const artifacts = positiveDataset.serialize();

    // Trigger downloading of the data .bin file.
    const anchor = document.createElement('a');
    anchor.download = `${basename}.bin`;
    anchor.href = window.URL.createObjectURL(
        new Blob([artifacts], {type: 'application/octet-stream'}));
    anchor.click();
  }
});

downloadFullExamples.addEventListener('click', () => {
  if (fullTestDataset != null) {
    const basename = `${transferRecognizer.name}_full_${getDateString()}`;
    const artifacts = fullTestDataset.serialize();

    // Trigger downloading of the data .bin file.
    const anchor = document.createElement('a');
    anchor.download = `${basename}.bin`;
    anchor.href = window.URL.createObjectURL(
        new Blob([artifacts], {type: 'application/octet-stream'}));
    anchor.click();
  }
});

let tTestBegin;
let countJob;
function updateRunDialogTitle(pThresh) {
  runDialogTitle.textContent =
    `"${transferRecognizer.name}" running (p-thresh=${pThresh.toFixed(2)}) ` +
    `(${((new Date().getTime() - tTestBegin) / 1e3).toFixed(0)} s)`;
  if (positiveDataset != null) {
    let positiveCount =
        positiveDataset.getExampleCounts()[SpeechCommands.BACKGROUND_NOISE_TAG];
    if (positiveCount == null) {
      positiveCount = 0;
    }
    runDialogTitle.textContent += ` (#positive: ${positiveCount})`;
  } else {
    runDialogTitle.textContent += ` (#positive: 0)`;
  }
}

let lastTestRecognitionEventTime;

function startTestingCallback(recordFullDataset) {
  if (recordFullDataset) {
    // TODO(cais): Draw real-time probability curves if
    // recordFullDataset is true.
    fullTestDataset = new SpeechCommands.Dataset();
  }
  positiveDataset = new SpeechCommands.Dataset();

  runUI.openRunDialog();
  populateCandidateWords(recognizer.wordLabels());

  refreshDownloadPositiveExamples(null);
  refreshDownloadFullExamples(null);

  const probabilityThreshold = runUI.getPThreshSliderValue();
  console.log(`Starting listen() with p-threshold = ${probabilityThreshold}`);
  const wordLabels = recognizer.wordLabels();

  runDialogTitle.textContent = `"${transferRecognizer.name}" running`;

  countJob = setInterval(
      () => updateRunDialogTitle(probabilityThreshold), 1e3);
  tTestBegin = new Date().getTime();
  const suppressionTimeMillis = runUI.getSuppressionTimeSliderValue();
  clearRealTimeProbabilities();
  recognizer
      .listen(
          result => {
            // Append the example to the positive dataset.
            let maxScore = -Infinity;
            let label;
            for (let i = 0; i < wordLabels.length; ++i) {
              if (result.scores[i] > maxScore) {
                maxScore = result.scores[i];
                label = wordLabels[i];
              }
            }

            if (recordFullDataset) {
              fullTestDataset.addExample({
                label: UNLABELED,
                spectrogram: result.spectrogram
              });
              refreshDownloadFullExamples(fullTestDataset);

              // Plot probabilites in real time.
              plotRealTimeProbabilities(
                  wordLabels, result.scores, probabilityThreshold);
            }

            if (maxScore < probabilityThreshold ||
                label === SpeechCommands.BACKGROUND_NOISE_TAG) {
              return;
            }

            const timeNow = new Date().getTime();
            if (lastTestRecognitionEventTime != null &&
                timeNow - lastTestRecognitionEventTime <
                    suppressionTimeMillis) {
              return;
            }
            lastTestRecognitionEventTime = timeNow;

            if (label != SpeechCommands.BACKGROUND_NOISE_TAG) {
              positiveDataset.addExample({
                label: SpeechCommands.BACKGROUND_NOISE_TAG,
                spectrogram: result.spectrogram
              });
              downloadPositiveExamplesSpan.textContent =
                  `Download positive examples ()`;
            }

            refreshDownloadPositiveExamples(positiveDataset);
            plotPredictions(
                predictionCanvas, wordLabels, result.scores, 3, 1000);
          },
          {
            includeSpectrogram: true,
            // During testing, we let the callback be invoked for every
            // window, in order to support recording all spectrograms.
            suppressionTimeMillis: 0,
            probabilityThreshold: 0,
            invokeCallbackOnNoiseAndUnknown: true
          })
      .then(() => {
        startButton.disabled = true;
        startRecordFullDatasetButton.disabled = true;
        stopButton.disabled = false;
        runUI.disablePThreshSlider();
        showCandidateWords();
        logToStatusDisplay('Streaming recognition started.');
      })
      .catch(err => {
        logToStatusDisplay(
            'ERROR: Failed to start streaming display: ' + err.message);
      });

  runUI.registerRunDialogClosingFunction(() => {
    stopButton.click();
  });
}

function stopCallback() {
  recognizer.stopListening()
      .then(() => {
        if (countJob != null) {
          clearInterval(countJob);
        }
        startButton.disabled = false;
        startRecordFullDatasetButton.disabled = false;
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
}

if (startButton != null) {
  const recordFullDataset = false;
  startButton.addEventListener(
      'click', () => startTestingCallback(recordFullDataset));
}

if (startRecordFullDatasetButton != null) {
  const recordFullDataset = true;
  startRecordFullDatasetButton.addEventListener(
      'click', () => startTestingCallback(recordFullDataset));
}

if (stopButton != null) {
  stopButton.addEventListener('click', stopCallback);
}

registerTransferRecognizerCreationCallback(createdTransferRecognizer => {
  transferRecognizer = createdTransferRecognizer;
  recognizer = transferRecognizer;
  console.log(
      `Transfer recognizer loaded with parameters: ` +
      `${JSON.stringify(transferRecognizer.params())}`);
  startButton.disabled = false;
  startRecordFullDatasetButton.disabled = false;
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
    runUI.openRunDialog();
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
    startRecordFullDatasetButton.disabled = true;
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

const currPThreshValue = document.getElementById('current-p-thresh-value');
runUI.registerPThreshSliderChangeCallback(value => {
  currPThreshValue.textContent = value.toFixed(2);
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
