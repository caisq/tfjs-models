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

import {MDCCheckbox} from '@material/checkbox';
import {MDCDialog} from '@material/dialog';
import {MDCFormField} from '@material/form-field';
import {MDCSelect} from '@material/select';
import {MDCTextField} from '@material/textfield';

/**
 * Logic for the select inputs.
 */
const indexedDBDatasetSelectDiv =
    document.getElementById('indexeddb-datasets-div');
const indexedDBDatasetSelect = document.getElementById('indexeddb-datasets');
new MDCSelect(indexedDBDatasetSelectDiv);

const webDatasetSelectDiv =
    document.getElementById('web-datasets-select-div');
const webDatasetSelect = document.getElementById('web-datasets-select');
new MDCSelect(webDatasetSelectDiv);

const savedTransferModelsSelectDiv =
    document.getElementById('saved-transfer-models-div');
const savedTransferModelsSelect =
    document.getElementById('saved-transfer-models');
new MDCSelect(savedTransferModelsSelectDiv);

/**
 * Logic for checkbox(es).
 */
const mdcCheckboxes = document.querySelectorAll('.mdc-checkbox');
mdcCheckboxes.forEach(checkbox => new MDCCheckbox(checkbox));

const mdcFormFields = document.querySelectorAll('.mdc-form-field');
mdcFormFields.forEach(formField => new MDCFormField(formField));

/**
 * Logic for dialog(s).
 */
const trainingDialog = new MDCDialog(document.getElementById('training-dialog'));
export function openTrainingDialog() {
  trainingDialog.open();
}

const trainingDialogDismissButton = document.getElementById('training-dismiss');
export function disableTrainingDialogDismissButton() {
  trainingDialogDismissButton.disabled = true;
}
export function enableTrainingDialogDismissButton() {
  trainingDialogDismissButton.disabled = false;
}

/**
 * Logic for the top tabs.
 */
let activeTab = 'transfer-learn-tab';
const transferLearnTab = document.getElementById('transfer-learn-tab');
const datasetIOTab = document.getElementById('dataset-io-tab');
const modelIOTab = document.getElementById('model-io-tab');
transferLearnTab.addEventListener('click', () => {
  activeTab = 'transfer-learn-tab';
  updateTabStatus();
});
datasetIOTab.addEventListener('click', () => {
  activeTab = 'dataset-io-tab';
  updateTabStatus();
});
modelIOTab.addEventListener('click', () => {
  activeTab = 'model-io-tab';
  updateTabStatus();
});

const transferLearnSection = document.getElementById('transfer-learn-section');
const datasetIOSection = document.getElementById('dataset-io-section');
const modelIOSection = document.getElementById('model-io-section');

const tarnsferLearnIndicator = document.getElementById('transfer-learn-tab-indicator');
const datasetIOIndicator = document.getElementById('dataset-io-tab-indicator');
const modelIOIndicator = document.getElementById('model-io-tab-indicator');

transferLearnSection.style['display'] = 'block';
datasetIOSection.style['display'] = 'none';
modelIOSection.style['display'] = 'none';

export function updateTabStatus(forceTab) {
  if (forceTab != null) {
    activeTab = forceTab;
  }

  if (activeTab === 'transfer-learn-tab') {
    transferLearnTab.classList.add('mdc-tab--active');
    datasetIOTab.classList.remove('mdc-tab--active');
    modelIOTab.classList.remove('mdc-tab--active');
    tarnsferLearnIndicator.classList.add('mdc-tab-indicator--active');
    datasetIOIndicator.classList.remove('mdc-tab-indicator--active');
    modelIOIndicator.classList.remove('mdc-tab-indicator--active');
    transferLearnSection.style['display'] = 'block';
    datasetIOSection.style['display'] = 'none';
    modelIOSection.style['display'] = 'none';
  } else if (activeTab === 'dataset-io-tab') {
    transferLearnTab.classList.remove('mdc-tab--active');
    datasetIOTab.classList.add('mdc-tab--active');
    modelIOTab.classList.remove('mdc-tab--active');
    tarnsferLearnIndicator.classList.remove('mdc-tab-indicator--active');
    datasetIOIndicator.classList.add('mdc-tab-indicator--active');
    modelIOIndicator.classList.remove('mdc-tab-indicator--active');
    transferLearnSection.style['display'] = 'none';
    datasetIOSection.style['display'] = 'block';
    modelIOSection.style['display'] = 'none';

    indexedDBDatasetSelect.focus();
    webDatasetSelect.focus();
  } else if (activeTab === 'model-io-tab') {
    transferLearnTab.classList.remove('mdc-tab--active');
    datasetIOTab.classList.remove('mdc-tab--active');
    modelIOTab.classList.add('mdc-tab--active');
    tarnsferLearnIndicator.classList.remove('mdc-tab-indicator--active');
    datasetIOIndicator.classList.remove('mdc-tab-indicator--active');
    modelIOIndicator.classList.add('mdc-tab-indicator--active');
    transferLearnSection.style['display'] = 'none';
    datasetIOSection.style['display'] = 'none';
    modelIOSection.style['display'] = 'block';

    savedTransferModelsSelect.focus();
  }
}

const mdcTextFields = document.querySelectorAll('.mdc-text-field');
mdcTextFields.forEach(textField => new MDCTextField(textField));

export function createMdcTextField(id, labelText) {
  const rootDiv = document.createElement('div');
  rootDiv.classList.add('mdc-text-field');
  const textInput = document.createElement('input');
  textInput.classList.add('mdc-text-field__input');
  textInput.id = id;
  rootDiv.appendChild(textInput);
  if (labelText != null) {
    const label = document.createElement('label');
    label.classList.add('mdc-floating-label');
    label.setAttribute('for', id);
    label.textContent = labelText;
    rootDiv.appendChild(label);
  }
  new MDCTextField(rootDiv);
  return {rootDiv, textInput};
}

export function createMdcFloatingActionButton(iconName) {
  const button = document.createElement('button');
  button.classList.add('mdc-fab');
  button.classList.add('mdc-fab--mini');
  const span = document.createElement('span');
  span.classList.add('mdc-fab__icon');
  span.classList.add('material-icons');
  span.textContent = iconName;
  button.appendChild(span);
  return button;
}

export function createMdcSelect(labelText) {
  const div = document.createElement('div');
  div.classList.add('mdc-select');
  const icon = document.createElement('i');
  icon.classList.add('mdc-select__dropdown-icon');
  div.appendChild(icon);
  const input = document.createElement('select');
  input.classList.add('mdc-select__native-control');
  div.appendChild(input);
  const label = document.createElement('label');
  label.classList.add('mdc-floating-label');
  label.textContent = labelText;
  div.appendChild(label);
  new MDCSelect(div);
  return {div, input};
}
