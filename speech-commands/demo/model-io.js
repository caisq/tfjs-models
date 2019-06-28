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

import * as tf from '@tensorflow/tfjs';
import * as SpeechCommands from '../src';

import {showErrorOnButton, showInfoOnButton, showSnackbar} from './ui';

const loadTransferModelButton = document.getElementById('load-transfer-model');
const saveTransferModelButton = document.getElementById('save-transfer-model');
const savedTransferModelsSelect = document.getElementById('saved-transfer-models');
const deleteTransferModelButton = document.getElementById('delete-transfer-model');

const transferModelNameInput = document.getElementById('transfer-model-name');
const learnWordsInput = document.getElementById('learn-words');
const durationMultiplierSelect = document.getElementById('duration-multiplier');
const enterLearnWordsButton = document.getElementById('enter-learn-words');

const downloadTransferModelAsFilesButton =
    document.getElementById('download-transfer-model-as-files');
const loadRemoteTransferModelButton =
    document.getElementById('load-remote-transfer-model');
const remoteTransferModelURLInput =
    document.getElementById('remote-transfer-model-url');

let loadTransferModelButtonOriginalText;
if (loadTransferModelButton != null) {
  loadTransferModelButtonOriginalText = loadTransferModelButton.textContent;
  loadTransferModelButton.textContent = 'Loading base model...';
}

let recognizer;
export function registerRecognizer(inputRecognizer) {
  recognizer = inputRecognizer;
  if (recognizer != null) {
    if (loadTransferModelButton !== null) {
      loadTransferModelButton.textContent = loadTransferModelButtonOriginalText;
      loadTransferModelButton.disabled = false;
    }
    if (loadRemoteTransferModelButton != null) {
      loadRemoteTransferModelButton.disabled = false;
    }
  }
}

let transferRecognizer;
export function registerTransferRecognizer(inputTransferRecognizer) {
  transferRecognizer = inputTransferRecognizer;
}

let transferRecognizerCreationCallback;
export function registerTransferRecognizerCreationCallback(callback) {
  transferRecognizerCreationCallback = callback;
}

let postLoadTransferModelCallback;

export function setPostLoadTransferModelCallback(callback) {
  postLoadTransferModelCallback = callback;
}

if (loadTransferModelButton != null) {
  loadTransferModelButton.addEventListener('click', async () => {
    const transferModelName = savedTransferModelsSelect.value;
    const loadedTransferRecognizer =
        recognizer.createTransfer(transferModelName);
    await loadedTransferRecognizer.load();
    if (transferModelNameInput != null) {
      transferModelNameInput.value = transferModelName;
      transferModelNameInput.disabled = true;
    }
    if (learnWordsInput != null) {
      learnWordsInput.value = loadedTransferRecognizer.wordLabels().join(',');
      learnWordsInput.disabled = true;
    }
    if (durationMultiplierSelect != null) {
      durationMultiplierSelect.disabled = true;
    }
    if (enterLearnWordsButton != null) {
      enterLearnWordsButton.disabled = true;
    }
    if (saveTransferModelButton != null) {
      saveTransferModelButton.disabled = true;
    }
    if (loadTransferModelButton != null) {
      loadTransferModelButton.disabled = true;
      if (downloadTransferModelAsFilesButton != null) {
        downloadTransferModelAsFilesButton.disabled = false;
      }
      loadTransferModelButton.textContent = 'Model loaded!';
    }
    if (transferRecognizerCreationCallback != null) {
      registerTransferRecognizer(loadedTransferRecognizer);
      transferRecognizerCreationCallback(loadedTransferRecognizer);
    }

    if (postLoadTransferModelCallback != null) {
      postLoadTransferModelCallback();
    }

    showSnackbar(`Loaded model "${transferModelName}"`);
  });
}

if (downloadTransferModelAsFilesButton != null) {
  downloadTransferModelAsFilesButton.addEventListener('click', async () => {
    if (transferRecognizer == null) {
      showErrorOnButton(
          downloadTransferModelAsFilesButton, 'Load model first', 3000);
    }
    console.log(`Downloading transfer model: ${transferRecognizer.name}`);
    const anchor = document.createElement('a');
    anchor.download = 'metadata.json';
    anchor.href = window.URL.createObjectURL(
        new Blob([JSON.stringify(transferRecognizer.getMetadata())],
                 {type: 'application/json'}));
    anchor.click();
    await transferRecognizer.model.save('downloads://model');
  });
}

if (loadRemoteTransferModelButton != null) {
  loadRemoteTransferModelButton.addEventListener('click', async () => {
    const originalButtonText = loadRemoteTransferModelButton.textContent;
    loadRemoteTransferModelButton.disabled = true;
    loadRemoteTransferModelButton.textContent = 'Loading...';
    try {
      const metadataURL = remoteTransferModelURLInput.value.trim();
      if (metadataURL.length === 0) {
        showErrorOnButton(
            loadRemoteTransferModelButton, 'Enter URL first!', 2000);
      }
      const metadata = await (await fetch(metadataURL)).json();
      console.log('Remote transfer model metadata:', metadata);
      const modelJsonPath =
          metadataURL.slice(0, metadataURL.lastIndexOf('/')) + '/model.json';
      console.log(`Loading model from modelJsonPath: ${modelJsonPath}`);
      let modelName = metadata.modelName;
      const existingModelNames = await SpeechCommands.listSavedTransferModels();
      let suffix = 1;
      while (existingModelNames.indexOf(modelName) !== -1) {
        modelName = `${metadata.modelName} (${suffix++})`;
      }

      console.log(`Loaded model will have name: ${modelName}`);
      const loadedTransferRecognizer = recognizer.createTransfer(modelName);
      loadedTransferRecognizer.model = await tf.loadLayersModel(modelJsonPath);
      // Warning: protected access!
      loadedTransferRecognizer.words = metadata.wordLabels;
      await loadedTransferRecognizer.save();

      await populateSavedTransferModelsSelect();
      loadRemoteTransferModelButton.textContent = originalButtonText;
      loadRemoteTransferModelButton.disabled = false;
      registerTransferRecognizer(loadedTransferRecognizer);
      showInfoOnButton(
          loadRemoteTransferModelButton, `Loaded and saved "${modelName}"`, 4000);
    } catch (err) {
      loadRemoteTransferModelButton.textContent = originalButtonText;
      console.error(err);
      showErrorOnButton(
          loadRemoteTransferModelButton, 'ERROR: Loading failed', 4000);
    }
  });
}

if (saveTransferModelButton != null) {
  saveTransferModelButton.addEventListener('click', async () => {
    await transferRecognizer.save();
    await populateSavedTransferModelsSelect();
    saveTransferModelButton.textContent = 'Model saved!';
    saveTransferModelButton.disabled = true;
  });
}

if (deleteTransferModelButton != null) {
  deleteTransferModelButton.addEventListener('click', async () => {
    const transferModelName = savedTransferModelsSelect.value;
    if (!confirm(`Are you sure you want to delete model ` +
        `${transferModelName}?`)) {
      showInfoOnButton(deleteTransferModelButton, 'Deletion canceled', 2000);
      return;
    }
    await SpeechCommands.deleteSavedTransferModel(transferModelName);
    deleteTransferModelButton.disabled = true;
    deleteTransferModelButton.textContent = `Deleted "${transferModelName}"`;
    await populateSavedTransferModelsSelect();
  });
}

export async function populateSavedTransferModelsSelect() {
  const savedModelKeys = await SpeechCommands.listSavedTransferModels();
  while (savedTransferModelsSelect.firstChild) {
    savedTransferModelsSelect.removeChild(
        savedTransferModelsSelect.firstChild);
  }
  if (savedModelKeys.length > 0) {
    for (const key of savedModelKeys) {
      const option = document.createElement('option');
      option.textContent = key;
      option.id = key;
      savedTransferModelsSelect.appendChild(option);
    }
  }
}

export function enableLoadAndDeleteModelButtons() {
  if (loadTransferModelButton != null) {
    loadTransferModelButton.disabled = false;
  }
  deleteTransferModelButton.disabled = false;
}

export function enableSaveModelButton() {
  saveTransferModelButton.disabled = false;
}

export function clickSaveModelButton() {
  saveTransferModelButton.click();
}