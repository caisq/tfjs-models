/**
 * @license
 * Copyright 2019 Google Inc. All Rights Reserved.
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

const RESET_ACTION = 'reset';

export type TimedMenuAction = string;

export type TimedMenuNodeSpec = {
  name: string;

  /**
   * Time to live (TTL) in millis.
   *
   * A negative value means living forever.
   */
  timeToLiveMillis?: number | null;

  action?: TimedMenuAction;

  /**
   * Optional action to perform when a non-leaf node times out.
   *
   * If this is set for a leaf node, no action will be taken.
   */
  timeOutAction?: TimedMenuAction;

  /**
   * Number of steps to go back once a leaf node is reached.
   * This is applicable only to leaf nodes. If it is set to a non-leaf
   * node, it will be ignored. By default, when a leaf node is reached,
   * the tree's state jumps back to the root.
   */
  regressSteps?: number;

  children?: TimedMenuNodeSpec[];
};

export type StateChangeType = 'advance'|'init'|'leaf'|'regress'|'regressSteps'|'reset';

export type TimedMenuSpec = {
  nodes: TimedMenuNodeSpec[];

  /** The word that cause the state to reset to root node. */
  resetWord?: string;

  metadata?: {};
};

export type TimedMenuTickCallback =
    (stateSequence: string[], stateChangeType: StateChangeType,
     timeOutAction?: TimedMenuAction) => Promise<void>;

export interface TimedMenuRuntimeOptions {
  tickMillis?: number;

  timeToLiveMultiplier?: number;
}

export class TimedMenu {
  private stateSequence: TimedMenuNodeSpec[];
  private lastEventTimeMillis: number;
  // tslint:disable-next-line:no-any
  private intervalTask: any;
  private tickMillis: number;
  private timeToLiveMultiplier: number;

  constructor(
      readonly config: TimedMenuSpec, 
      readonly callback?: TimedMenuTickCallback,
      runtimeOptions?: TimedMenuRuntimeOptions) {
    // Initial state: `[]` corresponds to the root node.
    if (runtimeOptions == null) {
      runtimeOptions = {};
    }
    this.stateSequence = [];
    this.tickMillis =
        runtimeOptions.tickMillis == null ? 500 : runtimeOptions.tickMillis;
    this.timeToLiveMultiplier =
        runtimeOptions.timeToLiveMultiplier == null ? 1 :
        runtimeOptions.timeToLiveMultiplier;
    this.intervalTask = setInterval(this.tick.bind(this), this.tickMillis);
    // Invoke callback in the beginning.
    if (this.callback != null) {
      this.callback(this.stateSequence.map(node => node.name), 'init');
    }
  }

  /**
   * If a leave node is hit, reset the state of the node to root.
   *
   * @param name
   * @returns action (If any).
   */
  registerEvent(name: string): TimedMenuAction {
    const candidates = this.stateSequence.length === 0 ?
        this.config.nodes :
        this.stateSequence[this.stateSequence.length - 1].children;
    if (candidates == null) {
      throw new Error('Cannot handle more events');
    }

    // Special logical path for resetting the state back to root.
    if (this.config.resetWord != null && name === this.config.resetWord &&
        this.stateSequence.length > 0) {
      console.log(`reset ordered by reset word "${name}".`);
      this.stateSequence = [];
      if (this.callback != null) {
        this.callback(
            this.stateSequence.map(node => node.name), 'reset');
      }
      return null;
    }

    for (const candidate of candidates) {
      if (candidate.name === name) {
        if (candidate.children == null || candidate.children.length === 0) {
          // Reached a leaf: Erase state.
          this.stateSequence.push(candidate);
          if (this.callback != null) {
            this.callback(this.stateSequence.map(node => node.name), 'leaf');
          }
          setTimeout(() => {
            if (candidate.regressSteps != null && candidate.regressSteps > 0) {
              for (let i = 0; i < candidate.regressSteps; ++i) {
                this.stateSequence.pop();
              }
              if (this.callback != null) {
                this.callback(
                    this.stateSequence.map(node => node.name), 'regressSteps');
              }
            } else {
              this.stateSequence = [];
              if (this.callback != null) {
                this.callback(
                    this.stateSequence.map(node => node.name), 'reset');
              }
            }

          }, this.tickMillis);
        } else {
          this.stateSequence.push(candidate);
          if (this.callback != null) {
            this.callback(
                this.stateSequence.map(node => node.name), 'advance');
          }
        }
        this.lastEventTimeMillis = tf.util.now();
        return candidate.action;
      }
    }
    return null;
  }

  protected tick() {
    if (this.stateSequence != null && this.stateSequence.length > 0) {
      const currNode = this.stateSequence[this.stateSequence.length - 1];
      const nowMillis = tf.util.now();
      if (currNode.timeToLiveMillis > 0 &&
          nowMillis - this.lastEventTimeMillis >
              currNode.timeToLiveMillis * this.timeToLiveMultiplier) {
        // Timed out. Update sequence.
        this.stateSequence.pop();
        this.lastEventTimeMillis = nowMillis;
        if (this.callback != null) {
          this.callback(
              this.stateSequence.map(node => node.name), 'regress',
              currNode.timeOutAction);
        }
      }
    }
  }

  stopTimer() {
    clearInterval(this.intervalTask);
  }
}
