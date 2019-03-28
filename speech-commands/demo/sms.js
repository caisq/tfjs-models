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

const twilioSIDInput = document.getElementById('twilio-sid');
const twilioSecretInput = document.getElementById('twilio-secret');

if (twilioSIDInput) {
  const TWILIO_SID_KEY = 'euphonia-twilio-sid';
  const savedValue = localStorage.getItem(TWILIO_SID_KEY);
  if (savedValue != null && savedValue.length > 0) {
    twilioSIDInput.value = savedValue;
  }

  twilioSIDInput.addEventListener('change', () => {
    const value = twilioSIDInput.value.trim();
    if (value) {
      localStorage.setItem(TWILIO_SID_KEY, twilioSIDInput.value);
      console.log('Saved new twilio SID to local storage');
    }
  });
}

if (twilioSecretInput) {
  const TWILIO_SECRET_KEY = 'euphonia-twilio-secret';
  const savedValue = localStorage.getItem(TWILIO_SECRET_KEY);
  if (savedValue != null && savedValue.length > 0) {
    twilioSecretInput.value = savedValue;
  }

  twilioSecretInput.addEventListener('change', () => {
    const value = twilioSecretInput.value.trim();
    if (value) {
      localStorage.setItem(TWILIO_SECRET_KEY, twilioSecretInput.value);
      console.log('Saved new twilio secret to local storage');
    }
  });
}

export async function sendTextMessage(recipientPhoneNumber, message) {
  if (twilioSIDInput == null) {
    throw new Error('Cannot find twilio SID input box');
  }
  if (twilioSecretInput == null) {
    throw new Error('Cannot find twilio secret input box');
  }
  const twilioSID = twilioSIDInput.value.trim();
  if (twilioSID == null || twilioSID === '') {
    throw new Error('Empty twilio SID');
  }
  console.log(`twilioSID = ${twilioSID}`);
  const twilioSecret = twilioSecretInput.value.trim();
  if (twilioSecret == null || twilioSecret === '') {
    throw new Error('Empty twilio secret');
  }
  console.log(`twilioSecret = ${twilioSecret}`);

  const twilioURL =
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSID}/Messages.json`;
  const fromPhoneNumber = '+16672171745';
  const params = {
      'Body': message,
      'From': fromPhoneNumber,
      'To': recipientPhoneNumber
  };
  const body = new URLSearchParams();
  Object.keys(params).forEach(key => {
    console.log(`Appending ${key} = ${params[key]}`);
    body.append(key, params[key]);
  });
  const headers = new Headers();
  headers.set(
      'Authorization',
      'Basic ' + Buffer.from(twilioSID + ":" + twilioSecret).toString('base64'));
  headers.set('Content-Type', 'application/x-www-form-urlencoded');

  const response = await fetch(twilioURL, {
      method: 'POST',
      headers,
      body
  });

  const success = response.status >= 200 && response.status < 300;
  if (!success) {
    console.log(response.status);
    throw new Error(`Sending text message failed: ${response.statusText}`);
  }
  return success;
}
