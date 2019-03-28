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

import * as SpeechCommands from '../src';

const modelIOButton = document.getElementById('model-io');
const transferModelSaveLoadInnerDiv = document.getElementById('transfer-model-save-load-inner');

const loadTransferModelButton = document.getElementById('load-transfer-model');
const saveTransferModelButton = document.getElementById('save-transfer-model');
const savedTransferModelsSelect = document.getElementById('saved-transfer-models');
const deleteTransferModelButton = document.getElementById('delete-transfer-model');

const transferModelNameInput = document.getElementById('transfer-model-name');
const learnWordsInput = document.getElementById('learn-words');
const durationMultiplierSelect = document.getElementById('duration-multiplier');
const enterLearnWordsButton = document.getElementById('enter-learn-words');

let recognizer;
export function registerRecognizer(inputRecognizer) {
  recognizer = inputRecognizer;
  if (recognizer != null) {
    loadTransferModelButton.disabled = false;
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

if (modelIOButton != null) {
  modelIOButton.addEventListener('click', () => {

    if (modelIOButton.textContent.endsWith(' >>')) {
      transferModelSaveLoadInnerDiv.style.display = 'inline-block';
      modelIOButton.textContent =
          modelIOButton.textContent.replace(' >>', ' <<');
    } else {
      transferModelSaveLoadInnerDiv.style.display = 'none';
      modelIOButton.textContent =
          modelIOButton.textContent.replace(' <<', ' >>');
    }
  });
}

loadTransferModelButton.addEventListener('click', async () => {
  const transferModelName = savedTransferModelsSelect.value;
  const transferRecognizer = recognizer.createTransfer(transferModelName);
  await transferRecognizer.load();
  if (transferModelNameInput != null) {
    transferModelNameInput.value = transferModelName;
    transferModelNameInput.disabled = true;
  }
  if (learnWordsInput != null) {
    learnWordsInput.value = transferRecognizer.wordLabels().join(',');
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
    loadTransferModelButton.textContent = 'Model loaded!';
  }
  if (transferRecognizerCreationCallback != null) {
    transferRecognizerCreationCallback(transferRecognizer);
  }
});

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
  loadTransferModelButton.disabled = false;
  deleteTransferModelButton.disabled = false;
}

export function enableSaveModelButton() {
  saveTransferModelButton.disabled = false;
}

export function clickSaveModelButton() {
  saveTransferModelButton.click();
}