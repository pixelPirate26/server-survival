const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createDomFromHtml,
  createTimerController,
  flushAsyncWork,
  jsonResponse,
  loadWindowScript,
} = require("./helpers/frontend-test-utils");

function setupRunSyncDom() {
  const dom = createDomFromHtml("index.html", { url: "http://localhost/index.html" });
  const { window } = dom;
  createTimerController(window);
  window.SERVER_API_URL = "http://api.example.test/api";
  window.sessionStorage.setItem(
    "currentUser",
    JSON.stringify({
      username: "player1",
      role: "player",
    })
  );
  window.sessionStorage.setItem("authToken", "token-1");
  return dom;
}

test("queued submissions sync successfully and update player state", async () => {
  const dom = setupRunSyncDom();
  const { window } = dom;
  const calls = [];
  const successEvents = [];

  window.addEventListener("serverSurvival:runSyncSuccess", (event) => {
    successEvents.push(event.detail);
  });
  window.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith("/health")) {
      return jsonResponse({ status: "ok" });
    }
    if (url.endsWith("/runs/submit")) {
      return jsonResponse({
        user: {
          username: "player1",
          role: "player",
          lives: 2,
        },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  loadWindowScript(window, "src", "services", "RunSyncService.js");

  const enqueueResult = await window.runSyncService.enqueueRunSubmission({
    submissionId: "submission-1",
    sessionId: "session-1",
    payload: {
      sessionId: "session-1",
      submissionId: "submission-1",
    },
    localLifeDelta: 1,
  });
  await flushAsyncWork();

  assert.equal(enqueueResult.queued, true);
  assert.equal(enqueueResult.synced, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "http://api.example.test/api/health");
  assert.equal(calls[1].url, "http://api.example.test/api/runs/submit");
  assert.equal(successEvents.length, 1);
  assert.equal(successEvents[0].submissionId, "submission-1");
  assert.equal(await window.runSyncService.getPendingLifeDelta("player1"), 0);
  assert.equal(JSON.parse(window.sessionStorage.getItem("currentUser")).lives, 2);

  dom.window.close();
});

test("health checks gate submission attempts when the backend is unreachable", async () => {
  const dom = setupRunSyncDom();
  const { window } = dom;
  const calls = [];

  window.fetch = async (url) => {
    calls.push(url);
    if (url.endsWith("/health")) {
      throw new TypeError("Network down");
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  loadWindowScript(window, "src", "services", "RunSyncService.js");

  const enqueueResult = await window.runSyncService.enqueueRunSubmission({
    submissionId: "submission-2",
    sessionId: "session-2",
    payload: {
      sessionId: "session-2",
      submissionId: "submission-2",
    },
    localLifeDelta: 1,
  });
  await flushAsyncWork();

  assert.equal(enqueueResult.synced, false);
  assert.deepEqual(calls, ["http://api.example.test/api/health"]);
  assert.equal(await window.runSyncService.getPendingLifeDelta("player1"), 1);

  dom.window.close();
});

test("auth-paused submissions resume after notifyLogin is called", async () => {
  const dom = setupRunSyncDom();
  const { window } = dom;
  const calls = [];
  const pausedEvents = [];
  const successEvents = [];
  let submitAttempt = 0;

  window.addEventListener("serverSurvival:runSyncPaused", (event) => {
    pausedEvents.push(event.detail);
  });
  window.addEventListener("serverSurvival:runSyncSuccess", (event) => {
    successEvents.push(event.detail);
  });
  window.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith("/health")) {
      return jsonResponse({ status: "ok" });
    }
    if (url.endsWith("/runs/submit")) {
      submitAttempt += 1;
      if (submitAttempt === 1) {
        return jsonResponse({ message: "Unauthorized" }, { status: 401 });
      }
      return jsonResponse({
        user: {
          username: "player1",
          role: "player",
          lives: 1,
        },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  loadWindowScript(window, "src", "services", "RunSyncService.js");

  const firstAttempt = await window.runSyncService.enqueueRunSubmission({
    submissionId: "submission-3",
    sessionId: "session-3",
    payload: {
      sessionId: "session-3",
      submissionId: "submission-3",
    },
    localLifeDelta: 1,
  });
  await flushAsyncWork();

  assert.equal(firstAttempt.synced, false);
  assert.equal(pausedEvents.length, 1);
  assert.equal(successEvents.length, 0);

  window.sessionStorage.setItem("authToken", "token-2");
  await window.runSyncService.notifyLogin();
  await window.runSyncService.flushDueRuns("manual");
  await flushAsyncWork();

  assert.equal(successEvents.length, 1);
  assert.equal(successEvents[0].submissionId, "submission-3");
  assert.equal(await window.runSyncService.getPendingLifeDelta("player1"), 0);

  dom.window.close();
});
