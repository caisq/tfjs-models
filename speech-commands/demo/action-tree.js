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
import {showMessage, refreshStartActionTreeButtonStatus} from './run';
import {sendTextMessage} from './sms.js';
import {ttsSpeak} from './tts';

const savedTreesSelect = document.getElementById('saved-trees');
const loadTreeButton = document.getElementById('load-tree');
const saveTreeButton = document.getElementById('save-tree');
const deleteTreeButton = document.getElementById('delete-tree');
const newTreeButton = document.getElementById('new-tree');

let actionTreeNeedsRedraw = false;

const initialActionTreeConfig = {
  nodes: [
    {
      name: 'hello',
      timeToLiveMillis: 5000,
      timeOutAction: 'say Node 1 has timed out.',
      children: [
        {
          name: 'hello',
          timeToLiveMillis: 5000,
          timeOutAction: 'say Node 2 has timed out.',
          children: [
            {name: 'hello', action: 'say how are you'},
            {name: 'testing', action: 'say what\'s your name'}
          ]
        },
        {
          name: 'testing',
          timeToLiveMillis: 5000,
          children: [
            {name: 'hello', action: 'say i am fine'},
            {name: 'testing', action: 'say goodbye'}
          ]
        }
      ]
    },
    {
      name: 'testing',
      timeToLiveMillis: 5000,
      children: [
        {name: 'hello', action: 'email shanqing.cai@gmail.com i am okay'},
        {name: 'testing', action: 'email shanqing.cai@gmail.com help'}
      ]
    },
    {
      name: 'aa',
      timeToLiveMillis: 5000,
      children: [
        {
          name: 'aa',
          timeToLiveMillis: 5000,
          children: [
            {name: 'aa', regressSteps: 1, action: 'type .'},
            {name: 'ee', regressSteps: 1, action: 'type -'}, {
              name: 'uu',
              timeToLiveMillis: 5000,
              children: [
                {name: 'aa', regressSteps: 2, action: 'typeSpace'},
                {name: 'ee', regressSteps: 2, action: 'morseConvertText'}
              ]
            }
          ]
        },
        {
          name: 'uu',
          timeToLiveMillis: 5000,
          children: [
            {
              name: 'aa',
              timeToLiveMillis: 5000,
              children: [
                {name: 'aa', regressSteps: 1, action: 'sayText'}, {
                  name: 'ee',
                  regressSteps: 1,
                  action: 'emailText shanqing.cai@gmail.com'
                }
              ]
            },
            {name: 'ee', regressSteps: 2, action: 'undoText'},
            {name: 'uu', regressSteps: 2, action: 'clearText'}
          ]
        }
      ]
    }
  ]
};

const defaultNewTreeConfig = {
  nodes: [
    {
      name: 'one',
      timeToLiveMillis: 5000,
      timeOutAction: "say Node 1 has timed out.",
      children: [
        {
          name: 'one',
          action: 'say how are you'
        },
        {
          name: 'two',
          action: 'say goodbye'
        }
      ]
    }
  ],
  resetWord: null
}

class ActionTreeSet {
  static get LOCAL_STORAGE_KEY() {
    return 'action-tree-set';
  }

  constructor(trees) {
    if (trees == null) {
      this.trees_ = {};
    } else {
      this.trees_ = trees;
      util.assert(typeof trees === 'object', `Expected trees to be an object`);
    }
  }

  set(name, actionTreeObject) {
    util.assert(
        name != null && typeof name === 'string' && name.length > 0,
        `Expected name to be a non-empty string, but got ${name}`);
    util.assert(
        typeof actionTreeObject === 'object',
        `Expected actionTreeObject to be an object, ` +
            `but got ${actionTreeObject}`);
    this.trees_[name] = actionTreeObject;
  }

  get(name) {
    util.assert(name in this.trees_, `There is no tree named ${tree}`);
    return this.trees_[name];
  }

  names() {
    return Object.keys(this.trees_);
  }

  remove(name) {
    util.assert(
        name in this.trees_, `Attempt to delete nonexistent tree: ${name}`);
    delete this.trees_[name];
  }

  save() {
    window.localStorage.setItem(
        ActionTreeSet.LOCAL_STORAGE_KEY, JSON.stringify(this.trees_));
  }
}

function createOrLoadTreeSet() {
  const serializedTree = window.localStorage.getItem(ActionTreeSet.LOCAL_STORAGE_KEY);
  if (serializedTree == null) {
    console.log('Creating new action tree...');
    const treeSet = new ActionTreeSet();
    treeSet.set('hello-testing-aa-ee-uu', initialActionTreeConfig);
    treeSet.save();
    return treeSet;
  } else {
    console.log('Loading action tree...');
    return new ActionTreeSet(JSON.parse(serializedTree));
  }
}

let treeSet;
if (savedTreesSelect != null) {
  treeSet = createOrLoadTreeSet();
  populateSavedTreeSelect(treeSet);
  saveTreeButton.disabled = true;
  deleteTreeButton.disabled = false;
}

function populateSavedTreeSelect(treeSet) {
  while(savedTreesSelect.firstChild) {
    savedTreesSelect.removeChild(savedTreesSelect.firstChild);
  }
  const names = treeSet.names();
  names.sort();
  for (const name of names) {
    const option = document.createElement('option');
    option.textContent = name;
    savedTreesSelect.appendChild(option);
  }
}

if (loadTreeButton != null) {
  loadTreeButton.addEventListener('click', () => {
    actionTreeNeedsRedraw = true;
    const actionTree = treeSet.get(savedTreesSelect.value);
    savedTreesSelect.disabled = true;
    loadTreeButton.disabled = true;
    actionTreeJSONEditor.set(actionTree);
    saveTreeButton.disabled = false;
    refreshStartActionTreeButtonStatus();
  });
}

if (saveTreeButton != null) {
  saveTreeButton.addEventListener('click', () => {
    try {
      actionTreeNeedsRedraw = true;
      const tree = actionTreeJSONEditor.get();
      treeSet.set(savedTreesSelect.value, tree);
      treeSet.save();
      showMessage(`Tree "${savedTreesSelect.value}" is saved.`);
    } catch (err) {
      showMessage(err.message, 'error');
    }
  });
}

if (deleteTreeButton != null) {
  deleteTreeButton.addEventListener('click', () => {
    try {
      const treeName = savedTreesSelect.value;
      if (window.confirm(`Do you really want to delete tree "${treeName}"?`)) {
        deleteTreeButton.disabled = true;
        treeSet.remove(treeName);
        treeSet.save();
        populateSavedTreeSelect(treeSet);
        showMessage(`Tree ${treeName} has been deleted.`);
      }
    } catch (error) {
      showMessage(error.message, 'error');
    }
  });
}

if (newTreeButton != null) {
  newTreeButton.addEventListener('click', () => {
    const newTreeName = window.prompt('Enter name for new model:');
    if (newTreeName == null || newTreeName.length === 0) {
      showMessage('Model name cannot be empty!', 'error');
    }
    if (treeSet.names ().indexOf(newTreeName) !== -1) {
      showMessage(
          `Cannot create tree: There is already a tree with the name ` +
          `"${newTreeName}"`, 'error');
    } else {
      treeSet.set(newTreeName, defaultNewTreeConfig);
      treeSet.save();
      populateSavedTreeSelect(treeSet);
      savedTreesSelect.value = newTreeName;
      deleteTreeButton.disabled = false;
      savedTreesSelect.disabled = true;
      loadTreeButton.disabled = true;
      actionTreeJSONEditor.set(treeSet.get(newTreeName));
      saveTreeButton.disabled = false;
    }
  });
}

const actionTreeJSONEditor =
    new JSONEditor(document.getElementById('json-editor'), {mode: 'code'});

function getTreantConfig(containerId, timedMenuConfig) {
  const treantConfig = {
    chart: {
      container: containerId.startsWith('#') ? containerId : `#${containerId}`,
      nodeAlign: 'BOTTOM',
      rootOrientation: 'WEST',
      siblingSeparation: 5,
      levelSeparation: 40,
      subTeeSeparation: 5,
      connectors: {type: 'step'},
      node: {HTMLclass: 'node-element'}
    },
    nodeStructure: {
      // Root node.
      text: {name: ''},
      HTMLid: 'tree-level-0',  // Carry tree-level information here.
      HTMLclass: 'action-tree-node'
    }
  }
  getTreantConfigInner(timedMenuConfig.nodes, treantConfig.nodeStructure, 1);
  return treantConfig;
}

function getTreantConfigInner(timedMenuNodes, treantConfig, level, levelName) {
  treantConfig.children = [];
  for (const node of timedMenuNodes) {
    const nodeConfig = {
      text: {name: node.name},
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
          treantConfig.children[treantConfig.children.length - 1], level + 1,
          levelName == null ? `${node.name}` : `${levelName}-${node.name}`);
    }
  }
  return treantConfig;
}

let tree;
export function drawActionTree(containerId, timedMenuConfig, stateSequence) {
  if (tree == null || actionTreeNeedsRedraw) {
    actionTreeNeedsRedraw = false;
    const element = document.getElementById(containerId);
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
    if (timedMenuConfig.resetWord != null) {
      document.getElementById('action-tree-aux-info').textContent =
          `Reset word: "${timedMenuConfig.resetWord}"`;
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
        // Tree nodes closer to the leaves (i.e., with higher value of
        // tree-level) take precedence.
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
const SMS_COMMAND = 'sms ';
const TYPE_COMMAND = 'type ';
const TYPE_SPACE_COMMAND = 'typespace';
const SAY_TEXT_COMMAND = 'saytext';
const MORSE_CONVERT_TEXT_COMMAND = 'morseconverttext';
const UNDO_TEXT_COMMAND = 'undotext';
const EMAIL_TEXT_COMMAND = 'emailtext ';
const CLEAR_TEXT_COMMAND = 'cleartext';

const PEAC_CONTROL_COMMAND = 'peac-control ';

const RESET_COMMAND = 'reset';

async function peacControl(serverURL, deviceID, numVal) {
  console.log(
      `In peacControl(): serverURL=${serverURL}, deviceID=${deviceID}; ` +
      `numVal=${numVal}`);

  const username = 'google';
  const password = '';

  const data = {id: deviceID, numVal};
  const headers = new Headers();
  headers.append('Content-Type', 'application/json');
  headers.append('Accept', 'application/json');
  headers.append('Authorization',
      'Basic ' + Buffer.from(username + ":" + password).toString('base64'));
  const resp = await fetch(serverURL, {
    method: 'PUT',
    headers,
    body: JSON.stringify(data)
  });
  console.log('response from peac server:', resp);
}

export async function executeTimedMenuAction(action) {
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
    document.getElementById('email-text').value = `Message: ${emailMessage} ` +
        `(Timestamp: ${new Date().toString()})`;
    try {
      handleEmailAuthClick();  // Experiment: email sending.
    } catch (err) {
      ttsSpeak('Failed to send email. Sorry.');
    }
  } else if (action.toLowerCase().indexOf(SMS_COMMAND) === 0) {
    console.log('Processing sms');  // DEBUG
    let smsMessage = action.slice(SMS_COMMAND.length);
    const smsRecipient = smsMessage.slice(0, smsMessage.indexOf(' '));
    smsMessage = smsMessage.slice(smsMessage.indexOf(' '));
    try {
      console.log(`Sending text message to ${smsRecipient}`);
      ttsSpeak(`Sending text message to ${smsRecipient}`);
      const success = await sendTextMessage(smsRecipient, smsMessage);
      if (success) {
        ttsSpeak(`Text message sent successfully.`);
      }
    } catch (error) {
      console.error(`SMS Error:`, error);
      ttsSpeak(`Failed to send text message.`);
      throw error;
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
  } else if (action.toLowerCase().trim() === CLEAR_TEXT_COMMAND) {
    morseTextBox.clear();
  } else if (action.toLowerCase().trim() === SAY_TEXT_COMMAND) {
    morseTextBox.say();
  } else if (action.toLowerCase().indexOf(EMAIL_TEXT_COMMAND) === 0) {
    const emailRecipient = action.slice(EMAIL_TEXT_COMMAND.length).trim();
    console.log(`Sending email to ${emailRecipient}`);
    ttsSpeak(`Sending email to ${emailRecipient}`);
    document.getElementById('email-recipient').value = emailRecipient;
    document.getElementById('email-text').value = morseTextBox.getText();
    try {
      handleEmailAuthClick();  // Experiment: email sending.
    } catch (err) {
      ttsSpeak('Failed to send email. Sorry.');
    }
  } else if (action.toLowerCase().indexOf(PEAC_CONTROL_COMMAND) === 0) {
    // PEAC device control.
    const items = action.split(' ');
    if (items.length !== 4) {
      throw new Error(
          `Expected peak-control command to have 4 elements, ` +
          `but got ${items.length}.`);
    }
    const serverURL = items[1];
    const deviceID = items[2];
    const numVal = items[3];
    peacControl(serverURL, deviceID, numVal);
  } else {
    throw new Error(`Unrecognized action: "${action}"`);
  }
}

/**
 * Get all names (i.e,. trigger words) from an action tree config.
 *
 * @param {object} actionTreeConfig The configuration of the action tree.
 * @returns An array of all unique names from the action tree.
 */
function getAllNodeNames(actionTreeConfig) {
  const uniqueNames = [];
  if (actionTreeConfig.nodes != null) {
    actionTreeConfig = actionTreeConfig.nodes;
  }
  for (const nodeItem of actionTreeConfig) {
    if (uniqueNames.indexOf(nodeItem.name) === -1) {
      uniqueNames.push(nodeItem.name);
      if (nodeItem.children != null) {
        const childrenNames = getAllNodeNames(nodeItem.children);
        childrenNames.forEach(name => {
          if (uniqueNames.indexOf(name) === -1) {
            uniqueNames.push(name);
          }
        });
      }
    }
  }
  uniqueNames.sort();
  return uniqueNames;
}

export function parseActionTreeConfig() {
  const config = actionTreeJSONEditor.get();
  if (config == null ||
      typeof config === 'string' && config.length === 0 ||
      typeof config === 'object' && Object.keys(config).length === 0) {
    throw new Error('Invalid action tree! Load a tree first.');
  }
  const uniqueNames = getAllNodeNames(config);
  return {config, uniqueNames};
}
