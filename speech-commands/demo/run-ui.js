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

import {MDCDialog} from '@material/dialog';
import {MDCSelect} from '@material/select';
import {MDCSlider} from '@material/slider';
import {MDCTextField} from '@material/textfield';

/**
 * Logic for the top tabs.
 */
let activeTab = 'run-tab';
const runTab = document.getElementById('run-tab');
const actionTreeTab = document.getElementById('action-tree-tab');
const optionsTab = document.getElementById('options-tab');
runTab.addEventListener('click', () => {
  activeTab = 'run-tab';
  updateTabStatus();
});
actionTreeTab.addEventListener('click', () => {
  activeTab = 'action-tree-tab';
  updateTabStatus();
});
optionsTab.addEventListener('click', () => {
  activeTab = 'options-tab';
  updateTabStatus();
});

const runSection = document.getElementById('run-section');
const modelIOSection = document.getElementById('model-io-section');
const actionTreeSection = document.getElementById('action-tree-section');
const optionsSection = document.getElementById('options-section');

const runIndicator = document.getElementById('run-tab-indicator');
const actionTreeIndicator = document.getElementById('action-tree-tab-indicator');
const optionsIndicator = document.getElementById('options-tab-indicator');

export function updateTabStatus(forceTab) {
  if (forceTab != null) {
    activeTab = forceTab;
  }

  if (activeTab === 'run-tab') {
    runTab.classList.add('mdc-tab--active');
    actionTreeTab.classList.remove('mdc-tab--active');
    optionsTab.classList.remove('mdc-tab--active');
    runIndicator.classList.add('mdc-tab-indicator--active');
    actionTreeIndicator.classList.remove('mdc-tab-indicator--active');
    optionsIndicator.classList.remove('mdc-tab-indicator--active');
    runSection.style['display'] = 'block';
    modelIOSection.style['display'] = 'block';
    actionTreeSection.style['display'] = 'none';
    optionsSection.style['display'] = 'none';

    setTimeout(() => savedTransferModelsSelect.focus(), 500);
  } else if (activeTab === 'action-tree-tab') {
    runTab.classList.remove('mdc-tab--active');
    actionTreeTab.classList.add('mdc-tab--active');
    optionsTab.classList.remove('mdc-tab--active');
    runIndicator.classList.remove('mdc-tab-indicator--active');
    actionTreeIndicator.classList.add('mdc-tab-indicator--active');
    optionsIndicator.classList.remove('mdc-tab-indicator--active');
    runSection.style['display'] = 'none';
    modelIOSection.style['display'] = 'none';
    actionTreeSection.style['display'] = 'block';
    optionsSection.style['display'] = 'none';

    setTimeout(() => savedActionTreesSelect.focus(), 250);
  } else if (activeTab === 'options-tab') {
    runTab.classList.remove('mdc-tab--active');
    actionTreeTab.classList.remove('mdc-tab--active');
    optionsTab.classList.add('mdc-tab--active');
    runIndicator.classList.remove('mdc-tab-indicator--active');
    actionTreeIndicator.classList.remove('mdc-tab-indicator--active');
    optionsIndicator.classList.add('mdc-tab-indicator--active');
    runSection.style['display'] = 'none';
    modelIOSection.style['display'] = 'none';
    actionTreeSection.style['display'] = 'none';
    optionsSection.style['display'] = 'block';
  }
}

/**
 * Logic for selects.
 */
const savedTransferModelsSelectDiv =
    document.getElementById('saved-transfer-models-div');
const savedTransferModelsSelect =
    document.getElementById('saved-transfer-models');
new MDCSelect(savedTransferModelsSelectDiv);

const savedActionTreesSelectDiv = document.getElementById('saved-trees-div');
const savedActionTreesSelect = document.getElementById('saved-trees');
new MDCSelect(savedActionTreesSelectDiv);

/**
 * Logic for sliders
 */
const ttlMultiplierSlider = new MDCSlider(document.getElementById('ttl-multiplier'));
export function getTTLMultiplierSliderValue() {
  return Number.parseInt(ttlMultiplierSlider.value);
}

const pThreshSlider = new MDCSlider(document.getElementById('p-thresh'));
export function getPThreshSliderValue() {
  return Number.parseFloat(pThreshSlider.value);
}
export function disablePThreshSlider() {
  pThreshSlider.disabled = true;
}
export function enablePThreshSlider() {
  pThreshSlider.disabled = false;
}

const suppressionTimeSlider =
    new MDCSlider(document.getElementById('suppression-time'));
export function getSuppressionTimeSliderValue() {
  return Number.parseFloat(suppressionTimeSlider.value);
}
export function disableSuppressionTimeSlider() {
  suppressionTimeSlider.disabled = true;
}
export function enableSuppressionTimeSlider() {
  suppressionTimeSlider.disabled = false;
}

/**
 * Text fields
 */
const mdcTextFields = document.querySelectorAll('.mdc-text-field');
mdcTextFields.forEach(textField => new MDCTextField(textField));

/**
 * Logic for dialog(s).
 */
const runDialog = new MDCDialog(document.getElementById('run-dialog'));
export function openRunDialog() {
  runDialog.open();
}
export function closeRunDialog() {
  runDialog.close();
}

const trainingDialogDismissButton = document.getElementById('run-dismiss');
export function disableTrainingDialogDismissButton() {
  trainingDialogDismissButton.disabled = true;
}
export function enableTrainingDialogDismissButton() {
  trainingDialogDismissButton.disabled = false;
}


updateTabStatus();
