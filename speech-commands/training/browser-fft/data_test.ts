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

import * as tf from '@tensorflow/tfjs';
import {describeWithFlags} from '@tensorflow/tfjs-core/dist/jasmine_util';
import {Float32Concat, normalize} from './data';

const testEnvs = tf.test_util.NODE_ENVS;

describeWithFlags('BrowserFFT Training Data Modlue', testEnvs, () => {
  it('normalize`', () => {
    const xs = new Float32Array([10, 20, 30]);
    const ys = normalize(xs);
    tf.test_util.expectArraysClose(ys, new Float32Array([-1.2247, 0, 1.2247]));
  });

  it('Float32Concat', () => {
    const x1 = new Float32Array([1, 2, 3]);
    const x2 = new Float32Array([-100, -200]);
    const x3 = new Float32Array([1.1, 2.2]);
    const y = Float32Concat([x1, x2, x3]);
    tf.test_util.expectArraysClose(
        y, new Float32Array([1, 2, 3, -100, -200, 1.1, 2.2]));
  });
});