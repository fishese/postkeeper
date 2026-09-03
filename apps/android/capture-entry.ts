import { captureRenderedPage } from '../extension/src/capture-page';
// Evaluated only by the native Save button, returning data through evaluateJavascript's callback.
// No privileged object is installed in the website's JavaScript environment.
(() => JSON.stringify(captureRenderedPage(document)))();
