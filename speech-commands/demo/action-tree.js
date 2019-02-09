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

import {handleEmailAuthClick} from './emailing';
import {MorseTextBox} from './morse-text-box';
import {ttsSpeak} from './tts';

const actionTreeConfigJsonInput = document.getElementById('action-tree-config-json');
const actionTreeTextInput = document.getElementById('action-tree-text-input');

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
actionTreeConfigJsonInput.value = JSON.stringify(initialActionTreeConfig, null, 2);

function getTreantConfig(containerId, timedMenuConfig, stateSequence) {
  const treantConfig = {
    chart: {
      container:
          containerId.startsWith('#') ? containerId : `#${containerId}`,
      nodeAlign: 'BOTTOM',
      connectors: {
        type: 'step'
      },
      node: {
        HTMLclass: 'nodeExample1'
      }
    },
    nodeStructure: {  // Root node.
      text: {
        name: ''
      }
    }
  }
  getTreantConfigInner(
      timedMenuConfig.nodes, stateSequence, treantConfig.nodeStructure);
  return treantConfig;
}

function getTreantConfigInner(timedMenuNodes, stateSequence, treantConfig) {
  treantConfig.children = [];
  for (const node of timedMenuNodes) {
    const nodeConfig = {
      text: {
        name: node.name
      }
    };
    const stateMatch =
        stateSequence.length > 0 && stateSequence[0] === node.name;
    if (stateMatch) {
      if (node.children == null || node.children.lengths === 0) {
        // Leaf node.
        nodeConfig.HTMLclass = 'green';
      } else {
        nodeConfig.HTMLclass = 'blue';
      }
    }
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
            stateMatch ? stateSequence.slice(1) : [],
            treantConfig.children[treantConfig.children.length - 1]);
    }
  }
  return treantConfig;
}

export function drawActionTree(containerId, timedMenuConfig, stateSequence) {
  const element = document.getElementById(containerId);
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
  const treantConfig =
      getTreantConfig(containerId, timedMenuConfig, stateSequence);
  new Treant(treantConfig);
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
  return JSON.parse(actionTreeConfigJsonInput.value);
}
