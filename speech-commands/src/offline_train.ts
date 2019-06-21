/**
 * @license
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */

import * as tf from '@tensorflow/tfjs-node-gpu';
import * as argparse from 'argparse';
import * as fs from 'fs';
import * as path from 'path';

import * as speechCommands from './index';
import {TransferSpeechCommandRecognizer} from './types';

global.fetch = require('node-fetch');

function parseArgs() {
  const parser = new argparse.ArgumentParser();
  parser.addArgument('datasetPath', {
    type: 'string',
    help: 'Path to dataset file(s). If there are multiple files, separate ' +
        'paths with commas.'
  });
  parser.addArgument('--windowHopRatio', {
    type: 'float',
    defaultValue: 0.25,
    help: 'Hop ratio used to extract examples from long recordings'
  });
  parser.addArgument('--augmentByMixingNoiseRatio', {
    type: 'float',
    defaultValue: 0.5,
    help: 'Additive ratio for augmenting the data by mixing the word ' +
        'spectrograms with background-noise ones.'
  });
  parser.addArgument('--epochs', {
    type: 'int',
    defaultValue: 50,
    help: 'Number of initial (non-fine-tuning) training epochs'
  });
  parser.addArgument(
      '--fineTuningEpochs',
      {type: 'int', defaultValue: 50, help: 'Number of fine-tuning epochs'});
  parser.addArgument('--validationSplit', {
    type: 'float',
    defaultValue: 0.15,
    help: 'Validation split for training'
  });
  parser.addArgument('--savePath', {
    type: 'string',
    defaultValue: null,
    help: 'Path at which the trained transfer model will be saved (optional)'
  });
  parser.addArgument('--labelMap', {
    type: 'string',
    defaultValue: null,
    help: 'A mapping for labels. Syntax examle: ("label1->label2,label3->label4)"',
  })
  return parser.parseArgs();
}

function toArrayBuffer(myBuf: Buffer): ArrayBuffer {
  var myBuffer = new ArrayBuffer(myBuf.length);
  var res = new Uint8Array(myBuffer);
  for (var i = 0; i < myBuf.length; ++i) {
    res[i] = myBuf[i];
  }
  return myBuffer;
}

function loadDataset(
    trasnferRecognizer: TransferSpeechCommandRecognizer,
    datasetPath: string,
    labelMap?: speechCommands.LabelMap): void {
  let paths: string[];
  if (datasetPath.indexOf(',') === -1) {
    paths = [datasetPath];
  } else {
    paths = datasetPath.split(',');
  }
  paths.forEach(filePath => {
    console.log(`Loading data from path: ${filePath}`);
    const serializedData = toArrayBuffer(fs.readFileSync(filePath));
    const clearExisting = false;
    trasnferRecognizer.loadExamples(serializedData, clearExisting, labelMap);
  });
  console.log(trasnferRecognizer.countExamples());
}

async function main() {
  console.log('TensorFlow.js version:', tf.version);
  console.log('SpeechCommands version:', speechCommands.version);

  const args = parseArgs();

  const baseRecognizer = speechCommands.create('BROWSER_FFT');
  await baseRecognizer.ensureModelLoaded();
  const trasnferRecognizer = baseRecognizer.createTransfer('transfer');

  let labelMap: speechCommands.LabelMap = null;
  if (args.labelMap != null) {
    labelMap = {};
    let items: string[] = args.labelMap.split(',');
    items = items.filter(item => item.trim().length > 0);
    items.forEach(item => {
      const mappingItems = item.split('->');
      if (mappingItems.length !== 2 ||
          mappingItems[0].trim().length === 0 ||
          mappingItems[1].trim().length === 0) {
        throw new Error(`Invalid item in labelMap options: "${item}"`);
      }
      const originalLabel = mappingItems[0].trim();
      const targetLabel = mappingItems[1].trim();
      labelMap[originalLabel] = targetLabel;
    });
    console.log(`labelMap = ${JSON.stringify(labelMap)}`);
  }

  loadDataset(trasnferRecognizer, args.datasetPath, labelMap);

  console.log(`Starting training...`);
  const tBegin = tf.util.now();
  await trasnferRecognizer.train({
    windowHopRatio: args.windowHopRatio,
    augmentByMixingNoiseRatio: args.augmentByMixingNoiseRatio,
    epochs: args.epochs,
    fineTuningEpochs: args.fineTuningEpochs,
    validationSplit: args.validationSplit
  });

  const tEnd = tf.util.now();
  console.log(`Training completed in ${((tEnd - tBegin) / 1e3).toFixed(3)} s.`);

  if (args.savePath != null) {
    trasnferRecognizer.save(`file://${args.savePath}`);
    const metadataPath = path.join(args.savePath, 'metadata.json');
    fs.writeFileSync(
        metadataPath, JSON.stringify(trasnferRecognizer.getMetadata()));
    console.log(`Saved model with metadata at: ${args.savePath}`);
  }
}

if (require.main === module) {
  main();
}
