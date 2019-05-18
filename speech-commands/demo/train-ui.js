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

import {MDCTextField} from '@material/textfield';
import {MDCRipple} from '@material/ripple';

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

const mainModelSection = document.getElementById('transfer-learn-section');
const datasetIOSection = document.getElementById('dataset-io-section');
const modelIOSection = document.getElementById('model-io-section');

mainModelSection.style['display'] = 'block';
datasetIOSection.style['display'] = 'none';
modelIOSection.style['display'] = 'none';

function updateTabStatus() {
  if (activeTab === 'transfer-learn-tab') {
    transferLearnTab.classList.add('mdc-tab--active');
    datasetIOTab.classList.remove('mdc-tab--active');
    modelIOTab.classList.remove('mdc-tab--active');
    mainModelSection.style['display'] = 'block';
    datasetIOSection.style['display'] = 'none';
    modelIOSection.style['display'] = 'none';
  } else if (activeTab === 'dataset-io-tab') {
    transferLearnTab.classList.remove('mdc-tab--active');
    datasetIOTab.classList.add('mdc-tab--active');
    modelIOTab.classList.remove('mdc-tab--active');
    mainModelSection.style['display'] = 'none';
    datasetIOSection.style['display'] = 'block';
    modelIOSection.style['display'] = 'none';
  } else if (activeTab === 'model-io-tab') {
    transferLearnTab.classList.remove('mdc-tab--active');
    datasetIOTab.classList.remove('mdc-tab--active');
    modelIOTab.classList.add('mdc-tab--active');
    mainModelSection.style['display'] = 'none';
    datasetIOSection.style['display'] = 'none';
    modelIOSection.style['display'] = 'block';
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

// DEBUG
// const iconButtonRipple = new MDCRipple(document.querySelector('.mdc-icon-button'));
// iconButtonRipple.unbounded = true;