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

import {TimedMenu, TimedMenuSpec} from './timed_menu';

async function sleep(millis: number) {
  return new Promise(resolve => {
    setTimeout(() => resolve(), millis);
  });
}

describe('TimedMenu', () => {
  const ONE_LEVEL_MENU_SPEC: TimedMenuSpec = {
    nodes:
        [{name: 'foo', action: 'fooAction'}, {name: 'bar', action: 'barAction'}]
  };

  const TWO_LEVEL_MENU_SPEC: TimedMenuSpec = {
    nodes: [
      {
        name: 'foo',
        action: 'fooAction',
        timeToLiveMillis: 100,
        children: [{name: 'qux', action: 'quxAction'}]
      },
      {
        name: 'bar',
        action: 'barAction',
        timeToLiveMillis: 200,
        children: [{name: 'bralt', action: 'braltAction'}]
      }
    ]
  };

  fit('One-level menu: correct state and actions', async () => {
    const tickMillis = 10;
    const menu = new TimedMenu(ONE_LEVEL_MENU_SPEC, null, {tickMillis});
    expect(menu.registerEvent('foo')).toEqual('fooAction');
    await sleep(tickMillis);
    expect(menu.registerEvent('bar')).toEqual('barAction');
    await sleep(tickMillis);
    expect(menu.registerEvent('foo')).toEqual('fooAction');
    await sleep(tickMillis);
    expect(menu.registerEvent('qux')).toEqual(null);
  });

  fit('Two-level menu: correct state and actions', async () => {
    const tickMillis = 10;
    const menu = new TimedMenu(TWO_LEVEL_MENU_SPEC, null, {tickMillis});

    expect(menu.registerEvent('foo')).toEqual('fooAction');
    await sleep(tickMillis);
    expect(menu.registerEvent('qux')).toEqual('quxAction');
    await sleep(tickMillis);
    expect(menu.registerEvent('bar')).toEqual('barAction');
    await sleep(tickMillis);
    expect(menu.registerEvent('bralt')).toEqual('braltAction');
    await sleep(tickMillis);
    expect(menu.registerEvent('foo')).toEqual('fooAction');
    await sleep(tickMillis);
    expect(menu.registerEvent('qux')).toEqual('quxAction');
    await sleep(tickMillis);

    expect(menu.registerEvent('bar')).toEqual('barAction');
    await sleep(tickMillis);
    expect(menu.registerEvent('qux')).toEqual(null);
    await sleep(tickMillis);
    expect(menu.registerEvent('bralt')).toEqual('braltAction');
    await sleep(tickMillis);

    expect(menu.registerEvent('foo')).toEqual('fooAction');
    await sleep(tickMillis);
    expect(menu.registerEvent('bralt')).toEqual(null);
    await sleep(tickMillis);
    expect(menu.registerEvent('qux')).toEqual('quxAction');
  });

  fit('Two-level menu: timeout', done => {
    const tickMillis = 10;
    const menu = new TimedMenu(TWO_LEVEL_MENU_SPEC, null, {tickMillis});

    menu.registerEvent('foo');
    setTimeout(async () => {
      // 'foo' should have timed out.
      expect(menu.registerEvent('qux')).toEqual(null);
      await sleep(tickMillis);

      expect(menu.registerEvent('bar')).toEqual('barAction');
      await sleep(tickMillis);
      expect(menu.registerEvent('bralt')).toEqual('braltAction');
      done();
    }, 150);
  });

  fit('Two-level menu: callback is invoked', async () => {
    const callbackInvokeRecords: string[][] = [];
    const callback = async (stateSequence: string[]) => {
      callbackInvokeRecords.push(stateSequence);
    };

    const tickMillis = 10;
    const menu = new TimedMenu(TWO_LEVEL_MENU_SPEC, callback, {tickMillis});
    menu.registerEvent('foo');
    await sleep(tickMillis);

    expect(callbackInvokeRecords.length).toBeGreaterThan(0);
    expect(callbackInvokeRecords[callbackInvokeRecords.length - 1])
        .toEqual(['foo']);
  });

  fit('Two-level menu: callback is invoked: before any events', async () => {
    const callbackInvokeRecords: string[][] = [];
    const callback =
        async (stateSequence: string[]) => {
      callbackInvokeRecords.push(stateSequence);
    };

    const tickMillis = 10;
    new TimedMenu(TWO_LEVEL_MENU_SPEC, callback, {tickMillis});
    await sleep(tickMillis);

    expect(callbackInvokeRecords.length).toBeGreaterThan(0);
    for (const record of callbackInvokeRecords) {
      expect(record).toEqual([]);
    }
  });
});