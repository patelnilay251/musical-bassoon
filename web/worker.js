// Worker entry: the render service, wired to postMessage.
import { createService } from './service.js';

const handle = createService((msg, transfer) => self.postMessage(msg, transfer));
self.onmessage = (e) => handle(e.data);
