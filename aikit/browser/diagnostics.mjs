// An intentionally small error taxonomy. Raw Playwright errors (often containing
// customer text, selectors, URLs or file paths) must never be sent to GitHub.
export function classifyBrowserError(error) {
  const message=String(error?.message||error||'');
  if(/intercepts? pointer events|subtree intercepts pointer events|another element would receive (?:the )?(?:click|pointer)/i.test(message))return 'CLICK_INTERCEPTED';
  if(/element is not attached|not attached to the dom|element was detached|detached from dom/i.test(message))return 'STALE_TARGET';
  if(/element is outside of the viewport|outside (?:of )?viewport/i.test(message))return 'TARGET_OUTSIDE_VIEWPORT';
  if(/execution context was destroyed|frame was detached/i.test(message))return 'NAVIGATION_RACE';
  if(/timeout(?:error)?[: ]|timeout \d+ms exceeded|timed out after \d+ms/i.test(message))return 'ACTION_TIMEOUT';
  return 'BROWSER_OPERATION_FAILED';
}
