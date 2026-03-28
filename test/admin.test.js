const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createDomFromHtml,
  createTimerController,
  flushAsyncWork,
  jsonResponse,
  loadWindowScript,
} = require("./helpers/frontend-test-utils");

function createAdminFetchStub(records, overrides = {}) {
  const players =
    overrides.players ||
    [
      {
        username: "player1",
        campus: "RR",
        branch: "CS",
        section: "A",
        locked: false,
        flagged: false,
        lives: 3,
        startingBudget: 500,
        bestScore: 100,
        bestSurvivalSeconds: 20,
        deviceBound: true,
      },
    ];

  return async (url, options = {}) => {
    records.push({
      url,
      options: {
        ...options,
        body: options.body,
      },
    });

    if (url.endsWith("/admin/players")) {
      return jsonResponse({ players });
    }

    if (url.endsWith("/admin/leaderboard")) {
      return jsonResponse({ leaderboard: [] });
    }

    if (url.includes("/admin/runs")) {
      return jsonResponse({ runs: [] });
    }

    if (url.endsWith("/admin/grades/preview")) {
      return jsonResponse({
        summary: {
          cohortSize: 1,
          eligibleRunCount: 1,
          rawTotalMax: 100,
          generatedAt: "2026-03-28T12:00:00.000Z",
        },
        rows: [
          {
            username: "player1",
            displayName: "Player One",
            locked: false,
            flagged: false,
            lives: 3,
            startingBudget: 500,
            validRunCount: 1,
            bestScore: 1500,
            bestSurvivalSeconds: 320,
            scoreThresholdPointsAwarded: 30,
            timeThresholdPointsAwarded: 25,
            validRunsPointsAwarded: 10,
            integrityPointsAwarded: 10,
            milestoneAwards: {
              survive_180s: 5,
              survive_480s: 0,
              score_1500: 15,
            },
            rawTotal: 95,
            rawRank: 1,
            scalePercentile: 100,
            scaleBandLabel: "Everyone Else",
            scaledTotal: 70,
          },
        ],
      });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };
}

function setAdminSession(window) {
  window.SERVER_API_URL = "http://api.example.test/api";
  window.sessionStorage.setItem("authToken", "admin-token");
  window.sessionStorage.setItem(
    "currentUser",
    JSON.stringify({
      username: "admin",
      role: "admin",
    })
  );
}

function loadAdminScripts(window) {
  loadWindowScript(window, "src", "admin-player-filters.js");
  loadWindowScript(window, "admin.js");
}

async function loadAdminDashboard({ players } = {}) {
  const dom = createDomFromHtml("admin.html", { url: "http://localhost/admin.html" });
  const { window } = dom;
  createTimerController(window);
  const fetchRecords = [];

  setAdminSession(window);
  window.fetch = createAdminFetchStub(fetchRecords, { players });
  loadAdminScripts(window);
  await flushAsyncWork();

  return {
    dom,
    window,
    fetchRecords,
    dashboard: window.adminDashboard,
  };
}

function getRenderedPlayerUsernames(window) {
  return Array.from(window.document.querySelectorAll("#player-table-body tr"))
    .map((row) => {
      const usernameCell = row.querySelectorAll("td")[1];
      return usernameCell ? usernameCell.textContent.trim() : "";
    })
    .filter(Boolean);
}

test("grading preview posts normalized payloads and exports fresh CSV data", async () => {
  const dom = createDomFromHtml("admin.html", { url: "http://localhost/admin.html" });
  const { window } = dom;
  createTimerController(window);
  const fetchRecords = [];
  let clickedDownload = null;
  let capturedBlob = null;

  setAdminSession(window);
  window.fetch = createAdminFetchStub(fetchRecords);
  window.URL.createObjectURL = (blob) => {
    capturedBlob = blob;
    return "blob:test";
  };
  window.URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function click() {
    clickedDownload = {
      href: this.href,
      download: this.download,
    };
  };

  loadAdminScripts(window);
  await flushAsyncWork();

  const dashboard = window.adminDashboard;
  const scoreInput = window.document.getElementById("grading-score-threshold-input");
  const integrityInput = window.document.getElementById("grading-integrity-points-input");

  scoreInput.value = "1500.9";
  scoreInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  integrityInput.value = "-5";
  integrityInput.dispatchEvent(new window.Event("input", { bubbles: true }));

  await dashboard.calculateGrades();
  await flushAsyncWork();

  const previewRequest = fetchRecords.find((record) =>
    record.url.endsWith("/admin/grades/preview")
  );
  assert.ok(previewRequest);
  assert.deepEqual(JSON.parse(previewRequest.options.body), {
    scoreThreshold: { minScore: 1500, points: 30 },
    timeThreshold: { minSeconds: 300, points: 25 },
    validRunsThreshold: { minRuns: 2, points: 10 },
    integrityPoints: 0,
    milestones: [
      { label: "Survive 180s", metric: "survivalSeconds", minValue: 180, points: 5 },
      { label: "Survive 480s", metric: "survivalSeconds", minValue: 480, points: 5 },
      { label: "Score 1500", metric: "score", minValue: 1500, points: 15 },
    ],
    scalingBands: [
      { label: "Top 10%", maxPercentile: 10, scaledTotal: 100 },
      { label: "Top 30%", maxPercentile: 30, scaledTotal: 90 },
      { label: "Top 60%", maxPercentile: 60, scaledTotal: 80 },
      { label: "Everyone Else", maxPercentile: 100, scaledTotal: 70 },
    ],
  });
  assert.equal(dashboard.gradingPreviewDirty, false);
  assert.equal(window.document.getElementById("grading-export-raw-btn").disabled, false);

  dashboard.exportGradesCsv("raw");
  assert.ok(clickedDownload);
  assert.match(clickedDownload.download, /^assignment-grades-raw-/);
  assert.ok(capturedBlob);
  assert.match(await capturedBlob.text(), /player1/);
  assert.match(await capturedBlob.text(), /rawTotal/);

  scoreInput.value = "1600";
  scoreInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  dashboard.exportGradesCsv("raw");

  assert.equal(dashboard.gradingPreviewDirty, true);
  assert.equal(window.document.getElementById("grading-export-raw-btn").disabled, true);
  assert.match(window.document.getElementById("admin-toast").textContent, /Calculate grades before exporting/);

  dom.window.close();
});

test("player filters combine campus, branch, section, and case-insensitive username search", async () => {
  const { dom, window } = await loadAdminDashboard({
    players: [
      {
        username: "alpha-cs-a",
        campus: "RR",
        branch: "CS",
        section: "A",
        locked: false,
        flagged: false,
        lives: 3,
        startingBudget: 500,
        bestScore: 10,
        bestSurvivalSeconds: 5,
        deviceBound: true,
      },
      {
        username: "beta-ai-c",
        campus: "RR",
        branch: "AI",
        section: "C",
        locked: false,
        flagged: false,
        lives: 3,
        startingBudget: 500,
        bestScore: 20,
        bestSurvivalSeconds: 10,
        deviceBound: true,
      },
      {
        username: "campus-ec-ai",
        campus: "EC",
        branch: "AI",
        section: "C",
        locked: false,
        flagged: false,
        lives: 3,
        startingBudget: 500,
        bestScore: 30,
        bestSurvivalSeconds: 15,
        deviceBound: false,
      },
      {
        username: "legacy-player",
        campus: null,
        branch: null,
        section: null,
        locked: true,
        flagged: false,
        lives: 3,
        startingBudget: 500,
        bestScore: 0,
        bestSurvivalSeconds: 0,
        deviceBound: false,
      },
    ],
  });

  const campusFilter = window.document.getElementById("player-campus-filter");
  const branchFilter = window.document.getElementById("player-branch-filter");
  const sectionFilter = window.document.getElementById("player-section-filter");
  const usernameFilter = window.document.getElementById("player-username-filter");
  const summary = window.document.getElementById("player-filter-summary");

  assert.deepEqual(getRenderedPlayerUsernames(window), [
    "alpha-cs-a",
    "beta-ai-c",
    "campus-ec-ai",
    "legacy-player",
  ]);

  campusFilter.value = "RR";
  campusFilter.dispatchEvent(new window.Event("change", { bubbles: true }));
  branchFilter.value = "AI";
  branchFilter.dispatchEvent(new window.Event("change", { bubbles: true }));
  sectionFilter.value = "C";
  sectionFilter.dispatchEvent(new window.Event("change", { bubbles: true }));
  usernameFilter.value = "BETA";
  usernameFilter.dispatchEvent(new window.Event("input", { bubbles: true }));

  assert.deepEqual(getRenderedPlayerUsernames(window), ["beta-ai-c"]);
  assert.match(summary.textContent, /Showing 1 of 4 players/);

  usernameFilter.value = "missing";
  usernameFilter.dispatchEvent(new window.Event("input", { bubbles: true }));

  assert.deepEqual(getRenderedPlayerUsernames(window), []);
  assert.match(window.document.getElementById("player-table-body").textContent, /No players found/i);

  dom.window.close();
});

test("player select-all only affects visible filtered rows and preserves hidden selections", async () => {
  const { dom, window, dashboard } = await loadAdminDashboard({
    players: [
      {
        username: "rr-player-a",
        campus: "RR",
        branch: "CS",
        section: "A",
        locked: false,
        flagged: false,
        lives: 3,
        startingBudget: 500,
        bestScore: 10,
        bestSurvivalSeconds: 5,
        deviceBound: true,
      },
      {
        username: "rr-player-b",
        campus: "RR",
        branch: "AI",
        section: "B",
        locked: false,
        flagged: false,
        lives: 3,
        startingBudget: 500,
        bestScore: 20,
        bestSurvivalSeconds: 10,
        deviceBound: true,
      },
      {
        username: "ec-player-c",
        campus: "EC",
        branch: "AI",
        section: "C",
        locked: false,
        flagged: false,
        lives: 3,
        startingBudget: 500,
        bestScore: 30,
        bestSurvivalSeconds: 15,
        deviceBound: false,
      },
    ],
  });

  dashboard.toggleSelection("rr-player-b", true);
  assert.deepEqual(Array.from(dashboard.selectedUsers).sort(), ["rr-player-b"]);

  const campusFilter = window.document.getElementById("player-campus-filter");
  const selectAll = window.document.getElementById("select-all");

  campusFilter.value = "EC";
  campusFilter.dispatchEvent(new window.Event("change", { bubbles: true }));

  assert.deepEqual(getRenderedPlayerUsernames(window), ["ec-player-c"]);

  selectAll.checked = true;
  dashboard.toggleSelectAll();
  assert.deepEqual(Array.from(dashboard.selectedUsers).sort(), ["ec-player-c", "rr-player-b"]);

  selectAll.checked = false;
  dashboard.toggleSelectAll();
  assert.deepEqual(Array.from(dashboard.selectedUsers).sort(), ["rr-player-b"]);

  dom.window.close();
});
