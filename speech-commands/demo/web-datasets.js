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

import {showErrorOnButton} from "./ui";

const webDatasetsSelect = document.getElementById('web-datasets-select');
const loadRemoteDatasetButton = document.getElementById('load-remote-dataset');

const WEB_DATASETS_MANIFEST_URL =
    'https://storage.googleapis.com/tfjs-speech-commands-models/data/speech-commmands-datasets-manifest.json';

export async function populateWebDatasetsSelect(sampleRateHz) {
  if (!(sampleRateHz > 0)) {
    throw new Error(
        `Expected sampleRateHz to be a positive number, ` +
        `but got ${sampleRateHz}`);
  }
  while (webDatasetsSelect.firstChild) {
    webDatasetsSelect.removeChild(webDatasetsSelect.firstChild);
  }
  const manifest = await (await fetch(WEB_DATASETS_MANIFEST_URL)).json();
  let numAvailable = 0;
  for (const dataset of manifest.datasets) {
    if (dataset.sampleRateHz === sampleRateHz) {
      const option = document.createElement('option');
      const urlItems = dataset.URL.split('/');
      const baseName = urlItems[urlItems.length - 1];
      option.text = baseName;
      option.value = dataset.URL;
      webDatasetsSelect.appendChild(option);
      numAvailable++;
    }
  }
  loadRemoteDatasetButton.disabled = numAvailable === 0;
}

let datasetLoaderFunc;
export function registerWebDatasetLoaderFunc(loaderFunc) {
  datasetLoaderFunc = loaderFunc;
}

const loadedDatasetURLs = [];
loadRemoteDatasetButton.addEventListener('click', async () => {
  if (datasetLoaderFunc == null) {
    throw new Error('datasetLoaderFunc is null or undefined');
  }
  const url = webDatasetsSelect.value;
  if (loadedDatasetURLs.indexOf(url) !== -1) {
    showErrorOnButton(
        loadRemoteDatasetButton, 'This dataset is already loaded!', 2000);
    return;
  }

  console.log(`Loading dataset from ${url} ...`);
  const originalTextContent = loadRemoteDatasetButton.textContent;
  try {
    loadRemoteDatasetButton.textContent = 'Loading dataset...';
    const serialized = await (await fetch(url)).arrayBuffer();
    await datasetLoaderFunc(serialized);
    loadRemoteDatasetButton.textContent = originalTextContent;
    loadedDatasetURLs.push(url);
  } catch (err) {
    console.error(err);
    showErrorOnButton(loadRemoteDatasetButton, err.message, 2000);
  }
});
