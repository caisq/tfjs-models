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

  it('One-level menu: correct state and actions', () => {
    const menu = new TimedMenu(ONE_LEVEL_MENU_SPEC, 10);
    expect(menu.registerEvent('foo')).toEqual('fooAction');
    expect(menu.registerEvent('bar')).toEqual('barAction');
    expect(menu.registerEvent('foo')).toEqual('fooAction');
    expect(menu.registerEvent('qux')).toEqual(null);
  });

  it('Two-level menu: correct state and actions', () => {
    const menu = new TimedMenu(TWO_LEVEL_MENU_SPEC, 10);

    expect(menu.registerEvent('foo')).toEqual('fooAction');
    expect(menu.registerEvent('qux')).toEqual('quxAction');
    expect(menu.registerEvent('bar')).toEqual('barAction');
    expect(menu.registerEvent('bralt')).toEqual('braltAction');
    expect(menu.registerEvent('foo')).toEqual('fooAction');
    expect(menu.registerEvent('qux')).toEqual('quxAction');

    expect(menu.registerEvent('bar')).toEqual('barAction');
    expect(menu.registerEvent('qux')).toEqual(null);
    expect(menu.registerEvent('bralt')).toEqual('braltAction');

    expect(menu.registerEvent('foo')).toEqual('fooAction');
    expect(menu.registerEvent('bralt')).toEqual(null);
    expect(menu.registerEvent('qux')).toEqual('quxAction');
  });

  it('Two-level menu: timeout', done => {
    const menu = new TimedMenu(TWO_LEVEL_MENU_SPEC, 10);

    menu.registerEvent('foo');
    setTimeout(() => {
      // 'foo' should have timed out.
      expect(menu.registerEvent('qux')).toEqual(null);

      expect(menu.registerEvent('bar')).toEqual('barAction');
      expect(menu.registerEvent('bralt')).toEqual('braltAction');
      done();
    }, 150);
  });

  it('Two-level menu: callback is invokved', done => {
    const callbackInvokeRecords: string[][] = [];
    const callback =
        async (stateSequence: string[]) => {
      callbackInvokeRecords.push(stateSequence);
    };

    const menu = new TimedMenu(TWO_LEVEL_MENU_SPEC, 10, callback);
    menu.registerEvent('foo');

    setTimeout(() => {
      expect(callbackInvokeRecords.length).toBeGreaterThan(0);
      for (const record of callbackInvokeRecords) {
        expect(record).toEqual(['foo']);
      }
      done();
    }, 50);
  });

  it('Two-level menu: callback is invokved: before any events', done => {
    const callbackInvokeRecords: string[][] = [];
    const callback =
        async (stateSequence: string[]) => {
      callbackInvokeRecords.push(stateSequence);
    };

    new TimedMenu(TWO_LEVEL_MENU_SPEC, 10, callback);

    setTimeout(() => {
      expect(callbackInvokeRecords.length).toBeGreaterThan(0);
      for (const record of callbackInvokeRecords) {
        expect(record).toEqual([]);
      }
      done();
    }, 50);
  });
});