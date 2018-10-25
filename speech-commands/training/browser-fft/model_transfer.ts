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
import {writeFile} from 'fs';
import {join} from 'path';

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
    baseModel: tf.Sequential, numTransferWords: number): {
  model: tf.Model,
  baseOutputLayer: tf.layers.Layer,
  baseFirstLayer: tf.layers.Layer
} {
  // Find the second-last dense layer.
  const baseFirstLayer = baseModel.layers[0];
  let baseOutputLayer: tf.layers.Layer;
  let layerIndex = baseModel.layers.length - 2;
  while (layerIndex >= 0) {
    if (baseModel.layers[layerIndex].getClassName().toLowerCase() === 'dense') {
      baseOutputLayer = baseModel.layers[layerIndex];
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

  return {model: newModel, baseOutputLayer, baseFirstLayer};
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
  console.log(confusionMatrix2NormalizedAccuracy(
      collapsedConfusionMatrix as tf.Tensor2D));
}

function summedToConfusionMatrix(
    model: tf.Model, numUniqueWords: number, summedConfusion: tf.Tensor2D,
    xs: tf.Tensor, ys: tf.Tensor): tf.Tensor2D {
  const predictOut = model.predict(xs) as tf.Tensor;
  const confusion =
      confusionMatrix(ys.argMax(-1), predictOut.argMax(-1), numUniqueWords);
  const oldSummedConfusion = summedConfusion;
  summedConfusion = oldSummedConfusion.add(confusion);
  oldSummedConfusion.dispose();
  return summedConfusion;
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
    defaultValue: 100,
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
  parser.addArgument('--fineTuningLearningRate', {
    type: 'float',
    defaultValue: 0,
    help: 'Optional learning rate for fine-tuning. ' +
        'If specified and is !== 0, will cause the training process ' +
        'to unfreeze the last output layer (a Dense layer) of the ' +
        'base model after initial transfer learning and train ' +
        'on the same training dataset using this learning rate.'
  });
  parser.addArgument('--sampleUnknown', {
    type: 'string',
    help: 'Optional, if provided, will cause the program to sample ' +
        'N examples randomly from the -unknown_ subfolder under the ' +
        'specified folder.'
  });
  parser.addArgument('--trainToDeploy', {
    type: 'string',
    help: 'Whether this call should train a model to be deployed. ' +
        'This disables the n-fold cross validation'
  });
  const args = parser.parseArgs();

  let {xs, ys, wordLabels} =
      loadData(args.dataRoot, args.numFrames, args.fftSize);
  const numExamples = xs.shape[0];

  function loadUnknownExamplesAndConcat(
      dirPath: string, numFrames: number, fftSize: number, origXs: tf.Tensor,
      origYs: tf.Tensor, wordLabels: string[]): {xs: tf.Tensor, ys: tf.Tensor} {
    return tf.tidy(() => {
      let {xs: unknownXs, ys: unknownYs, wordLabels: unknownWordLabel} =
          loadData(dirPath, args.numFrames, args.fftSize, ['_unknown_']);
      tf.util.assert(
          unknownWordLabel.length === 1, `Unexpected unknownWordLabel length`);

      const numUnknown = unknownXs.shape[0];
      let indices = [];
      for (let i = 0; i < numUnknown; ++i) {
        indices.push(i);
      }
      tf.util.shuffle(indices);
      indices = indices.slice(0, numExamples);

      const unknownIndices: number[] = [];
      for (let i = 0; i < numExamples; ++i) {
        unknownIndices.push(wordLabels.length);
      }
      const indicesTensor = tf.tensor1d(indices, 'int32');
      unknownXs = unknownXs.gather(indicesTensor);
      unknownYs = unknownYs.gather(indicesTensor);

      // Concatenate the data and target tensors from the basic words
      // and _unknown_.
      const xs = tf.concat([origXs, unknownXs], 0);
      let ys = tf.concat([origYs, tf.zeros([origYs.shape[0], 1])], 1);
      const unknownOneHot =
          tf.oneHot(tf.tensor1d(unknownIndices, 'int32'), wordLabels.length + 1)
              .asType('float32');
      ys = tf.concat([ys, unknownOneHot], 0);
      wordLabels.push(unknownWordLabel[0]);
      return {xs, ys};
    });
  }

  if (args.sampleUnknown != null) {
    console.log('--- Loading and sampling _unknown_ tokens ---');
    const out = loadUnknownExamplesAndConcat(
        args.sampleUnknown, args.numFrames, args.fftSize, xs, ys, wordLabels);
    xs = out.xs;
    ys = out.ys;
  }

  // Transfer learning code.
  console.log(`Loading base model from ${args.baseModelURL} ...`);
  const model = await tf.loadModel(args.baseModelURL);

  const numUniqueWords = wordLabels.length;
  const accuracies: number[] = [];
  let summedConfusion: tf.Tensor2D =
      tf.zeros([numUniqueWords, numUniqueWords]).asType('int32') as tf.Tensor2D;

  // Custom train-eval split.
  const yIndices = Array.from(ys.argMax(-1).dataSync());
  console.log(`numUniqueWords = ${numUniqueWords}`);

  let folds: Array<{trainIndices: number[], testIndices: number[]}>;
  const trainToDeploy = args.trainToDeploy != null;
  if (trainToDeploy) {
    folds = [{trainIndices: yIndices, testIndices: []}]
  } else {
    folds = makeCrossValidationIndices(yIndices, args.folds, args.iterations);
  }

  const totalIters = trainToDeploy ? 1 : folds.length;
  for (let iter = 0; iter < totalIters; ++iter) {
    console.log(`Iteration ${iter + 1} / ${folds.length}...`);
    const fold = folds[iter];

    let trainXs = trainToDeploy ?
        xs :
        xs.gather(tf.tensor1d(fold.trainIndices, 'int32'), 0);
    const trainYs = trainToDeploy ?
        ys :
        ys.gather(tf.tensor1d(fold.trainIndices, 'int32'), 0);

    let testXs: tf.Tensor;
    let testYs: tf.Tensor;
    if (!trainToDeploy) {
      testXs = xs.gather(tf.tensor1d(fold.testIndices, 'int32'), 0);
      testYs = ys.gather(tf.tensor1d(fold.testIndices, 'int32'), 0);
    }

    const {model: newModel, baseOutputLayer, baseFirstLayer} =
        createTransferModel(model as tf.Sequential, numUniqueWords);

    newModel.compile({
      loss: 'categoricalCrossentropy',
      optimizer: tf.train.sgd(args.lr),
      metrics: ['accuracy']
    });

    const modelNumFrames = model.inputs[0].shape[1];
    if (trainXs.shape[1] != modelNumFrames) {
      console.log(
          `Performing bilinear interpolation along the time axis: ` +
          `${trainXs.shape[1]} --> ${modelNumFrames}`);
      const oldTrainXs = trainXs;
      const oldTestXs = testXs;
      trainXs = tf.image.resizeBilinear(
          trainXs as tf.Tensor4D, [modelNumFrames, model.inputs[0].shape[2]]);
      testXs = tf.image.resizeBilinear(
          testXs as tf.Tensor4D, [modelNumFrames, model.inputs[0].shape[2]]);
      tf.dispose([oldTrainXs, oldTestXs]);
    }

    let history = await newModel.fit(trainXs, trainYs, {
      batchSize: args.batchSize,
      epochs: args.epochs,
      verbose: 0,
      validationData: trainToDeploy ? null : [testXs, testYs]
    });

    if (args.fineTuningLearningRate !== 0) {
      console.log(
          `  Performing fine-tuning with learning rate ` +
          `${args.fineTuningLearningRate}...`);

      // Fine-tuning: Unfreeze the base's output layer.
      baseOutputLayer.trainable = true;
      newModel.compile({
        loss: 'categoricalCrossentropy',
        optimizer: tf.train.sgd(args.fineTuningLearningRate),
        metrics: ['accuracy']
      });

      // Train a few more epochs after unfreezing the layer.
      history = await newModel.fit(trainXs, trainYs, {
        batchSize: args.batchSize,
        epochs: args.epochs,
        verbose: 0,
        validationData: trainToDeploy ? null : [testXs, testYs]
      });
    }

    if (trainToDeploy) {
      accuracies.push(
          history.history.acc[history.history.acc.length - 1] as number);
      // Write model to disk.
    } else {
      accuracies.push(
          history.history.val_acc[history.history.val_acc.length - 1] as
          number);
    }

    // Calculate the confusion matrix.
    if (trainToDeploy) {
      summedConfusion = summedToConfusionMatrix(
          newModel, numUniqueWords, summedConfusion, trainXs, trainYs);

      console.log(`Saving model and metadata to ${args.trainToDeploy}`);
      await newModel.save(`file://${args.trainToDeploy}`);
      const metadata = {frameSize: args.fftSize, words: wordLabels};
      writeFile(
          join(args.trainToDeploy, 'metadata.json'), JSON.stringify(metadata),
          null);
    } else {
      summedConfusion = summedToConfusionMatrix(
          newModel, numUniqueWords, summedConfusion, testXs, testYs);
    }
  }

  console.log('Accuracies:');
  console.log(accuracies);

  console.log('Mean accuracy:')
  console.log(tf.tensor1d(accuracies).mean().dataSync()[0].toFixed(4));

  console.log(`wordLabels: ${wordLabels}`);
  console.log('Confusion matrix:');
  summedConfusion.print();
  console.log('Normalized accuracy:');
  console.log(confusionMatrix2NormalizedAccuracy(summedConfusion as tf.Tensor2D)
                  .toFixed(4));

  if (args.confusionCollapseWords != null) {
    processConfusionMatrixCollapsing(
        summedConfusion as tf.Tensor2D, wordLabels,
        args.confusionCollapseWords);
  }
})();
