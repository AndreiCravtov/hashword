import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { passwordField } from '../src/fill.ts';

// Execute the serialized function with no module scope, just as scripting.executeScript does.
// These cases enforce that generated secrets never go into an unrelated or stale field.
function fixture(type = 'password') {
  class Input {
    type = type;
    disabled = false;
    readOnly = false;
    stored = '';
    events: { type: string; bubbles: boolean; composed: boolean }[] = [];
    get value() { return this.stored; }
    set value(value: string) { this.stored = value; }
    dispatchEvent(event: { type: string; bubbles: boolean; composed: boolean }) { this.events.push(event); }
  }
  const input = new Input();
  const document: { activeElement: unknown } = { activeElement: input };
  const url = 'https://example.com/login';
  const execute = (value?: string, expectedUrl = url) => runInNewContext(`(${passwordField.toString()})(value, expectedUrl)`, {
    value, expectedUrl, document, location: { href: url }, HTMLInputElement: Input, Event,
  }) as ReturnType<typeof passwordField>;
  return { input, document, execute };
}

test('probing does not write; filling emits framework-compatible events', () => {
  const { input, execute } = fixture();
  assert.equal(execute().focused, true);
  assert.equal(input.value, '');
  assert.equal(execute('derived-test-password').filled, true);
  assert.equal(input.value, 'derived-test-password');
  assert.deepEqual(input.events.map(e => e.type), ['input', 'change']);
  assert.ok(input.events.every(e => e.bubbles && e.composed));
});
test('refuses non-password, disabled, readonly and unfocused fields', () => {
  for (const type of ['text', 'email', 'hidden']) {
    const { input, execute } = fixture(type);
    assert.equal(execute('secret').filled, false);
    assert.equal(input.value, '');
  }
  for (const flag of ['disabled', 'readOnly'] as const) {
    const { input, execute } = fixture(); input[flag] = true;
    assert.equal(execute('secret').filled, false);
    assert.equal(input.value, '');
  }
  const { input, execute, document } = fixture(); document.activeElement = null;
  assert.equal(execute('secret').filled, false);
  assert.equal(input.value, '');
});
test('navigation between probing and filling cannot write a password', () => {
  const { input, execute } = fixture();
  assert.equal(execute('secret', 'https://different.example/').filled, false);
  assert.equal(execute('secret', 'https://example.com/different-path').filled, false);
  assert.equal(input.value, '');
});
test('finds a focused input in nested open shadow roots', () => {
  const { input, execute, document } = fixture();
  document.activeElement = { shadowRoot: { activeElement: { shadowRoot: { activeElement: input } } } };
  assert.equal(execute('secret').filled, true);
  assert.equal(input.value, 'secret');
});
