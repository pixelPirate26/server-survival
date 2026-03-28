const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createDomFromHtml,
  createTimerController,
  dispatchDomContentLoaded,
  flushAsyncWork,
  jsonResponse,
  loadWindowScript,
} = require("./helpers/frontend-test-utils");

test("player login uses SSO device binding and persists session state", async () => {
  const dom = createDomFromHtml("login.html");
  const { window } = dom;
  const timers = createTimerController(window);
  const fetchCalls = [];
  let notified = 0;

  window.SERVER_API_URL = "http://api.example.test/api";
  window.fetch = async (url, options = {}) => {
    fetchCalls.push({ url, options });
    return jsonResponse({
      token: "player-token",
      user: {
        username: "player1",
        role: "player",
      },
    });
  };
  window.runSyncService = {
    async notifyLogin() {
      notified += 1;
    },
  };

  loadWindowScript(window, "login.js");
  dispatchDomContentLoaded(window);

  const usernameInput = window.document.getElementById("username");
  const passwordInput = window.document.getElementById("password");
  const form = window.document.getElementById("login-form");

  usernameInput.value = "player1";
  usernameInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(passwordInput.disabled, true);
  assert.equal(passwordInput.required, false);

  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await flushAsyncWork();

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, "http://api.example.test/api/auth/login");
  assert.equal(fetchCalls[0].options.headers["x-device-id"], window.localStorage.getItem("ss_device_id"));
  assert.deepEqual(JSON.parse(fetchCalls[0].options.body), {
    username: "player1",
    password: "",
  });
  assert.equal(window.sessionStorage.getItem("authToken"), "player-token");
  assert.deepEqual(JSON.parse(window.sessionStorage.getItem("currentUser")), {
    username: "player1",
    role: "player",
  });
  assert.equal(notified, 1);
  assert.match(window.document.getElementById("login-btn").textContent, /Access Granted/i);
  assert.equal(timers.count(), 1);

  dom.window.close();
});

test("admin login enables password entry and posts the provided password", async () => {
  const dom = createDomFromHtml("login.html");
  const { window } = dom;
  const timers = createTimerController(window);
  const fetchCalls = [];

  window.SERVER_API_URL = "http://api.example.test/api";
  window.fetch = async (url, options = {}) => {
    fetchCalls.push({ url, options });
    return jsonResponse({
      token: "admin-token",
      user: {
        username: "admin",
        role: "admin",
      },
    });
  };
  window.runSyncService = null;

  loadWindowScript(window, "login.js");
  dispatchDomContentLoaded(window);

  const usernameInput = window.document.getElementById("username");
  const passwordInput = window.document.getElementById("password");
  const form = window.document.getElementById("login-form");

  usernameInput.value = "admin";
  usernameInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(passwordInput.disabled, false);
  assert.equal(passwordInput.required, true);

  passwordInput.value = "adminpassword";
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await flushAsyncWork();

  assert.equal(fetchCalls.length, 1);
  assert.deepEqual(JSON.parse(fetchCalls[0].options.body), {
    username: "admin",
    password: "adminpassword",
  });
  assert.equal(window.sessionStorage.getItem("authToken"), "admin-token");
  assert.equal(timers.count(), 1);

  dom.window.close();
});

test("failed login shows an inline error and restores the loading button state", async () => {
  const dom = createDomFromHtml("login.html");
  const { window } = dom;
  createTimerController(window);

  window.SERVER_API_URL = "http://api.example.test/api";
  window.fetch = async () =>
    jsonResponse(
      {
        message: "Invalid username or password",
      },
      { status: 401 }
    );

  loadWindowScript(window, "login.js");
  dispatchDomContentLoaded(window);

  const usernameInput = window.document.getElementById("username");
  const form = window.document.getElementById("login-form");
  const errorContainer = window.document.getElementById("error-msg");
  const loginButton = window.document.getElementById("login-btn");

  usernameInput.value = "admin";
  usernameInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await flushAsyncWork();

  assert.equal(errorContainer.classList.contains("hidden"), false);
  assert.match(errorContainer.textContent, /Invalid username or password/);
  assert.match(loginButton.textContent, /Initialize Connection/);

  dom.window.close();
});
