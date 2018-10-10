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