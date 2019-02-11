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

const startButton = document.getElementById('start');
const startActionTreeButton = document.getElementById('start-action-tree');

let recognizer;
let transferRecognizer;

registerTransferRecognizerCreationCallback(createdTransferRecognizer => {
  transferRecognizer = createdTransferRecognizer;
  basicInference.setRecognizer(transferRecognizer);
  console.log(
      `Transfer recognizer loaded with parameters: ` +
      `${JSON.stringify(transferRecognizer.params())}`);
  startButton.disabled = false;
  startActionTreeButton.disabled = false;
});

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

(async function() {
  recognizer = SpeechCommands.create('BROWSER_FFT');

  recognizer.ensureModelLoaded().then(() => {
    registerRecognizer(recognizer);
    basicInference.setRecognizer(recognizer);
  });

  populateSavedTransferModelsSelect();
})();
