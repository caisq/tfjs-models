import * as tf from '@tensorflow/tfjs';

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
export function confusionMatrix(
    labels: tf.Tensor1D, predictions: tf.Tensor1D,
    numClasses: number): tf.Tensor2D {
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
  // if (numClasses == null) {
  //   // If numClasses is not provided, determine it.
  //   const labelClasses = labels.max().get();
  //   const predictionClasses = predictions.max().get();
  //   numClasses =
  //       (labelClasses > predictionClasses ? labelClasses : predictionClasses) +
  //       1;
  // }
  return tf.tidy(() => {
    const oneHotLabels = tf.oneHot(labels, numClasses);
    const oneHotPredictions = tf.oneHot(predictions, numClasses);
    return oneHotLabels.transpose().matMul(oneHotPredictions);
  });
}

export function collapseConfusionMatrix(
    confusionMatrix: tf.Tensor2D, collapseIndices: number[][]): tf.Tensor2D {
  const origNumClasses = confusionMatrix.shape[0];
  tf.util.assert(
      confusionMatrix.shape[1] === origNumClasses,
      `Encountered non-square confusion matrix shape: ` +
          `${JSON.stringify(confusionMatrix.shape)}`);

  // Make sure that there are not duplicates.
  const allCollapseIndices: number[] = [];
  const nonLeadingCollapseIndices: number[] = [];
  for (const nums of collapseIndices) {
    tf.util.assert(
        nums.length > 1,
        `An element of a collapse indices array should have at least ` +
            `two indices.`);
    nums.sort();
    for (let i = 0; i < nums.length; ++i) {
      const num = nums[i];
      tf.util.assert(num < origNumClasses, `Index out of bound: ${num}`);
      tf.util.assert(
          allCollapseIndices.indexOf(num) === -1,
          `Found duplicate index: ${num}`);
      allCollapseIndices.push(num);
      if (i > 0) {
        nonLeadingCollapseIndices.push(num);
      }
    }
  }
  allCollapseIndices.sort();
  let offset = 0;
  const oldIndex2NewIndex: {[oldIndx: number]: number} = {};
  for (let i = 0; i < origNumClasses; ++i) {
    if (nonLeadingCollapseIndices.indexOf(i) !== -1) {
      offset++;
    }
    oldIndex2NewIndex[i] = i - offset;
  }

  const newNumClasses = origNumClasses - offset;

  const data0 = confusionMatrix.dataSync();
  const data1 = new Float32Array(newNumClasses * newNumClasses);
  for (let i = 0; i < origNumClasses; ++i) {
    for (let j = 0; j < origNumClasses; ++j) {
      const origCount = data0[i * origNumClasses + j];
      const newI = oldIndex2NewIndex[i];
      const newJ = oldIndex2NewIndex[j];
      data1[newI * newNumClasses + newJ] += origCount;
    }
  }
  return tf.tensor2d(data1, [newNumClasses, newNumClasses]);
}

export function confusionMatrix2Accuracy(confMat: tf.Tensor2D): number {
  const total = confMat.sum().get();
  const data = confMat.dataSync();
  const n = confMat.shape[0];
  let correctCount = 0;
  for (let i = 0; i < n; ++i) {
    correctCount += data[i * n + i];
  }
  return correctCount / total;
}

export function confusionMatrix2NormalizedAccuracy(confMat: tf.Tensor2D):
    number {
  const n = confMat.shape[0];
  const marginalCounts = confMat.sum(-1).dataSync();
  const marginalAccuracies: number[] = [];
  const data = confMat.dataSync();
  for (let i = 0; i < n; ++i) {
    marginalAccuracies.push(data[i * n + i] / marginalCounts[i]);
  }
  return tf.tensor1d(marginalAccuracies).mean().dataSync()[0];
}

// // Test case.
// const confMat1 = tf.tensor2d([
//     [5, 1, 0, 1],
//     [0, 1, 2, 0],
//     [0, 2, 1, 1],
//     [0, 0, 0, 9]
// ]);
// confMat1.print();

// const confMat2 = collapseConfusionMatrix(confMat1, [[0, 1]]);
// confMat2.print();
