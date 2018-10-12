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

import {collapseConfusionMatrix, confusionMatrix, confusionMatrix2Accuracy, confusionMatrix2NormalizedAccuracy} from './confusion_matrix';
import {makeCrossValidationIndices} from './cross_validation';
import {loadData} from './data';

global.fetch = require('node-fetch');

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
  // transferHead.add(tf.layers.dense({
  //   units: 20,
  //   activation: 'relu',
  //   inputShape: beheadedBaseOutput.shape.slice(1)
  // }));
  // transferHead.add(tf.layers.dropout({
  //   rate: 0.5
  // }));
  // transferHead.add(tf.layers.dense({
  //   units: numTransferWords,
  //   activation: 'softmax'
  // }));
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

  return newModel;
}

function processConfusionMatrixCollapsing(
    confMat: tf.Tensor2D, wordLabels: string[], collapseWords: string) {
  const collapseIndices: number[][] = [];

  const collapseGroups = collapseWords.split('|');
  for (const collapseGroup of collapseGroups) {
    const words = collapseGroup.split(',');
    const group: number[] = [];
    console.log('Collapse Group:');
    for (const word of words) {
      const index = wordLabels.indexOf(word);
      tf.util.assert(index !== -1, `Unknown word: ${word}`);
      group.push(index);
      console.log(' word:', word);
    }
    collapseIndices.push(group);
  }
  console.log(`collapseIndices = ${JSON.stringify(collapseIndices)}`);

  const collapsedConfusionMatrix =
      collapseConfusionMatrix(confMat, collapseIndices);
  console.log('Collapsed confusion matrix:');
  collapsedConfusionMatrix.print();
  const collapsedAccuracy = confusionMatrix2Accuracy(collapsedConfusionMatrix);
  console.log(`Collapsed accuracy: ${collapsedAccuracy}`);
  console.log('Collapsed normalized accuracy:');
  console.log(
      confusionMatrix2NormalizedAccuracy(collapsedConfusionMatrix as tf.Tensor2D));
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
  parser.addArgument(
      '--lr',
      {type: 'float', defaultValue: 0.05, help: 'Optimizer learning rate.'});
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
  parser.addArgument('--folds', {
    type: 'int',
    defaultValue: 6,
    help: 'Number of cross-validation folds to use'
  });
  parser.addArgument('--iterations', {
    type: 'int',
    defaultValue: 2,
    help: 'Number of cross-validation iterations to use'
  });
  parser.addArgument('--modelSavePath', {
    type: 'string',
    help: 'Path to which the model will be saved after training.'
  });
  parser.addArgument('--confusionCollapseWords', {
    type: 'string',
    help: 'Optional collapsing of words in the confusion matrix. ' +
        'E.g., "wordA,wordB|wordC,wordD"'
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

  // Custom train-eval split.
  const yIndices = Array.from(ys.argMax(-1).dataSync());
  console.log(`numUniqueWords = ${numUniqueWords}`);

  const folds =
      makeCrossValidationIndices(yIndices, args.folds, args.iterations);

  let iter = 0;
  for (const fold of folds) {
    console.log(`Fold ${iter + 1} / ${folds.length}...`);

    const trainXs = xs.gather(tf.tensor1d(fold.trainIndices, 'int32'), 0);
    const trainYs = ys.gather(tf.tensor1d(fold.trainIndices, 'int32'), 0);
    const testXs = xs.gather(tf.tensor1d(fold.testIndices, 'int32'), 0);
    const testYs = ys.gather(tf.tensor1d(fold.testIndices, 'int32'), 0);

    const newModel =
        createTransferModel(model as tf.Sequential, numUniqueWords);

    // // Test save the model and load the model back.
    // newModel.summary();
    // await newModel.save('file:///tmp/model1');
    // newModel = await tf.loadModel('file:///tmp/model1/model.json');
    // newModel.summary();

    newModel.compile({
      loss: 'categoricalCrossentropy',
      optimizer: tf.train.sgd(args.lr),
      metrics: ['accuracy']
    });
    const history = await newModel.fit(trainXs, trainYs, {
      batchSize: args.batchSize,
      epochs: args.epochs,
      validationData: [testXs, testYs],
      verbose: 0
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

    iter++;
  }

  console.log('Accuracies:');
  console.log(valAccs);

  console.log('Mean accuracy:')
  console.log(tf.tensor1d(valAccs).mean().dataSync()[0]);

  console.log(`wordLabels: ${wordLabels}`);
  console.log('Confusion matrix:');
  summedConfusion.print();
  console.log('Normalized accuracy:');
  console.log(
      confusionMatrix2NormalizedAccuracy(summedConfusion as tf.Tensor2D));

  if (args.confusionCollapseWords != null) {
    processConfusionMatrixCollapsing(
        summedConfusion as tf.Tensor2D, wordLabels,
        args.confusionCollapseWords);
  }
})();
