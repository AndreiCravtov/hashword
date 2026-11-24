/** Serialized by scripting.executeScript. Keep this function completely self-contained. */
export function passwordField(value?: string, expectedUrl?: string): { focused: boolean; filled: boolean; url: string } {
  let element = document.activeElement;
  while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
  const focused = element instanceof HTMLInputElement && element.type === 'password' && !element.disabled && !element.readOnly;
  let filled = false;
  if (focused && value !== undefined && location.href === expectedUrl) {
    // The native setter also works with controlled inputs in common UI frameworks.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
    element!.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    element!.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    filled = true;
  }
  return { focused, filled, url: location.href };
}
