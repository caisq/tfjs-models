import * as tf from '@tensorflow/tfjs';

/**
 * Create fold-by-fold training and testing indices.
 *
 * @param yLabels
 * @param numFolds
 * @param iterations
 */
export function makeCrossValidationIndices(
    yLabels: number[], numFolds: number,
    iterations = 1): Array<{trainIndices: number[], testIndices: number[]}> {
  tf.util.assert(numFolds > 1, `Invalid validation folds: ${numFolds}`);
  const valSplit = 1 / numFolds;

  // First, determine how many different classes there are.
  let numClasses = 0;
  for (const label of yLabels) {
    if (label > numClasses) {
      numClasses = label;
    }
  }
  numClasses++;
  tf.util.assert(numClasses > 1, 'Must have at least two classes');

  // Collect the indices for each class.
  const indicesByClass = [];
  const trainIndicesByClass = [];
  const testIndicesByClass = [];
  for (let i = 0; i < numClasses; ++i) {
    indicesByClass.push([]);
    trainIndicesByClass.push([]);
    testIndicesByClass.push([]);
  }
  for (let i = 0; i < yLabels.length; ++i) {
    indicesByClass[yLabels[i]].push(i);
  }

  const folds: Array<{trainIndices: number[], testIndices: number[]}> = [];

  for (let iter = 0; iter < iterations; ++iter) {
    // Randomly shuffle the indices before dividing them.
    const numExamplesByClass = [];
    for (let i = 0; i < numClasses; ++i) {
      tf.util.shuffle(indicesByClass[i]);
      numExamplesByClass[i] = indicesByClass[i].length;
    }

    // Calculate the folds. Each fold
    for (let i = 0; i < numFolds; ++i) {
      const beginFrac = valSplit * i;
      const endFrac = valSplit * (i + 1);

      const oneFold:
          {trainIndices: number[],
           testIndices: number[]} = {trainIndices: [], testIndices: []};
      for (let n = 0; n < numClasses; ++n) {
        const beginIndex = Math.round(numExamplesByClass[n] * beginFrac);
        const endIndex = Math.round(numExamplesByClass[n] * endFrac);
        tf.util.assert(
            endIndex > beginIndex,
            `It appears that the number of folds ${numFolds} ` +
                `is too large for the per-class number of examples you have.`);
        for (let k = 0; k < numExamplesByClass[n]; ++k) {
          if (k >= beginIndex && k < endIndex) {
            oneFold.testIndices.push(indicesByClass[n][k]);
          } else {
            oneFold.trainIndices.push(indicesByClass[n][k]);
          }
        }
      }
      folds.push(oneFold);
    }
  }
  return folds;
}