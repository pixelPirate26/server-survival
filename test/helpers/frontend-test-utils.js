const fs = require("fs");
const path = require("path");
const crypto = require("node:crypto");

const { JSDOM } = require("jsdom");
const FDBFactory = require("fake-indexeddb/lib/FDBFactory");

const frontendDir = path.resolve(__dirname, "..", "..");

function readFrontendFile(...segments) {
  return fs.readFileSync(path.join(frontendDir, ...segments), "utf8");
}

function createDomFromHtml(htmlPath, options = {}) {
  const dom = new JSDOM(readFrontendFile(htmlPath), {
    url: options.url || `http://localhost/${path.basename(htmlPath)}`,
    pretendToBeVisual: true,
    runScripts: "outside-only",
  });
  const { window } = dom;

  window.console = console;
  window.crypto = crypto.webcrypto;
  window.Headers = Headers;
  window.Response = Response;
  window.Request = Request;
  window.FormData = FormData;
  window.Blob = Blob;
  window.indexedDB = new FDBFactory();

  return dom;
}

function loadWindowScript(window, ...segments) {
  window.eval(readFrontendFile(...segments));
}

function dispatchDomContentLoaded(window) {
  window.document.dispatchEvent(
    new window.Event("DOMContentLoaded", {
      bubbles: true,
      cancelable: true,
    })
  );
}

function createTimerController(window) {
  const queued = new Map();
  let nextId = 1;

  window.setTimeout = (callback, delay = 0) => {
    const id = nextId++;
    queued.set(id, { callback, delay });
    return id;
  };
  window.clearTimeout = (id) => {
    queued.delete(id);
  };
  window.setInterval = () => nextId++;
  window.clearInterval = () => {};

  async function runNext() {
    const nextEntry = Array.from(queued.entries()).sort((a, b) => a[1].delay - b[1].delay)[0];
    if (!nextEntry) {
      return false;
    }

    const [id, task] = nextEntry;
    queued.delete(id);
    await task.callback();
    return true;
  }

  return {
    count() {
      return queued.size;
    },
    async runAll() {
      while (await runNext()) {
        // Run until the queue is empty.
      }
    },
  };
}

function jsonResponse(payload, options = {}) {
  const body =
    payload === undefined || payload === null
      ? ""
      : typeof payload === "string"
        ? payload
        : JSON.stringify(payload);

  return new Response(body, {
    status: options.status || 200,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
}

async function flushAsyncWork() {
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

module.exports = {
  createDomFromHtml,
  createTimerController,
  dispatchDomContentLoaded,
  flushAsyncWork,
  jsonResponse,
  loadWindowScript,
};
