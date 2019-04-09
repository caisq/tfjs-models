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

const DATASET_DATABASE_NAME = 'speech_commands_datasets';
const DATASET_DATABASE_VERSION = 1;
const DATASET_STORE_NAME = 'dataset_store';
const DATASET_INFO_STORE_NAME = 'dataset_info_store';

function getIndexedDBFactory() {
  const theWindow = window;
  const factory = theWindow.indexedDB || theWindow.mozIndexedDB ||
      theWindow.webkitIndexedDB || theWindow.msIndexedDB ||
      theWindow.shimIndexedDB;
  if (factory == null) {
    throw new Error(
        'The current browser does not appear to support IndexedDB.');
  }
  return factory;
}

function setUpDatasetDatabase(openRequest) {
  const db = openRequest.result;
  db.createObjectStore(DATASET_STORE_NAME, {keyPath: 'datasetPath'});
  db.createObjectStore(DATASET_INFO_STORE_NAME, {keyPath: 'datasetPath'});
}

function getDatasetInfo(transferRecognizer) {
  const exampleCounts = transferRecognizer.countExamples();
  const wordLabels = Object.keys(exampleCounts);
  wordLabels.sort();
  return {
    wordLabels,
    exampleCounts,
    versions: {
      SpeechCommands: SpeechCommands.version,
      TensorFlowJS: tf.version
    },
    timestamp: new Date().getTime()
  };
}

export async function getSavedDatasetsInfo() {
  return new Promise((resolve, reject) => {
    const indexedDB = getIndexedDBFactory();
    const openRequest =
        indexedDB.open(DATASET_DATABASE_NAME, DATASET_DATABASE_VERSION);
    openRequest.onupgradeneeded = () => setUpDatasetDatabase(openRequest);

    openRequest.onsuccess = () => {
      const db = openRequest.result;
      const infoTx = db.transaction(DATASET_INFO_STORE_NAME, 'readwrite');
      const infoStore = infoTx.objectStore(DATASET_INFO_STORE_NAME);
      const getRequest = infoStore.getAll();
      getRequest.onsuccess = () => {
        db.close();
        resolve(getRequest.result);
      };
      getRequest.onerror = () => {
        db.close();
        reject('Failed to get from dataset info store');
      }
    };

    openRequest.onerror = () => reject('Failed to open database');
  });
}

export async function loadSerializedDatasetFromIndexedDB(datasetName) {
  return new Promise((resolve, reject) => {
    const indexedDB = getIndexedDBFactory();
    const openRequest =
        indexedDB.open(DATASET_DATABASE_NAME, DATASET_DATABASE_VERSION);
    openRequest.onupgradeneeded = () => setUpDatasetDatabase(openRequest);

    openRequest.onsuccess = () => {
      const db = openRequest.result;
      const datasetTX = db.transaction(DATASET_STORE_NAME, 'readwrite');
      const datasetStore = datasetTX.objectStore(DATASET_STORE_NAME);
      const getRequest = datasetStore.get(datasetName);
      getRequest.onsuccess = () => {
        db.close();
        resolve(getRequest.result.artifacts);
      };
      getRequest.onerror = () => {
        db.close();
        reject('Failed to get from dataset info store');
      }
    };

    openRequest.onerror = () => reject('Failed to open database');
  });
}

export async function saveDatasetToIndexedDB(datasetName, transferRecognizer) {
  return new Promise((resolve, reject) => {
    const datasetInfo = getDatasetInfo(transferRecognizer);
    const artifacts = transferRecognizer.serializeExamples();

    const indexedDB = getIndexedDBFactory();
    const openRequest =
        indexedDB.open(DATASET_DATABASE_NAME, DATASET_DATABASE_VERSION);
    openRequest.onupgradeneeded = () => setUpDatasetDatabase(openRequest);

    openRequest.onsuccess = () => {
      const db = openRequest.result;

      let infoTx;
      const datasetTx = db.transaction(DATASET_STORE_NAME, 'readwrite');
      const datasetStore = datasetTx.objectStore(DATASET_STORE_NAME);
      const putDatasetRequest =
          datasetStore.put({datasetPath: datasetName, artifacts});
      putDatasetRequest.onsuccess = () => {
        infoTx = db.transaction(DATASET_INFO_STORE_NAME, 'readwrite');
        const infoStore = infoTx.objectStore(DATASET_INFO_STORE_NAME);
        const putInfoRequest =
            infoStore.put({datasetPath: datasetName, datasetInfo});
        // putInfoRequest.onsuccess = () => {
        //   console.log('putInfoRequest success!');
        // };
        putInfoRequest.onerror = () => {
          db.close();
          return reject('Failed to put dataset info');
        };
      };
      putDatasetRequest.onerror = () => {
          db.close();
          return reject('Failed to put dataset');
      }
      datasetTx.oncomplete = () => {
        infoTx.oncomplete = () => {
          db.close();
          return resolve();
        }
      };
    };

    openRequest.onerror = () => reject('Failed to open database');
  });
}
