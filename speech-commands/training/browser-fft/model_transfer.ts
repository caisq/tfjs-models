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
 * Transfer learning with model.
 *
 * Usage example:
 *
 * ```sh
 * yarn train \
 *     path/to/train/data/dir 43 232 \
 *     --modelSavePath /tmp/speech-commands-model
 * ```
 */

import '@tensorflow/tfjs-node-gpu';

import * as tf from '@tensorflow/tfjs';
import * as argparse from 'argparse';

import {loadData} from './data';

global.fetch = require('node-fetch');

// TODO(cais): Remove in favor of tf.confusionMatrix once it's available.
//   https://github.com/tensorflow/tfjs/issues/771
/**
 * Calcualte the confusion matrix.
 *
 * @param {tf.Tensor} labels The target labels, assumed to be 0-based integers
 *   for the categories. The shape is `[numExamples]`, where
 *   `numExamples` is the number of examples included.
 * @param {tf.Tensor} predictions The predicted probabilities, assumed to be
 *   0-based integers for the categories. Must have the same shape as `labels`.
 * @param {number} numClasses Number of all classes, if not provided,
 *   will calculate from both `labels` and `predictions`.
 * @return {tf.Tensor} The confusion matrix as a 2D tf.Tensor. The value at row
 *   `r` and column `c` is the number of times examples of actual class `r` were
 *   predicted as class `c`.
 */
function confusionMatrix(
    labels: tf.Tensor1D, predictions: tf.Tensor1D,
    numClasses?: number): tf.Tensor2D {
  tf.util.assert(
      numClasses == null || numClasses > 0 && Number.isInteger(numClasses),
      `If provided, numClasses must be a positive integer, ` +
          `but got ${numClasses}`);
  tf.util.assert(
      labels.rank === 1,
      `Expected the rank of labels to be 1, but got ${labels.rank}`);
  tf.util.assert(
      predictions.rank === 1,
      `Expected the rank of predictions to be 1, ` +
          `but got ${predictions.rank}`);
  tf.util.assert(
      labels.shape[0] === predictions.shape[0],
      `Mismatch in the number of examples: ` +
          `${labels.shape[0]} vs. ${predictions.shape[0]}`);
  if (numClasses == null) {
    // If numClasses is not provided, determine it.
    const labelClasses = labels.max().get();
    const predictionClasses = predictions.max().get();
    numClasses =
        (labelClasses > predictionClasses ? labelClasses : predictionClasses) +
        1;
  }
  return tf.tidy(() => {
    const oneHotLabels = tf.oneHot(labels, numClasses);
    const oneHotPredictions = tf.oneHot(predictions, numClasses);
    return oneHotLabels.transpose().matMul(oneHotPredictions);
  });
}

/**
 * Create transfer-learning model.
 *
 * @param baseModel Base model for transfer learning.
 * @param numTransferWords Number of transfer target words.
 * @returns Transfer-learning model.
 */
function createTransferModel(
    baseModel: tf.Sequential, numTransferWords: number): tf.Model {
  let layerIndex = baseModel.layers.length - 2;
  while (layerIndex >= 0) {
    if (baseModel.layers[layerIndex].getClassName().toLowerCase() === 'dense') {
      break;
    }
    layerIndex--;
  }
  if (layerIndex < 0) {
    throw new Error('Cannot find a hidden dense layer in the base model.');
  }
  const beheadedBaseOutput =
      baseModel.layers[layerIndex].output as tf.SymbolicTensor;

  // Freeze layers in the baseModel.
  for (const layer of baseModel.layers) {
    layer.trainable = false;
  }

  const transferHead = tf.sequential();
//   transferHead.add(tf.layers.dense({
//     units: 20,
//     activation: 'relu',
//     inputShape: beheadedBaseOutput.shape.slice(1)
//   }));
//   transferHead.add(tf.layers.dropout({
//     rate: 0.5
//   }));
//   transferHead.add(tf.layers.dense({
//     units: numTransferWords,
//     activation: 'softmax'
//   }));
  transferHead.add(tf.layers.dense({
    units: numTransferWords,
    activation: 'softmax',
    inputShape: beheadedBaseOutput.shape.slice(1)
  }));

  const beheadedModel =
      tf.model({inputs: baseModel.inputs, outputs: beheadedBaseOutput});
  const newModel = tf.sequential();
  newModel.add(beheadedModel);
  newModel.add(transferHead);

  newModel.compile({
    loss: 'categoricalCrossentropy',
    optimizer: tf.train.sgd(0.01),
    metrics: ['accuracy']
  });

  return newModel;
}

(async function() {
  const parser = new argparse.ArgumentParser(
      {description: 'TensorFlow.js BrowserFFT model trainer', addHelp: true});
  parser.addArgument(
      'dataRoot', {type: 'string', help: 'Root directory of training data'});
  parser.addArgument(
      'numFrames',
      {type: 'int', help: 'Number of frames per spectrogram (e.g., 43)'});
  parser.addArgument(
      'fftSize',
      {type: 'int', help: 'Number of FFT data points per frame (e.g., 232)'});
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
  parser.addArgument('--testSplit', {
    type: 'float',
    defaultValue: 0.25,
    help: 'Test split to be used during model training.'
  });
  parser.addArgument('--baseModelURL', {
    type: 'string',
    defaultValue:
        'https://storage.googleapis.com/tfjs-speech-commands-models/v0.1.2/browser_fft/18w/model.json',
    help: 'URL to the base model'
  });
  parser.addArgument('--iterations', {
    type: 'int',
    defaultValue: 10,
    help: 'Number of cross-validation iterations to use'
  });
  parser.addArgument('--modelSavePath', {
    type: 'string',
    help: 'Path to which the model will be saved after training.'
  });

  const args = parser.parseArgs();
  console.log(JSON.stringify(args));

  const {xs, ys, wordLabels} =
      loadData(args.dataRoot, args.numFrames, args.fftSize);

  // Transfer learning code.
  console.log(`Loading base model from ${args.baseModelURL} ...`);
  const model = await tf.loadModel(args.baseModelURL);

  const numUniqueWords = wordLabels.length;
  const valAccs: number[] = [];
  let summedConfusion: tf.Tensor = null;
  for (let iter = 0; iter < args.iterations; iter++) {
    console.log(`Iteration ${iter}...`);

    // Custom train-eval split.
    const yIndices = ys.argMax(-1).dataSync();
    console.log(`numUniqueWords = ${numUniqueWords}`);

    // TODO(cais): Use proper CV split, instead of the random one here.
    const exampleIndices = [];
    const trainIndices = [];
    const testIndices = [];
    for (let i = 0; i < numUniqueWords; ++i) {
      exampleIndices.push([]);
      trainIndices.push([]);
      testIndices.push([]);
    }
    for (let i = 0; i < yIndices.length; ++i) {
      exampleIndices[yIndices[i]].push(i);
    }

    for (let i = 0; i < numUniqueWords; ++i) {
      tf.util.shuffle(exampleIndices[i]);
      const numExamples = exampleIndices[i].length;
      const numTrainExamples = Math.round(numExamples * (1 - args.testSplit));
      trainIndices[i] = exampleIndices[i].slice(0, numTrainExamples);
      testIndices[i] = exampleIndices[i].slice(numTrainExamples);
    }

    console.log('Total indices:');
    console.log(exampleIndices);
    const flattenedTrainIndices: number[] = [];
    trainIndices.forEach(indices => flattenedTrainIndices.push(...indices));
    const flattenedTestIndices: number[] = [];
    testIndices.forEach(indices => flattenedTestIndices.push(...indices));
    console.log(`Train indices: total = ${flattenedTrainIndices.length}`);
    console.log(`Test indices: total = ${flattenedTestIndices.length}`);

    const trainXs = xs.gather(tf.tensor1d(flattenedTrainIndices, 'int32'), 0);
    const testXs = xs.gather(tf.tensor1d(flattenedTestIndices, 'int32'), 0);
    const trainYs = ys.gather(tf.tensor1d(flattenedTrainIndices, 'int32'), 0);
    const testYs = ys.gather(tf.tensor1d(flattenedTestIndices, 'int32'), 0);

    const newModel =
        createTransferModel(model as tf.Sequential, numUniqueWords);

    const history = await newModel.fit(trainXs, trainYs, {
      batchSize: args.batchSize,
      epochs: args.epochs,
      validationData: [testXs, testYs]
    });
    valAccs.push(
        history.history.val_acc[history.history.val_acc.length - 1] as number);

    // Calculate the confusion matrix.
    const predictOut = newModel.predict(testXs) as tf.Tensor;
    const confusion = confusionMatrix(testYs.argMax(-1), predictOut.argMax(-1));
    if (summedConfusion == null) {
      summedConfusion = confusion;
    } else {
      const oldSummedConfusion = summedConfusion;
      summedConfusion = oldSummedConfusion.add(confusion);
      oldSummedConfusion.dispose();
    }
  }

  console.log('Accuracies:');
  console.log(valAccs);

  console.log('Mean accuracy:')
  console.log(tf.tensor1d(valAccs).mean().dataSync()[0]);

  console.log(`wordLabels: ${wordLabels}`);
  console.log('Confusion matrix:');
  summedConfusion.print();
})();
