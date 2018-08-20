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

/**
 * Defining and training for BROWSER_FFT speech-commands models.
 * 
 * Usage example:
 * 
 * ```sh
 * yarn train \
 *     path/to/train/data/dir 43 232 \
 *     --modelSavePath /tmp/speech-commands-model
 * ```
 */

import * as argparse from 'argparse';
import * as fs from 'fs';
import * as path from 'path';

import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-node-gpu';

import {loadData} from './data';

function createModel(inputShape: tf.Shape, numClasses: number): tf.Model {
  const model = tf.sequential();
  model.add(tf.layers.conv2d({
    filters: 8,
    kernelSize: [2, 8],
    activation: 'relu',
    inputShape
  }));
  model.add(tf.layers.maxPooling2d({poolSize: [2, 2], strides: [2, 2]}));
  model.add(
      tf.layers.conv2d({filters: 32, kernelSize: [2, 4], activation: 'relu'}));
  model.add(tf.layers .maxPooling2d({poolSize: [2, 2], strides: [2, 2]}));
  model.add(
      tf.layers.conv2d({filters: 32, kernelSize: [2, 4], activation: 'relu'}));
  model.add(tf.layers.maxPooling2d({poolSize: [2, 2], strides: [2, 2]}));
  model.add(
      tf.layers.conv2d({filters: 32, kernelSize: [2, 4], activation: 'relu'}));
  model.add(tf.layers.maxPooling2d({poolSize: [2, 2], strides: [1, 2]}));
  model.add(tf.layers.flatten({}));
  model.add(tf.layers.dropout({rate: 0.25}));
  model.add(tf.layers.dense({units: 2000, activation: 'relu'}));
  model.add(tf.layers.dropout({rate: 0.5}));
  model.add(tf.layers.dense({units: numClasses, activation: 'softmax'}));

  model.compile({
    loss: 'categoricalCrossentropy',
    optimizer: tf.train.sgd(0.01),
    metrics: ['accuracy']
  });
  model.summary();
  return model;
}

(async function() {
  const parser = new argparse.ArgumentParser({
    description: 'TensorFlow.js BrowserFFT model trainer',
    addHelp: true
  });
  parser.addArgument('dataRoot', {
    type: 'string', 
    help: 'Root directory of training data'
  });
  parser.addArgument('numFrames', {
    type: 'int',
    help: 'Number of frames per spectrogram (e.g., 43)'
  });
  parser.addArgument('fftSize', {
    type: 'int',
    help: 'Number of FFT data points per frame (e.g., 232)'
  });
  parser.addArgument('--epochs', {
    type: 'int',
    defaultValue: 200,
    help: 'Number of epochs to train the model for.'
  });
  parser.addArgument('--batchSize', {
    type: 'int',
    defaultValue: 64,
    help: 'Batch size to be used during model training.'
  });
  parser.addArgument('--validationSplit', {
    type: 'float',
    defaultValue: 0.1,
    help: 'Validation split to be used during model training.'
  });
  parser.addArgument('--modelSavePath', {
    type: 'string',
    help: 'Path to which the model will be saved after training.'
  });
  const args = parser.parseArgs();
  console.log(JSON.stringify(args));

  const {xs, ys, words} = loadData(
      args.dataRoot, args.numFrames, args.fftSize);

  const model = createModel(xs.shape.slice(1), ys.shape[1]);
  await model.fit(xs, ys, {
    batchSize: args.batchSize,
    epochs: args.epochs,
    validationSplit: args.validationSplit,
    shuffle: true,
    callbacks: {
      onBatchEnd: async (batch, logs) => {
        // TODO(cais): Use tfjs-node shipped callback.
        console.log(`batch ${batch}:`, JSON.stringify(logs));
        await tf.nextFrame();
      },
      onEpochEnd: async (epoch, logs) => {
        console.log(`epoch ${epoch}:`, JSON.stringify(logs));
        await tf.nextFrame();
      }
    }
  });

  if (args.modelSavePath != null) {
    // Save model.
    await model.save(`file://${args.modelSavePath}`);
    console.log(`Saved model to path: ${args.modelSavePath}`);

    // Save metadata.
    const metadata: {} = {frameSize: args.fftSize, words};
    const metadataFilePath = path.join(args.modelSavePath, 'metadata.json');
    fs.writeFileSync(metadataFilePath, JSON.stringify(metadata));    
  }
})();