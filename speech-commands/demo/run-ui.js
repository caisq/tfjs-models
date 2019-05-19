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

import {MDCSelect} from '@material/select';
import {MDCSlider} from '@material/slider';
import {MDCTextField} from '@material/textfield'

/**
 * Logic for selects.
 */
const savedTransferModelsSelectDiv =
    document.getElementById('saved-transfer-models-div');
const savedTransferModelsSelect =
    document.getElementById('saved-transfer-models');
new MDCSelect(savedTransferModelsSelectDiv);
setTimeout(() => savedTransferModelsSelect.focus(), 250);

const savedActionTreesSelectDiv = document.getElementById('saved-trees-div');
const savedActionTreesSelect = document.getElementById('saved-trees');
new MDCSelect(savedActionTreesSelectDiv);
setTimeout(() => savedActionTreesSelect.focus(), 250);

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