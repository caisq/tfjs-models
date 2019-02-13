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

import {util} from '@tensorflow/tfjs';

import {handleEmailAuthClick} from './emailing';
import {MorseTextBox} from './morse-text-box';
import {ttsSpeak} from './tts';

const initialActionTreeConfig = {
  nodes: [{
    name: 'hello',
    timeToLiveMillis: 5000,
    timeOutAction: 'say Node 1 has timed out.',
    children: [{
      name: 'hello',
      timeToLiveMillis: 5000,
      timeOutAction: 'say Node 2 has timed out.',
      children: [{
        name: 'hello',
        action: 'say how are you'
      }, {
        name: 'testing',
        action: 'say what\'s your name'
      }]
    }, {
      name: 'testing',
      timeToLiveMillis: 5000,
      children: [{
        name: 'hello',
        action: 'say i am fine'
      }, {
        name: 'testing',
        action: 'say goodbye'
      }]
    }]
  }, {
    name: 'testing',
    timeToLiveMillis: 5000,
    children: [{
      name: 'hello',
      action: 'email shanqing.cai@gmail.com i am okay'
    }, {
      name: 'testing',
      action: 'email shanqing.cai@gmail.com help'
    }]
  }, {
    name: 'aa',
    timeToLiveMillis: 5000,
    children: [{
      name: 'aa',
      timeToLiveMillis: 5000,
      children: [{
        name: 'aa',
        regressSteps: 1,
        action: 'type .'
      }, {
        name: 'ee',
        regressSteps: 1,
        action: 'type -'
      }, {
        name: 'uu',
        timeToLiveMillis: 5000,
        children: [{
          name: 'aa',
          regressSteps: 2,
          action: 'typeSpace'
        }, {
          name: 'ee',
          regressSteps: 2,
          action: 'morseConvertText'
        }]
      }]
    }, {
      name: 'uu',
      timeToLiveMillis: 5000,
      children: [{
        name: 'aa',
        timeToLiveMillis: 5000,
        children: [{
          name: 'aa',
          regressSteps: 1,
          action: 'sayText'
        }, {
          name: 'ee',
          regressSteps: 1,
          action: 'emailText shanqing.cai@gmail.com'
        }]
      }, {
        name: 'ee',
        regressSteps: 2,
        action: 'undoText'
      }, {
        name: 'uu',
        regressSteps: 2,
        action: 'clearText'
      }]
    }]
  }]
};
const actionTreeJSONEditor = new JSONEditor(
    document.getElementById("json-editor"), {mode: 'code'});
actionTreeJSONEditor.set(initialActionTreeConfig);

function getTreantConfig(containerId, timedMenuConfig, stateSequence) {
  const treantConfig = {
    chart: {
      container:
          containerId.startsWith('#') ? containerId : `#${containerId}`,
      nodeAlign: 'BOTTOM',
      rootOrientation: 'WEST',
      siblingSeparation: 5,
      levelSeparation: 40,
      subTeeSeparation: 5,
      connectors: {
        type: 'step'
      },
      node: {
        HTMLclass: 'node-element'
      }
    },
    nodeStructure: {  // Root node.
      text: {
        name: ''
      },
      HTMLid: 'tree-level-0',  // Carry tree-level information here.
      HTMLclass: 'action-tree-node'
    }
  }
  getTreantConfigInner(
      timedMenuConfig.nodes, treantConfig.nodeStructure, 1);
  return treantConfig;
}

function getTreantConfigInner(timedMenuNodes, treantConfig, level, levelName) {
  treantConfig.children = [];
  for (const node of timedMenuNodes) {
    const nodeConfig = {
      text: {
        name: node.name
      },
      HTMLid: levelName == null ?
          `tree-level-${level}-${node.name}` :
          `tree-level-${level}-${levelName}-${node.name}`,
      HTMLclass: 'action-tree-node'
    };
    if (node.action != null && node.action.length > 0) {
      nodeConfig.text.title = node.action;
    }
    if (node.timeOutAction != null && node.timeOutAction.length > 0) {
      if (nodeConfig.text.title == null) {
        nodeConfig.text.title = '';
      }
      nodeConfig.text.title += `\n(Timeout: ${node.timeOutAction})`;
    }
    treantConfig.children.push(nodeConfig);
    if (node.children != null && node.children.length > 0) {
      // Non-leaf node.
      getTreantConfigInner(
          node.children,
          treantConfig.children[treantConfig.children.length - 1],
          level + 1,
          levelName == null ? `${node.name}` : `${levelName}-${node.name}`);
    }
  }
  return treantConfig;
}

let tree;
export function drawActionTree(containerId, timedMenuConfig, stateSequence) {
  if (tree == null) {
    const element = document.getElementById(containerId);
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
    tree = new Treant(
        getTreantConfig(containerId, timedMenuConfig, stateSequence));
  }
  colorNodesByStateSequence(stateSequence);
}

function colorNodesByStateSequence(stateSequence) {
  const treeElements = document.getElementsByClassName('action-tree-node');

  let offsetTop = 0;
  let offsetLeft = 0;
  let currentTreeLevel = -1;
  for (const element of treeElements) {
    const elementPath = parseStateSequenceFromElementID(element.id);
    if (elementPath.length === 0 ||
        stateSequence.length >= elementPath.length &&
        util.arraysEqual(
            stateSequence.slice(0, elementPath.length), elementPath)) {
      if (elementPath.length !== 0 &&
          stateSequence.length === elementPath.length) {
        element.classList.add('green');
      } else {
        element.classList.add('blue');
      }

      const treeLevel = parseTreeLevelFromElementID(element.id);
      if (treeLevel > currentTreeLevel) {
        // Tree nodes closer to the leaves (i.e., with higher value of tree-level)
        // take precedence.
        offsetTop = element.offsetTop;
        offsetLeft = element.offsetLeft;
        currentTreeLevel = treeLevel;
      }
    } else {
      element.classList.remove('blue');
      element.classList.remove('green');
    }
  }

  // Scroll to the active element(s).
  const actionTreeElement = document.getElementById('action-tree');
  const targetScrollTop =
      Math.max(0, offsetTop - actionTreeElement.offsetHeight / 2);
  const targetScrollLeft =
      Math.max(0, offsetLeft - actionTreeElement.offsetWidth / 2);
  actionTreeElement.scrollTop = targetScrollTop;
  actionTreeElement.scrollLeft = targetScrollLeft;
  // smoothScroll(
  //     actionTreeElement, actionTreeElement.scrollTop, targetScrollTop,
  //     actionTreeElement.scrollLeft, targetScrollLeft);
}

async function sleep(millis) {
  return new Promise(resolve => {
    setTimeout(resolve, millis);
  });
}

async function smoothScroll(element, beginTop, endTop, beginLeft, endLeft) {
  console.log(  // DEBUG
      `smooth scroll: ${beginTop}-->${endTop}; ${beginLeft}-->${endLeft}`);
  if (endLeft === beginLeft) {
    return;
  }
  const SCROLL_DUR_MILLIS = 100;
  const STEPS = 20;
  const STEP_MILLIS = SCROLL_DUR_MILLIS / STEPS;
  for (let i = 0; i < STEPS; ++i) {
    await sleep(STEP_MILLIS);
    const currTop = (endTop - beginTop) / STEPS * (i + 1) + beginTop;
    const currLeft = (endLeft - beginLeft) / STEPS * (i + 1) + beginLeft;
    element.scrollTop = currTop;
    element.scrollLeft = currLeft;
  }
}

function parseTreeLevelFromElementID(id) {
  if (!(id.startsWith('tree-level-'))) {
    throw new Error(
        `Expected element ID to start with "tree-level-", but got ID ${id}`);
  }
  return Number.parseInt(id.split('-')[2]);
}

function parseStateSequenceFromElementID(id) {
  if (!(id.startsWith('tree-level-'))) {
    throw new Error(
        `Expected element ID to start with "tree-level-", but got ID ${id}`);
  }
  return id.split('-').slice(3);
}

const morseTextBox = new MorseTextBox(
    document.getElementById('action-tree-text-input'),
    document.getElementById('action-tree-convert-morse'),
    document.getElementById('action-tree-say'),
    document.getElementById('action-tree-undo'),
    document.getElementById('action-tree-clear'));

const SAY_COMMAND = 'say ';
const EMAIL_COMMAND = 'email ';
const TYPE_COMMAND = 'type ';
const TYPE_SPACE_COMMAND = 'typespace';
const SAY_TEXT_COMMAND = 'saytext';
const MORSE_CONVERT_TEXT_COMMAND = 'morseconverttext';
const UNDO_TEXT_COMMAND = 'undotext';
const EMAIL_TEXT_COMMAND = 'emailtext ';
const CLEAR_TEXT_COMMAND = 'cleartext';

export function executeTimedMenuAction(action) {
  if (action == null || action.length === 0) {
    return;
  }
  if (action.toLowerCase().indexOf(SAY_COMMAND) === 0) {
    if (window.speechSynthesis != null) {
      ttsSpeak(action.slice(SAY_COMMAND.length));
    }
  } else if (action.toLowerCase().indexOf(EMAIL_COMMAND) === 0) {
    let emailMessage = action.slice(EMAIL_COMMAND.length);
    const emailRecipient = emailMessage.slice(0, emailMessage.indexOf(' '));
    emailMessage = emailMessage.slice(emailMessage.indexOf(' '));
    ttsSpeak(`Sending email to ${emailRecipient}`);
    document.getElementById('email-recipient').value = emailRecipient;
    document.getElementById('email-text').value =
        `Message: ${emailMessage} ` +
        `(Timestamp: ${new Date().toString()})`;
    try {
      handleEmailAuthClick();  // Experiment: email sending.
    } catch (err) {
      ttsSpeak('Failed to send email. Sorry.');
    }
  } else if (action.toLowerCase().indexOf(TYPE_COMMAND) === 0) {
    const typedMessage = action.slice(TYPE_COMMAND.length).trim();
    morseTextBox.type(typedMessage);
  } else if (action.toLowerCase().trim() === TYPE_SPACE_COMMAND) {
    morseTextBox.type(' ');
  } else if (action.toLowerCase().trim() === MORSE_CONVERT_TEXT_COMMAND) {
    morseTextBox.convertMorse();
  } else if (action.toLowerCase().trim() === UNDO_TEXT_COMMAND) {
    morseTextBox.undo();
  }  else if (action.toLowerCase().trim() === CLEAR_TEXT_COMMAND) {
    morseTextBox.clear();
  } else if (action.toLowerCase().trim() === SAY_TEXT_COMMAND) {
    morseTextBox.say();
  } else if (action.toLowerCase().indexOf(EMAIL_TEXT_COMMAND) === 0) {
    const emailRecipient = action.slice(EMAIL_TEXT_COMMAND.length).trim();
    console.log(`Sending email to ${emailRecipient}`);  // DEBUG
    ttsSpeak(`Sending email to ${emailRecipient}`);
    document.getElementById('email-recipient').value = emailRecipient;
    document.getElementById('email-text').value = morseTextBox.getText();
    try {
      handleEmailAuthClick();  // Experiment: email sending.
    } catch (err) {
      ttsSpeak('Failed to send email. Sorry.');
    }
  }
}

export function parseActionTreeConfig() {
  return actionTreeJSONEditor.get();
}
