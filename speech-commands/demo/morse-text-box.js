import { ttsSpeak } from "./tts";

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

export class MorseTextBox {
  constructor(textInput, convertButton, sayButton, undoButton, clearButton) {
    this.textInput = textInput;
    this.convertButton = convertButton;
    this.sayButton = sayButton;
    this.undoButton = undoButton;
    this.clearButton = clearButton;
    this.textHistory = [];

    this.convertButton.addEventListener('click', this.convertMorse.bind(this));
    this.sayButton.addEventListener('click', this.say.bind(this));
    this.undoButton.addEventListener('click', this.undo.bind(this));
    this.clearButton.addEventListener('click', this.clear.bind(this));
  }

  type(text) {
    const newText = this.textInput.value + text;
    this.update(newText);
  }

  convertMorse() {
    let out = '';
    let i = 0;
    const input = this.textInput.value;
    let temp = '';
    while (i < input.length) {
      temp += input[i];
      if (MORSE_ALPHABET.indexOf(input[i]) === -1) {
        out += temp;
        temp = '';
      } else if (
          temp in MORSE_DICT &&
          !(`${temp}.` in MORSE_DICT || `${temp}-` in MORSE_DICT)) {
        out += MORSE_DICT[temp];
        temp = '';
      }
      i++;
    }
    if (temp in MORSE_DICT) {
      out += MORSE_DICT[temp];
    } else {
      out += temp;
    }
    this.update(out);
  }

  update(text) {
    if (text !== this.textInput.value) {
      this.textInput.value = text;
      this.textHistory.push(text);
    }
  }

  undo() {
    if (this.textHistory.length > 0) {
      this.textHistory.pop();
      this.textInput.value = this.textHistory.length > 0 ?
          this.textHistory[this.textHistory.length - 1] : '';
    }
  }

  clear() {
    this.update('');
  }

  say() {
    ttsSpeak(this.textInput.value);
  }

  getText() {
    return this.textInput.value;
  }
}

const MORSE_ALPHABET = ['.', '-'];
const MORSE_DICT = {
  "-----":"0",
  ".----":"1",
  "..---":"2",
  "...--":"3",
  "....-":"4",
  ".....":"5",
  "-....":"6",
  "--...":"7",
  "---..":"8",
  "----.":"9",
  ".-":"a",
  "-...":"b",
  "-.-.":"c",
  "-..":"d",
  ".":"e",
  "..-.":"f",
  "--.":"g",
  "....":"h",
  "..":"i",
  ".---":"j",
  "-.-":"k",
  ".-..":"l",
  "--":"m",
  "-.":"n",
  "---":"o",
  ".--.":"p",
  "--.-":"q",
  ".-.":"r",
  "...":"s",
  "-":"t",
  "..-":"u",
  "...-":"v",
  ".--":"w",
  "-..-":"x",
  "-.--":"y",
  "--..":"z",
  "/":" ",
  "-·-·--":"!",
  "·-·-·-":".",
  "--··--":","
};