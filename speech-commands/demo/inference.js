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

let recognizer;
let transferRecognizer;  // TODO(cais): Make use of these.

const toTrainingButton = document.getElementById('to-training');

toTrainingButton.addEventListener('click', () => {
  window.location.href = './index.html';
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
