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

// ================ GMail related experiment. ======================

const gmailAPIClientIDInput = document.getElementById('gmail-api-client-id');
const gmailAPIKeyInput = document.getElementById('gmail-api-key');

if (gmailAPIClientIDInput) {
  const GMAIL_API_CLIENT_ID = 'euphonia-gmail-api-client-id';
  const savedValue = localStorage.getItem(GMAIL_API_CLIENT_ID);
  if (savedValue != null && savedValue.length > 0) {
    gmailAPIClientIDInput.value = savedValue;
  }

  gmailAPIClientIDInput.addEventListener('change', () => {
    const value = gmailAPIClientIDInput.value.trim();
    if (value) {
      localStorage.setItem(GMAIL_API_CLIENT_ID, gmailAPIClientIDInput.value);
      console.log('Saved new GMail Client ID to local storage');
    }
  });
}

if (gmailAPIKeyInput) {
  const GMAIL_API_KEY = 'euphonia-gmail-api-key';
  const savedValue = localStorage.getItem(GMAIL_API_KEY);
  if (savedValue != null && savedValue.length > 0) {
    gmailAPIKeyInput.value = savedValue;
  }

  gmailAPIKeyInput.addEventListener('change', () => {
    const value = gmailAPIKeyInput.value.trim();
    if (value) {
      localStorage.setItem(GMAIL_API_KEY, gmailAPIKeyInput.value);
      console.log('Saved new GMail API key to local storage');
    }
  });
}

// Array of API discovery doc URLs for APIs used by the quickstart
var DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest"];
const SCOPES = 'https://www.googleapis.com/auth/gmail.send';

// const authorizeButton = document.getElementById('authorize_button');
// const signoutButton = document.getElementById('signout_button');
const activateGMailAPIButton = document.getElementById('activate-gmail-api');

/**
 *  On load, called to load the auth2 library and API client library.
 */
function handleAPIAuth() {
  gapi.load('client:auth2', initClient);
}

activateGMailAPIButton.addEventListener('click', () => handleAPIAuth());

/**
 *  Initializes the API client library and sets up sign-in state
 *  listeners.
 */
function initClient() {
  console.log('In initClient, apiKey:',
      gmailAPIKeyInput.value.trim());  // DEBUG
  gapi.client.init({
    apiKey: gmailAPIKeyInput.value.trim(),
    clientId: gmailAPIClientIDInput.value.trim(),
    discoveryDocs: DISCOVERY_DOCS,
    scope: SCOPES
  }).then(function () {
    console.log('initClient success');
    activateGMailAPIButton.textContent = 'GMail API activated successfully';
    activateGMailAPIButton.disabled = true;
    // Listen for sign-in state changes.
    gapi.auth2.getAuthInstance().isSignedIn.listen(updateSigninStatus);

    // Handle the initial sign-in state.
    updateSigninStatus(gapi.auth2.getAuthInstance().isSignedIn.get());
    // authorizeButton.onclick = handleEmailAuthClick;
    // signoutButton.onclick = handleSignoutClick;
  }, function(error) {
    activateGMailAPIButton.textContent = 'GMail API ERROR!  ';
    appendPre(JSON.stringify(error, null, 2));
    setTimeout(() => {
      activateGMailAPIButton.textContent = 'Activate GMail API';
    }, 2000);
  });
}

/**
 *  Called when the signed in status changes, to update the UI
 *  appropriately. After a sign-in, the API is called.
 */
function updateSigninStatus(isSignedIn) {
  if (isSignedIn) {
    // authorizeButton.style.display = 'none';
    // signoutButton.style.display = 'block';
    // listLabels();
    const textValue = document.getElementById('email-text').value;
    const emailText = `Just a test: ${textValue}`;
    sendEmail({
      'To': document.getElementById('email-recipient').value.trim(),
      'Subject': 'This is a test'
    }, emailText,
    status => {
      console.log('status:', status);  // DEBUG
      console.log('Done sending message');
      handleSignoutClick();
      console.log('Done signing out');
    });
  } else {
    // authorizeButton.style.display = 'block';
    // signoutButton.style.display = 'none';
  }
}

/**
 *  Sign in the user upon button click.
 */
export function handleEmailAuthClick(event) {
  gapi.auth2.getAuthInstance().signIn();
}

/**
 *  Sign out the user upon button click.
 */
function handleSignoutClick(event) {
  gapi.auth2.getAuthInstance().signOut();
}

/**
 * Append a pre element to the body containing the given message
 * as its text node. Used to display the results of the API call.
 *
 * @param {string} message Text to be placed in pre element.
 */
function appendPre(message) {
  var pre = document.getElementById('content');
  var textContent = document.createTextNode(message + '\n');
  pre.appendChild(textContent);
}

/**
 * Print all Labels in the authorized user's inbox. If no labels
 * are found an appropriate message is printed.
 */
function listLabels() {
  gapi.client.gmail.users.labels.list({
    'userId': 'me'
  }).then(function(response) {
    var labels = response.result.labels;
    appendPre('Labels:');

    if (labels && labels.length > 0) {
      for (i = 0; i < labels.length; i++) {
        var label = labels[i];
        appendPre(label.name)
      }
    } else {
      appendPre('No Labels found.');
    }
  });
}

function sendEmail(headers_obj, message, callback) {
  let email = '';
  for(var header in headers_obj) {
      email += header += ": " + headers_obj[header] + "\r\n";
  }
  email += "\r\n" + message;
  const sendRequest = gapi.client.gmail.users.messages.send({
    'userId': 'me',
    'resource': {
      'raw': window.btoa(email).replace(/\+/g, '-').replace(/\//g, '_')
    }
  });
  console.log('Calling sendRequest.execute()');  // DEBUG
  return sendRequest.execute(callback);
}

// activateGMailAPIButton.click();
