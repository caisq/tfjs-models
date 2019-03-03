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
import * as tf from '@tensorflow/tfjs';

import * as SpeechCommands from '../src';

import {DatasetViz, removeNonFixedChildrenFromWordDiv} from './dataset-vis';
import {populateSavedTransferModelsSelect, registerRecognizer, registerTransferRecognizer, registerTransferRecognizerCreationCallback, enableLoadAndDeleteModelButtons, enableSaveModelButton} from './model-io';
import {logToStatusDisplay} from './ui';
import * as basicInference from './basic-inference';

const toInferenceButton = document.getElementById('to-inference');


const epochsInput = document.getElementById('epochs');
const fineTuningEpochsInput = document.getElementById('fine-tuning-epochs');

const datasetIOButton = document.getElementById('dataset-io');
const datasetIOInnerDiv = document.getElementById('dataset-io-inner');
const downloadAsFileButton = document.getElementById('download-dataset');
const datasetFileInput = document.getElementById('dataset-file-input');
const uploadFilesButton = document.getElementById('upload-dataset');

const remoteDatasetURLInput = document.getElementById('remote-dataset-url');
const loadRemoteDatasetButton = document.getElementById('load-remote-dataset');

const evalModelOnDatasetButton = document.getElementById('eval-model-on-dataset');
const evalResultsSpan = document.getElementById('eval-results');

const BACKGROUND_NOISE_TAG = SpeechCommands.BACKGROUND_NOISE_TAG;

/**
 * Transfer learning-related UI componenets.
 */
const transferModelNameInput = document.getElementById('transfer-model-name');
const learnWordsInput = document.getElementById('learn-words');
const durationMultiplierSelect = document.getElementById('duration-multiplier');
const enterLearnWordsButton = document.getElementById('enter-learn-words');
const collectButtonsDiv = document.getElementById('collect-words');
const startTransferLearnButton =
    document.getElementById('start-transfer-learn');

// Minimum required number of examples per class for transfer learning.
const MIN_EXAMPLES_PER_CLASS = 16;

let recognizer;
let transferRecognizer;
let transferWords;
let transferDurationMultiplier;

registerTransferRecognizerCreationCallback(createdTransferRecognizer => {
  transferRecognizer = createdTransferRecognizer;
  basicInference.setRecognizer(transferRecognizer);
});

(async function() {
  logToStatusDisplay('Creating recognizer...');
  recognizer = SpeechCommands.create('BROWSER_FFT');

  await populateSavedTransferModelsSelect();

  // Make sure the tf.Model is loaded through HTTP. If this is not
  // called here, the tf.Model will be loaded the first time
  // `listen()` is called.
  console.log('Ensuring model loaded ...');
  recognizer.ensureModelLoaded()
      .then(() => {
        registerRecognizer(recognizer);
        basicInference.setRecognizer(recognizer);
        enterLearnWordsButton.disabled = false;
        enableLoadAndDeleteModelButtons();

        console.log('Setting name of input words');  // DEBUG
        transferModelNameInput.value = `model-${getDateString()}`;

        logToStatusDisplay('Model loaded.');

        const params = recognizer.params();
        logToStatusDisplay(`sampleRateHz: ${params.sampleRateHz}`);
        logToStatusDisplay(`fftSize: ${params.fftSize}`);
        logToStatusDisplay(
            `spectrogramDurationMillis: ` +
            `${params.spectrogramDurationMillis.toFixed(2)}`);
        logToStatusDisplay(
            `tf.Model input shape: ` +
            `${JSON.stringify(recognizer.modelInputShape())}`);
      })
      .catch(err => {
        console.error(err);
        logToStatusDisplay(
            'Failed to load model for recognizer: ' + err.message);
      });
})();

toInferenceButton.addEventListener('click', () => {
  window.location.href = './run.html';
});

const cachedAudioObjects = {};
function playAudio(audioFile) {
  if (!(audioFile in cachedAudioObjects)) {
    cachedAudioObjects[audioFile] = new Audio(audioFile);
  }
  cachedAudioObjects[audioFile].play();
}

/**
 * Transfer learning logic.
 */

/** Scroll to the bottom of the page */
function scrollToPageBottom() {
  const scrollingElement = (document.scrollingElement || document.body);
  scrollingElement.scrollTop = scrollingElement.scrollHeight;
}

let collectWordButtons = {};
let datasetViz;

/**
 * Create div elements for transfer words.
 *
 * @param {string[]} transferWords The array of transfer words.
 * @returns {Object} An object mapping word to th div element created for it.
 */
function createWordDivs(transferWords) {
  // Clear collectButtonsDiv first.
  while (collectButtonsDiv.firstChild) {
    collectButtonsDiv.removeChild(collectButtonsDiv.firstChild);
  }
  datasetViz = new DatasetViz(transferRecognizer,
                              collectButtonsDiv,
                              MIN_EXAMPLES_PER_CLASS,
                              startTransferLearnButton,
                              downloadAsFileButton,
                              transferDurationMultiplier);

  const wordDivs = {};
  for (const word of transferWords) {
    const wordDiv = document.createElement('div');
    wordDiv.classList.add('word-div');
    wordDivs[word] = wordDiv;
    wordDiv.setAttribute('word', word);
    const button = document.createElement('button');
    button.classList.add('word-button');
    button.setAttribute('isFixed', 'true');
    button.style['display'] = 'inline-block';
    button.style['vertical-align'] = 'middle';

    const displayWord = word === BACKGROUND_NOISE_TAG ? 'noise' : word;

    button.textContent = `${displayWord} (0)`;
    wordDiv.appendChild(button);
    wordDiv.className = 'transfer-word';
    collectButtonsDiv.appendChild(wordDiv);
    collectWordButtons[word] = button;

    let durationInput;
    if (word === BACKGROUND_NOISE_TAG) {
      // Create noise duration input.
      durationInput = document.createElement('input');
      durationInput.setAttribute('isFixed', 'true');
      durationInput.value = '10';
      durationInput.style['width'] = '70px';
      wordDiv.appendChild(durationInput);
      // Create time-unit span for noise duration.
      const timeUnitSpan = document.createElement('span');
      timeUnitSpan.setAttribute('isFixed', 'true');
      timeUnitSpan.classList.add('settings');
      timeUnitSpan.style['vertical-align'] = 'middle';
      timeUnitSpan.textContent = 'seconds';
      wordDiv.appendChild(timeUnitSpan);
    }

    button.addEventListener('click', async () => {
      disableAllCollectWordButtons();
      const collectExampleOptions = {};
      let durationSec;
      // _background_noise_ examples are special, in that user can specify
      // the length of the recording (in seconds).
      if (word === BACKGROUND_NOISE_TAG) {
        collectExampleOptions.durationSec =
            Number.parseFloat(durationInput.value);
        durationSec = collectExampleOptions.durationSec;
      } else {
        collectExampleOptions.durationMultiplier = transferDurationMultiplier;
        durationSec = 2;
      }

      // Show collection progress bar.
      removeNonFixedChildrenFromWordDiv(wordDiv);
      const progressBar = document.createElement('progress');
      progressBar.value = 0;
      progressBar.style['width'] = `${Math.round(window.innerWidth * 0.25)}px`;
      // Update progress bar in increments.
      const intervalJob = setInterval(() => {
        progressBar.value += 0.05;
      }, durationSec * 1e3 / 20);
      wordDiv.appendChild(progressBar);

      const spectrogram = await transferRecognizer.collectExample(
          word, collectExampleOptions);

      clearInterval(intervalJob);
      wordDiv.removeChild(progressBar);
      const examples = transferRecognizer.getExamples(word)
      const exampleUID = examples[examples.length - 1].uid;
      await datasetViz.drawExample(wordDiv, word, spectrogram, exampleUID);
      enableAllCollectWordButtons();
    });
  }
  return wordDivs;
}

enterLearnWordsButton.addEventListener('click', () => {
  const modelName = transferModelNameInput.value;
  if (modelName == null || modelName.length === 0) {
    enterLearnWordsButton.textContent = 'Need model name!';
    setTimeout(() => {
      enterLearnWordsButton.textContent = 'Enter transfer words';
    }, 2000);
    return;
  }

  enterLearnWordsButton.disabled = true;

  transferDurationMultiplier = durationMultiplierSelect.value;

  learnWordsInput.disabled = true;
  enterLearnWordsButton.disabled = true;
  transferWords = learnWordsInput.value.trim().split(',').map(w => w.trim());
  if (transferWords.indexOf(BACKGROUND_NOISE_TAG)) {
    transferWords.push(BACKGROUND_NOISE_TAG);
  }
  transferWords.sort();
  if (transferWords == null || transferWords.length <= 1) {
    logToStatusDisplay('ERROR: Invalid list of transfer words.');
    return;
  }

  transferRecognizer = recognizer.createTransfer(modelName);
  registerTransferRecognizer(transferRecognizer);
  createWordDivs(transferWords);

  scrollToPageBottom();
});

function disableAllCollectWordButtons() {
  for (const word in collectWordButtons) {
    collectWordButtons[word].disabled = true;
  }
}

function enableAllCollectWordButtons() {
  for (const word in collectWordButtons) {
    collectWordButtons[word].disabled = false;
  }
}

function disableFileUploadControls() {
  datasetFileInput.disabled = true;
  uploadFilesButton.disabled = true;
}

startTransferLearnButton.addEventListener('click', async () => {
  startTransferLearnButton.disabled = true;
  startTransferLearnButton.textContent = 'Transfer learning starting...';
  await tf.nextFrame();

  const INITIAL_PHASE = 'initial';
  const FINE_TUNING_PHASE = 'fineTuningPhase';

  const epochs = parseInt(epochsInput.value);
  const fineTuningEpochs = parseInt(fineTuningEpochsInput.value);
  const trainLossValues = {};
  const valLossValues = {};
  const trainAccValues = {};
  const valAccValues = {};

  for (const phase of [INITIAL_PHASE, FINE_TUNING_PHASE]) {
    const phaseSuffix = phase === FINE_TUNING_PHASE ? ' (FT)' : '';
    const lineWidth = phase === FINE_TUNING_PHASE ? 2 : 1;
    trainLossValues[phase] = {
      x: [],
      y: [],
      name: 'train' + phaseSuffix,
      mode: 'lines',
      line: {width: lineWidth}
    };
    valLossValues[phase] = {
      x: [],
      y: [],
      name: 'val' + phaseSuffix,
      mode: 'lines',
      line: {width: lineWidth}
    };
    trainAccValues[phase] = {
      x: [],
      y: [],
      name: 'train' + phaseSuffix,
      mode: 'lines',
      line: {width: lineWidth}
    };
    valAccValues[phase] = {
      x: [],
      y: [],
      name: 'val' + phaseSuffix,
      mode: 'lines',
      line: {width: lineWidth}
    };
  }

  function plotLossAndAccuracy(epoch, loss, acc, val_loss, val_acc, phase) {
    const displayEpoch = phase === FINE_TUNING_PHASE ? (epoch + epochs) : epoch;
    trainLossValues[phase].x.push(displayEpoch);
    trainLossValues[phase].y.push(loss);
    trainAccValues[phase].x.push(displayEpoch);
    trainAccValues[phase].y.push(acc);
    valLossValues[phase].x.push(displayEpoch);
    valLossValues[phase].y.push(val_loss);
    valAccValues[phase].x.push(displayEpoch);
    valAccValues[phase].y.push(val_acc);

    Plotly.newPlot(
        'loss-plot',
        [
          trainLossValues[INITIAL_PHASE], valLossValues[INITIAL_PHASE],
          trainLossValues[FINE_TUNING_PHASE], valLossValues[FINE_TUNING_PHASE]
        ],
        {
          width: 480,
          height: 360,
          xaxis: {title: 'Epoch #'},
          yaxis: {title: 'Loss'},
          font: {size: 18}
        });
    Plotly.newPlot(
        'accuracy-plot',
        [
          trainAccValues[INITIAL_PHASE], valAccValues[INITIAL_PHASE],
          trainAccValues[FINE_TUNING_PHASE], valAccValues[FINE_TUNING_PHASE]
        ],
        {
          width: 480,
          height: 360,
          xaxis: {title: 'Epoch #'},
          yaxis: {title: 'Accuracy'},
          font: {size: 18}
        });
    startTransferLearnButton.textContent = phase === INITIAL_PHASE ?
        `Transfer-learning... (${(epoch / epochs * 1e2).toFixed(0)}%)` :
        `Transfer-learning (fine-tuning)... (${
            (epoch / fineTuningEpochs * 1e2).toFixed(0)}%)`

    scrollToPageBottom();
  }

  disableAllCollectWordButtons();
  await transferRecognizer.train({
    epochs,
    validationSplit: 0.25,
    callback: {
      onEpochEnd: async (epoch, logs) => {
        plotLossAndAccuracy(
            epoch, logs.loss, logs.acc, logs.val_loss, logs.val_acc,
            INITIAL_PHASE);
      }
    },
    fineTuningEpochs,
    fineTuningCallback: {
      onEpochEnd: async (epoch, logs) => {
        plotLossAndAccuracy(
            epoch, logs.loss, logs.acc, logs.val_loss, logs.val_acc,
            FINE_TUNING_PHASE);
      }
    }
  });
  enableSaveModelButton();
  transferModelNameInput.value = transferRecognizer.name;
  transferModelNameInput.disabled = true;
  startTransferLearnButton.textContent = 'Transfer learning complete.';
  transferModelNameInput.disabled = false;
  evalModelOnDatasetButton.disabled = false;
});

downloadAsFileButton.addEventListener('click', () => {
  const basename = getDateString();
  const artifacts = transferRecognizer.serializeExamples();

  // Trigger downloading of the data .bin file.
  const anchor = document.createElement('a');
  anchor.download = `${basename}.bin`;
  anchor.href = window.URL.createObjectURL(
      new Blob([artifacts], {type: 'application/octet-stream'}));
  anchor.click();
});

/** Get the base name of the downloaded files based on current dataset. */
function getDateString() {
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

uploadFilesButton.addEventListener('click', async () => {
  const files = datasetFileInput.files;
  if (files == null || files.length !== 1) {
    throw new Error('Must select exactly one file.');
  }
  const datasetFileReader = new FileReader();
  datasetFileReader.onload = async event => {
    try {
      await loadDatasetInTransferRecognizer(event.target.result);
    } catch (err) {
      console.error(err.message);
      const originalTextContent = uploadFilesButton.textContent;
      uploadFilesButton.textContent = err.message;
      setTimeout(() => {
        uploadFilesButton.textContent = originalTextContent;
      }, 2000);
    }
    durationMultiplierSelect.value = `${transferDurationMultiplier}`;
    durationMultiplierSelect.disabled = true;
    enterLearnWordsButton.disabled = true;
  };
  datasetFileReader.onerror = () =>
      console.error(`Failed to binary data from file '${dataFile.name}'.`);
  datasetFileReader.readAsArrayBuffer(files[0]);
});

loadRemoteDatasetButton.addEventListener('click', async () => {
  const url = remoteDatasetURLInput.value;
  console.log(`Loading dataset from ${url} ...`);
  const originalTextContent = loadRemoteDatasetButton.textContent;
  try {
    loadRemoteDatasetButton.textContent = 'Loading dataset...';
    const serialized = await (await fetch(url)).arrayBuffer();
    await loadDatasetInTransferRecognizer(serialized);
    loadRemoteDatasetButton.textContent = originalTextContent;
  } catch (err) {
    console.error(err);
    loadRemoteDatasetButton.textContent = err.message;
    setTimeout(() => {
      loadRemoteDatasetButton.textContent = originalTextContent;
    }, 2000);
  }
});

async function loadDatasetInTransferRecognizer(serialized) {
  const modelName = transferModelNameInput.value;
  if (modelName == null || modelName.length === 0) {
    throw new Error('Need model name!');
  }

  if (transferRecognizer == null) {
    transferRecognizer = recognizer.createTransfer(modelName);
    registerTransferRecognizer(transferRecognizer);
    basicInference.setRecognizer(transferRecognizer);
  }
  transferRecognizer.loadExamples(serialized);
  const exampleCounts = transferRecognizer.countExamples();
  const modelNumFrames = transferRecognizer.modelInputShape()[1];
  const durationMultipliers = [];
  if (transferWords == null) {
    transferWords = [];
  }
  for (const word in exampleCounts) {
    if (transferWords.indexOf(word) === -1) {
      transferWords.push(word);
    }
    const examples = transferRecognizer.getExamples(word);
    for (const example of examples) {
      const spectrogram = example.example.spectrogram;
      // Ignore _background_noise_ examples when determining the duration
      // multiplier of the dataset.
      if (word !== BACKGROUND_NOISE_TAG) {
        durationMultipliers.push(Math.round(
            spectrogram.data.length / spectrogram.frameSize / modelNumFrames));
      }
    }
  }
  transferWords.sort();
  learnWordsInput.value = transferWords.join(',');

  // Determine the transferDurationMultiplier value from the dataset.
  transferDurationMultiplier =
      durationMultipliers.length > 0 ? Math.max(...durationMultipliers) : 1;
  console.log(
      `Deteremined transferDurationMultiplier from uploaded ` +
      `dataset: ${transferDurationMultiplier}`);

  createWordDivs(transferWords);
  datasetViz.redrawAll();
}

evalModelOnDatasetButton.addEventListener('click', async () => {
  const files = datasetFileInput.files;
  if (files == null || files.length !== 1) {
    throw new Error('Must select exactly one file.');
  }
  evalModelOnDatasetButton.disabled = true;
  const datasetFileReader = new FileReader();
  datasetFileReader.onload = async event => {
    try {
      if (transferRecognizer == null) {
        throw new Error('There is no model!');
      }

      // Load the dataset and perform evaluation of the transfer
      // model using the dataset.
      transferRecognizer.loadExamples(event.target.result);
      const evalResult = await transferRecognizer.evaluate({
        windowHopRatio: 0.25,
        wordProbThresholds:
            [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5,
             0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0]
      });
      // Plot the ROC curve.
      const rocDataForPlot = {
        x: [],
        y: []
      };
      evalResult.rocCurve.forEach(item => {
        rocDataForPlot.x.push(item.fpr);
        rocDataForPlot.y.push(item.tpr);
      });

      Plotly.newPlot(
          'roc-plot',
          [rocDataForPlot],
          {
            width: 360,
            height: 360,
            mode: 'markers',
            marker: {
              size: 7
            },
            xaxis: {title: 'False positive rate (FPR)', range: [0, 1]},
            yaxis: {title: 'True positive rate (TPR)', range: [0, 1]},
            font: {size: 18}
          });
      evalResultsSpan.textContent = `AUC = ${evalResult.auc}`;
    } catch (err) {
      const originalTextContent = evalModelOnDatasetButton.textContent;
      evalModelOnDatasetButton.textContent = err.message;
      setTimeout(() => {
        evalModelOnDatasetButton.textContent = originalTextContent;
      }, 2000);
    }
    evalModelOnDatasetButton.disabled = false;
  };
  datasetFileReader.onerror = () =>
      console.error(`Failed to binary data from file '${dataFile.name}'.`);
  datasetFileReader.readAsArrayBuffer(files[0]);
});

datasetIOButton.addEventListener('click', () => {
  if (datasetIOButton.textContent.endsWith(' >>')) {
    datasetIOInnerDiv.style.display = 'inline-block';
    datasetIOButton.textContent =
        datasetIOButton.textContent.replace(' >>', ' <<');
  } else {
    datasetIOInnerDiv.style.display = 'none';
    datasetIOButton.textContent =
        datasetIOButton.textContent.replace(' <<', ' >>');
  }
});
