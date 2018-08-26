/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
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

import * as tf from '@tensorflow/tfjs';

// tslint:disable:max-line-length
import {BrowserFftFeatureExtractor, SpectrogramCallback} from './browser_fft_extractor';
import {loadMetadataJson} from './browser_fft_utils';
import {RecognizerCallback, RecognizerParams, SpectrogramData, SpeechCommandRecognizer, SpeechCommandRecognizerResult, StreamingRecognitionConfig, TransferLearnConfig} from './types';
// tslint:enable:max-line-length

export const BACKGROUND_NOISE_TAG = '_background_noise_';
export const UNKNOWN_TAG = '_unknown_';

/**
 * Speech-Command Recognizer using browser-native (WebAudio) spectral featutres.
 */
export class BrowserFftSpeechCommandRecognizer implements
    SpeechCommandRecognizer {
  // tslint:disable:max-line-length
  readonly DEFAULT_MODEL_JSON_URL =
      'https://storage.googleapis.com/tfjs-speech-commands-models/20w/model.json';
  readonly DEFAULT_METADATA_JSON_URL =
      'https://storage.googleapis.com/tfjs-speech-commands-models/20w/metadata.json';
  // tslint:enable:max-line-length

  // A unique identifier for the base model. None of the transfer-learning
  // models added may use this name.
  readonly BASE_MODEL_NAME = 'base';

  private readonly SAMPLE_RATE_HZ = 44100;
  private readonly FFT_SIZE = 1024;
  private readonly DEFAULT_SUPPRESSION_TIME_MILLIS = 1000;

  models: {[name: string]: tf.Model};
  readonly parameters: RecognizerParams;
  protected words: {[modelName: string]: string[]};
  private streaming: boolean;

  private nonBatchInputShape: [number, number, number];
  private elementsPerExample: number;
  private audioDataExtractor: BrowserFftFeatureExtractor;

  private transferLearnExamples:
      {[modelName: string]: {[word: string]: tf.Tensor[]}};
  private transferLearnModelHeads: {[modelName: string]: tf.Sequential};

  /**
   * Constructor of BrowserFftSpeechCommandRecognizer.
   */
  constructor() {
    this.streaming = false;
    this.parameters = {
      sampleRateHz: this.SAMPLE_RATE_HZ,
      fftSize: this.FFT_SIZE,
      columnBufferLength: this.FFT_SIZE,
    };

    this.models = {};
    this.words = {};
    this.transferLearnExamples = {};
    this.transferLearnModelHeads = {};
  }

  /**
   * Start streaming recognition.
   *
   * To stop the recognition, use `stopStreaming()`.
   *
   * Example: TODO(cais): Add exapmle code snippet.
   *
   * @param callback The callback invoked whenever a word is recognized
   *   with a probability score greater than `config.probabilityThreshold`.
   *   It has the signature:
   *     (result: SpeechCommandRecognizerResult) => Promise<void>
   *   wherein result has the two fields:
   *   - scores: A Float32Array that contains the probability scores for all
   *     the words.
   *   - spectrogram: The spectrogram data, provided only if
   *     `config.includeSpectrogram` is `true`.
   * @param config The configurations for the streaming recognition to
   *   be started.
   *   The `modelName` field of `config` specifies the model to be used for
   *   online recognition. If not specified, it defaults to the name of the
   *   base model ('base'), i.e., the pretrained model not from transfer
   *   learning. If the recognizer instance has one or more transfer-learning
   *   models ready (as a result of calls to `collectTransferLearningExample`
   *   and `trainTransferLearningModel`), you can let this call use that
   *   model for prediction by specifying the corresponding `modelName`.
   * @throws Error, if streaming recognition is already started or
   *   if `config` contains invalid values.
   */
  async startStreaming(
      callback: RecognizerCallback,
      config?: StreamingRecognitionConfig): Promise<void> {
    if (this.streaming) {
      throw new Error(
          'Cannot start streaming again when streaming is ongoing.');
    }

    await this.ensureModelLoaded();

    if (config == null) {
      config = {};
    }
    const probabilityThreshold =
        config.probabilityThreshold == null ? 0 : config.probabilityThreshold;
    tf.util.assert(
        probabilityThreshold >= 0 && probabilityThreshold <= 1,
        `Invalid probabilityThreshold value: ${probabilityThreshold}`);
    const invokeCallbackOnNoiseAndUnknown =
        config.invokeCallbackOnNoiseAndUnknown == null ?
        false :
        config.invokeCallbackOnNoiseAndUnknown;

    const modelName = config.modelName || this.BASE_MODEL_NAME;
    if (this.models[modelName] == null) {
      throw new Error(`There is no model with name ${modelName}`);
    }

    if (config.suppressionTimeMillis < 0) {
      throw new Error(
          `suppressionTimeMillis is expected to be >= 0, ` +
          `but got ${config.suppressionTimeMillis}`);
    }

    const overlapFactor =
        config.overlapFactor == null ? 0.5 : config.overlapFactor;
    tf.util.assert(
        overlapFactor >= 0 && overlapFactor < 1,
        `Expected overlapFactor to be >= 0 and < 1, but got ${overlapFactor}`);
    this.parameters.columnHopLength =
        Math.round(this.FFT_SIZE * (1 - overlapFactor));

    const spectrogramCallback: SpectrogramCallback = async (x: tf.Tensor) => {
      const {model, words} = this.getModelAndWords(modelName);
      const y = tf.tidy(() => model.predict(x) as tf.Tensor);
      const scores = await y.data() as Float32Array;
      const maxIndexTensor = y.argMax(-1);
      const maxIndex = (await maxIndexTensor.data())[0];
      const maxScore = Math.max(...scores);
      tf.dispose([y, maxIndexTensor]);

      if (maxScore < probabilityThreshold) {
        return false;
      } else {
        let spectrogram: SpectrogramData = undefined;
        if (config.includeSpectrogram) {
          spectrogram = {
            data: await x.data() as Float32Array,
            frameSize: this.nonBatchInputShape[1],
          };
        }

        let invokeCallback = true;
        if (!invokeCallbackOnNoiseAndUnknown) {
          // Skip background noise and unknown tokens.
          if (words[maxIndex] === BACKGROUND_NOISE_TAG ||
              words[maxIndex] === UNKNOWN_TAG) {
            invokeCallback = false;
          }
        }
        if (invokeCallback) {
          callback({scores, spectrogram});
        }
        return true;
      }
    };

    const suppressionTimeMillis = config.suppressionTimeMillis == null ?
        this.DEFAULT_SUPPRESSION_TIME_MILLIS :
        config.suppressionTimeMillis;
    this.audioDataExtractor = new BrowserFftFeatureExtractor({
      sampleRateHz: this.parameters.sampleRateHz,
      columnBufferLength: this.parameters.columnBufferLength,
      columnHopLength: this.parameters.columnHopLength,
      numFramesPerSpectrogram: this.nonBatchInputShape[0],
      columnTruncateLength: this.nonBatchInputShape[1],
      suppressionTimeMillis,
      spectrogramCallback
    });

    await this.audioDataExtractor.start();

    this.streaming = true;
  }

  /**
   * Load the underlying tf.Model instance and associated metadata.
   *
   * If the model and the metadata are already loaded, do nothing.
   */
  async ensureModelLoaded() {
    if (this.models[this.BASE_MODEL_NAME] != null) {
      return;
    }

    await this.ensureMetadataLoaded();

    const model = await tf.loadModel(this.DEFAULT_MODEL_JSON_URL);
    // Check the validity of the model's input shape.
    if (model.inputs.length !== 1) {
      throw new Error(
          `Expected model to have 1 input, but got a model with ` +
          `${model.inputs.length} inputs`);
    }
    if (model.inputs[0].shape.length !== 4) {
      throw new Error(
          `Expected model to have an input shape of rank 4, ` +
          `but got an input shape of rank ${model.inputs[0].shape.length}`);
    }
    if (model.inputs[0].shape[3] !== 1) {
      throw new Error(
          `Expected model to have an input shape with 1 as the last ` +
          `dimension, but got input shape` +
          `${JSON.stringify(model.inputs[0].shape[3])}}`);
    }
    // Check the consistency between the word labels and the model's output
    // shape.
    const outputShape = model.outputShape as tf.Shape;
    if (outputShape.length !== 2) {
      throw new Error(
          `Expected loaded model to have an output shape of rank 2,` +
          `but received shape ${JSON.stringify(outputShape)}`);
    }
    if (outputShape[1] !== this.words[this.BASE_MODEL_NAME].length) {
      throw new Error(
          `Mismatch between the last dimension of model's output shape ` +
          `(${outputShape[1]}) and number of words ` +
          `(${this.words[this.BASE_MODEL_NAME].length}).`);
    }

    this.models[this.BASE_MODEL_NAME] = model;
    this.nonBatchInputShape =
        model.inputs[0].shape.slice(1) as [number, number, number];
    this.elementsPerExample = 1;
    model.inputs[0].shape.slice(1).forEach(
        dimSize => this.elementsPerExample *= dimSize);

    this.warmUpModel();

    const frameDurationMillis =
        this.parameters.columnBufferLength / this.parameters.sampleRateHz * 1e3;
    const numFrames = model.inputs[0].shape[1];
    this.parameters.spectrogramDurationMillis = numFrames * frameDurationMillis;
  }

  private warmUpModel(modelName = this.BASE_MODEL_NAME) {
    tf.tidy(() => {
      const x = tf.zeros([1].concat(this.nonBatchInputShape));
      for (let i = 0; i < 3; ++i) {
        this.models[modelName].predict(x);
      }
    });
  }

  private async ensureMetadataLoaded() {
    if (this.words[this.BASE_MODEL_NAME] != null) {
      return;
    }
    const metadataJSON = await loadMetadataJson(this.DEFAULT_METADATA_JSON_URL);
    this.words[this.BASE_MODEL_NAME] = metadataJSON.words;
  }

  /**
   * Stop streaming recognition.
   *
   * @throws Error if there is not ongoing streaming recognition.
   */
  async stopStreaming(): Promise<void> {
    if (!this.streaming) {
      throw new Error('Cannot stop streaming when streaming is not ongoing.');
    }
    await this.audioDataExtractor.stop();
    this.streaming = false;
  }

  /**
   * Check if streaming recognition is ongoing.
   */
  isStreaming(): boolean {
    return this.streaming;
  }

  /**
   * Get the array of word labels.
   *
   * @throws Error If this model is called before the model is loaded.
   */
  wordLabels(modelName = this.BASE_MODEL_NAME): string[] {
    if (modelName == null) {
      modelName = this.BASE_MODEL_NAME;
    }
    if (this.words[this.BASE_MODEL_NAME] == null) {
      throw new Error(
          'Model is not loaded yet. Call ensureModelLoaded() or ' +
          'use the model for recognition with startStreaming() or ' +
          'recognize() first.');
    }
    return this.words[modelName];
  }

  /**
   * Get the parameters of this instance of BrowserFftSpeechCommandRecognizer.
   *
   * @returns Parameters of this instance.
   */
  params(): RecognizerParams {
    return this.parameters;
  }

  /**
   * Get the input shape of the underlying tf.Model.
   *
   * @returns The input shape.
   */
  modelInputShape(): tf.Shape {
    if (this.models[this.BASE_MODEL_NAME] == null) {
      throw new Error(
          'Model has not be loaded yet. Load model by calling ' +
          'ensureModelLoaded(), recognizer(), or startStreaming().');
    }
    return this.models[this.BASE_MODEL_NAME].inputs[0].shape;
  }

  /**
   * Run offline (non-streaming) recognition on a spectrogram.
   *
   * @param input Spectrogram. Either a `tf.Tensor` of a `Float32Array`.
   *   - If a `tf.Tensor`, must be rank-4 and match the model's expected
   *     input shape in 2nd dimension (# of spectrogram columns), the 3rd
   *     dimension (# of frequency-domain points per column), and the 4th
   *     dimension (always 1). The 1st dimension can be 1, for single-example
   *     recogntion, or any value >1, for batched recognition.
   *   - If a `Float32Array`, must have a length divisible by the number
   *     of elements per spectrogram, i.e.,
   *     (# of spectrogram columns) * (# of frequency-domain points per column).
   * @returns Result of the recognition, with the following field:
   *   scores:
   *   - A `Float32Array` if there is only one input exapmle.
   *   - An `Array` of `Float32Array`, if there are multiple input examples.
   */
  async recognize(input: tf.Tensor|
                  Float32Array): Promise<SpeechCommandRecognizerResult> {
    await this.ensureModelLoaded();

    let numExamples: number;
    let inputTensor: tf.Tensor;
    let outTensor: tf.Tensor;
    if (input instanceof tf.Tensor) {
      // Check input shape.
      this.checkInputTensorShape(input);
      inputTensor = input;
      numExamples = input.shape[0];
    } else {
      // `input` is a `Float32Array`.
      input = input as Float32Array;
      if (input.length % this.elementsPerExample) {
        throw new Error(
            `The length of the input Float32Array ${input.length} ` +
            `is not divisible by the number of tensor elements per ` +
            `per example expected by the model ${this.elementsPerExample}.`);
      }

      numExamples = input.length / this.elementsPerExample;
      inputTensor = tf.tensor4d(input, [
        numExamples
      ].concat(this.nonBatchInputShape) as [number, number, number, number]);
    }

    const {model} = this.getModelAndWords();
    outTensor = model.predict(inputTensor) as tf.Tensor;
    if (numExamples === 1) {
      return {scores: await outTensor.data() as Float32Array};
    } else {
      const unstacked = tf.unstack(outTensor) as tf.Tensor[];
      const scorePromises = unstacked.map(item => item.data());
      const scores = await Promise.all(scorePromises) as Float32Array[];
      tf.dispose(unstacked);
      return {scores};
    }
  }

  private getModelAndWords(modelName = this.BASE_MODEL_NAME):
      {model: tf.Model, words: string[]} {
    if (this.models[modelName] == null) {
      throw new Error(`There is no model with name ${modelName}`);
    }
    return {model: this.models[modelName], words: this.words[modelName]};
  }

  /**
   * Collect an example for transfer learning via WebAudio.
   *
   * @param {string} modelName Name of the transfer-learnig
   *   model that the example to be collect belongs to. This is a unique
   *   identifier for the transfer-learning model. Each instance of
   *   BrowserFftSpeechCommandRecognizer may contain multiple transfer-learning
   *   models.
   * @param {string} word Name of the word. Must not overlap with any of the
   *   words the base model is trained to recognize.
   * @returns {SpectrogramData} The spectrogram of the acquired the example.
   * @throws Error, if word belongs to the set of words the base model is
   *   trained to recognize.
   */
  async collectTransferLearningExample(modelName: string, word: string):
      Promise<SpectrogramData> {
    tf.util.assert(
        !this.streaming,
        'Cannot start collection of transfer-learning example because ' +
            'a streaming recognition or transfer-learning example collection ' +
            'is ongoing');
    tf.util.assert(
        modelName != null && modelName.length > 0,
        `The name of a transfer-learning model must be a non-empty string, ` +
            `but got ${JSON.stringify(modelName)}`);
    tf.util.assert(
        modelName !== this.BASE_MODEL_NAME,
        `The name of a transfer-learning model must not be 'base', ` +
            `which is reserved for the base model.`);
    tf.util.assert(
        word != null && word.length > 0,
        `Must provide a non-empty string when collecting transfer-` +
            `learning example`);

    this.streaming = true;
    await this.ensureModelLoaded();
    return new Promise<SpectrogramData>((resolve, reject) => {
      const spectrogramCallback: SpectrogramCallback = async (x: tf.Tensor) => {
        if (this.transferLearnExamples[modelName] == null) {
          this.transferLearnExamples[modelName] = {};
        }
        if (this.transferLearnExamples[modelName][word] == null) {
          this.transferLearnExamples[modelName][word] = [];
        }
        this.transferLearnExamples[modelName][word].push(x.clone());
        await this.audioDataExtractor.stop();
        this.streaming = false;
        this.collectTransferLearnWords(modelName);
        resolve({
          data: await x.data() as Float32Array,
          frameSize: this.nonBatchInputShape[1],
        });
        return false;
      };
      this.audioDataExtractor = new BrowserFftFeatureExtractor({
        sampleRateHz: this.parameters.sampleRateHz,
        columnBufferLength: this.parameters.columnBufferLength,
        columnHopLength: this.parameters.columnBufferLength,
        numFramesPerSpectrogram: this.nonBatchInputShape[0],
        columnTruncateLength: this.nonBatchInputShape[1],
        suppressionTimeMillis: 0,
        spectrogramCallback
      });
      this.audioDataExtractor.start();
    });
  }

  addTransferLearningExample(modelName: string, word: string, data: tf.Tensor) {
    if (this.transferLearnExamples[modelName] == null) {
      this.transferLearnExamples[modelName] = {};
    }
    if (this.transferLearnExamples[modelName][word] == null) {
      this.transferLearnExamples[modelName][word] = [];
    }
    this.transferLearnExamples[modelName][word].push(data);
    this.collectTransferLearnWords(modelName);
  }

  /**
   * Clear all transfer learning examples collected so far.
   */
  clearTransferLearningExamples(modelName: string): void {
    tf.util.assert(
        this.words[modelName] != null &&
            this.transferLearnExamples[modelName] != null,
        `No transfer learning examples exist for model name ${modelName}`);
    tf.dispose(this.transferLearnExamples[modelName]);
    this.transferLearnExamples[modelName] = {};
    delete this.words[modelName];
  }

  /**
   * Train a transfer-learning model.
   *
   * The last dense layer of the base model is replaced with new softmax dense
   * layer.
   *
   * It is assume that at least one category of data has been collected (using
   * multiple calls to the `collectTransferLearningExample` method).
   *
   * @param modelName {string} Name of the transfer-learning model to be
   *   trained. This must correspond to the modelName used during the
   *   previous `collectTransferLearningExample` calls.
   * @param config {TransferLearnConfig} Optional configurations fot the
   *   training of the transfer-learning model.
   * @returns {tf.History} A history object with the loss and accuracy values
   *   from the training of the transfer-learning model.
   * @throws Error, if `modelName` is invalid or if not sufficient training
   *   examples have been collected yet.
   */
  async trainTransferLearningModel(
      modelName: string, config?: TransferLearnConfig): Promise<tf.History> {
    tf.util.assert(
        modelName != null && modelName.length > 0,
        `Must specify a non-empty string as model name when calling ` +
            `trainTransferLearningModel.`);
    tf.util.assert(
        this.words[modelName] != null && this.words[modelName].length > 0,
        `Cannot train transfer-learning model '${modelName}' because no ` +
            `transfer learning example has been collected.`);
    tf.util.assert(
        this.words[modelName].length > 1,
        `Cannot train transfer-learning model '${modelName}' because only ` +
            `1 word label ('${this.words[modelName]}') ` +
            `has been collected for transfer learning. Requires at least 2.`);

    if (config == null) {
      config = {};
    }

    this.createTransferLearningModelFromBaseModel(modelName);
    const transferLearnModel = this.models[modelName];

    // Compile model for training.
    const optimizer = config.optimizer || 'sgd';
    transferLearnModel.compile(
        {loss: 'categoricalCrossentropy', optimizer, metrics: ['acc']});

    // Prepare the data.
    const {xs, ys} = this.collectTransferLearnDataAsTensors(modelName);

    const epochs = config.epochs == null ? 20 : config.epochs;
    const validationSplit =
        config.validationSplit == null ? 0 : config.validationSplit;
    try {
      const history = await transferLearnModel.fit(xs, ys, {
        epochs,
        validationSplit,
        batchSize: config.batchSize,
        callbacks: config.callback == null ? null : [config.callback]
      });
      tf.dispose([xs, ys]);
      return history;
    } catch (err) {
      tf.dispose([xs, ys]);
      this.transferLearnModelHeads = null;
      return null;
    }
  }

  private createTransferLearningModelFromBaseModel(modelName: string): void {
    tf.util.assert(
        this.words[modelName] != null,
        `No word example is available for tranfer-learning model of name ` +
            modelName);

    this.freezeBaseModel();
    // Find the second last dense layer.
    const baseModel = this.models[this.BASE_MODEL_NAME];
    const layers = baseModel.layers;
    let layerIndex = layers.length - 2;
    while (layerIndex >= 0) {
      if (layers[layerIndex].getClassName().toLowerCase() === 'dense') {
        break;
      }
      layerIndex--;
    }
    if (layerIndex < 0) {
      throw new Error('Cannot find a hidden dense layer in the base model.');
    }
    const beheadedBaseOutput = layers[layerIndex].output as tf.SymbolicTensor;

    const transferLearnModelHead = tf.sequential();
    transferLearnModelHead.add(tf.layers.dense({
      units: this.words[modelName].length,
      activation: 'softmax',
      inputShape: beheadedBaseOutput.shape.slice(1)
    }));
    this.transferLearnModelHeads[modelName] = transferLearnModelHead;
    const transferLearnOutput =
        transferLearnModelHead.apply(beheadedBaseOutput) as tf.SymbolicTensor;
    this.models[modelName] =
        tf.model({inputs: baseModel.inputs, outputs: transferLearnOutput});
  }

  private freezeBaseModel(): void {
    const baseModel = this.models[this.BASE_MODEL_NAME];
    for (const layer of baseModel.layers) {
      layer.trainable = false;
    }
  }

  /**
   * Collect the transfer-learning data as tf.Tensors.
   *
   * @param modelName {string} Name of the transfer learning model for which
   *   the examples are to be collected.
   * @returns xs: The feature tensors (xs), a 4D tf.Tensor.
   *          ys: The target tensors (ys), one-hot encoding, a 2D tf.Tensor.
   */
  private collectTransferLearnDataAsTensors(modelName: string):
      {xs: tf.Tensor, ys: tf.Tensor} {
    tf.util.assert(
        this.words[modelName] != null,
        `No word example is available for tranfer-learning model of name ` +
            modelName);
    return tf.tidy(() => {
      const xTensors: tf.Tensor[] = [];
      const targetIndices: number[] = [];
      this.words[modelName].forEach((word, i) => {
        this.transferLearnExamples[modelName][word].forEach(wordTensor => {
          xTensors.push(wordTensor);
          targetIndices.push(i);
        });
      });
      return {
        xs: tf.concat(xTensors, 0),
        ys: tf.oneHot(
            tf.tensor1d(targetIndices, 'int32'),
            Object.keys(this.words[modelName]).length)
      };
    });
  }

  /**
   * Get counts of the word examples that have been collected for a
   * transfer-learning model.
   *
   * @param {string} modelName Name of the model.
   */
  getTransferLearningExampleCounts(modelName: string):
      {[word: string]: number} {
    if (this.transferLearnExamples[modelName] == null) {
      throw new Error(
          `No examples have been collected for transfer-learning model ` +
          `named '${modelName}' yet.`);
    }
    const counts: {[word: string]: number} = {};
    for (const word in this.transferLearnExamples[modelName]) {
      counts[word] = this.transferLearnExamples[modelName][word].length;
    }
    return counts;
  }

  /**
   * List the names of the transfer-learning models.
   */
  transferLearningModelNames(): string[] {
    const modelNames = Object.keys(this.models);
    modelNames.splice(modelNames.indexOf(this.BASE_MODEL_NAME), 1);
    return modelNames;
  }

  private collectTransferLearnWords(modelName: string) {
    this.words[modelName] =
        Object.keys(this.transferLearnExamples[modelName]).sort();
  }

  private checkInputTensorShape(input: tf.Tensor) {
    const baseModel = this.models[this.BASE_MODEL_NAME];
    const expectedRank = baseModel.inputs[0].shape.length;
    if (input.shape.length !== expectedRank) {
      throw new Error(
          `Expected input Tensor to have rank ${expectedRank}, ` +
          `but got rank ${input.shape.length} that differs `);
    }
    const nonBatchedShape = input.shape.slice(1);
    const expectedNonBatchShape = baseModel.inputs[0].shape.slice(1);
    if (!tf.util.arraysEqual(nonBatchedShape, expectedNonBatchShape)) {
      throw new Error(
          `Expected input to have shape [null,${expectedNonBatchShape}], ` +
          `but got shape [null,${nonBatchedShape}]`);
    }
  }

  // TODO(cais): Implement model save and load.
}
