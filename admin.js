const API_BASE_URL = window.SERVER_API_URL
const PLAYER_FILTER_CONFIG = window.ADMIN_PLAYER_FILTERS;
const DEFAULT_GRADING_CONFIG = Object.freeze({
    scoreThreshold: {
        minScore: 1000,
        points: 30,
    },
    timeThreshold: {
        minSeconds: 300,
        points: 25,
    },
    validRunsThreshold: {
        minRuns: 2,
        points: 10,
    },
    integrityPoints: 10,
    milestones: [
        {
            label: "Survive 180s",
            metric: "survivalSeconds",
            minValue: 180,
            points: 5,
        },
        {
            label: "Survive 480s",
            metric: "survivalSeconds",
            minValue: 480,
            points: 5,
        },
        {
            label: "Score 1500",
            metric: "score",
            minValue: 1500,
            points: 15,
        },
    ],
    scalingBands: [
        {
            label: "Top 10%",
            maxPercentile: 10,
            scaledTotal: 100,
        },
        {
            label: "Top 30%",
            maxPercentile: 30,
            scaledTotal: 90,
        },
        {
            label: "Top 60%",
            maxPercentile: 60,
            scaledTotal: 80,
        },
        {
            label: "Everyone Else",
            maxPercentile: 100,
            scaledTotal: 70,
        },
    ],
});
function cloneValue(value) {
    return JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
    return String(value || "").trim();
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function slugifyLabel(label) {
    const slug = normalizeText(label)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    return slug || "milestone";
}

function createUniqueSlug(label, seenSlugs) {
    const base = slugifyLabel(label);
    let candidate = base;
    let suffix = 2;

    while (seenSlugs.has(candidate)) {
        candidate = `${base}_${suffix}`;
        suffix += 1;
    }

    seenSlugs.add(candidate);
    return candidate;
}

function buildMilestoneDefinitions(milestones = []) {
    const seenSlugs = new Set();
    return milestones.map((milestone) => ({
        ...milestone,
        id: createUniqueSlug(milestone.label, seenSlugs),
    }));
}

function toNonNegativeInteger(value, fallback = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return fallback;
    }
    return Math.floor(parsed);
}

function csvEscape(value) {
    const text = value === null || value === undefined ? "" : String(value);
    if (!/[",\n\r]/.test(text)) {
        return text;
    }
    return `"${text.replace(/"/g, '""')}"`;
}

function buildCsvContent(headers, rows) {
    const headerRow = headers.map((header) => csvEscape(header.label)).join(",");
    const dataRows = rows.map((row) =>
        headers.map((header) => csvEscape(row[header.key])).join(",")
    );
    return [headerRow, ...dataRows].join("\r\n");
}

function downloadCsvFile(filename, content) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

function formatFilenameTimestamp(value) {
    const date = new Date(value || Date.now());
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function buildSelectOptionsMarkup(config = {}) {
    const allLabel = String(config.allLabel || "All");
    const options = Array.isArray(config.options) ? config.options : [];

    return [
        `<option value="">${escapeHtml(allLabel)}</option>`,
        ...options.map((option) => {
            const value = String(option || "");
            return `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`;
        }),
    ].join("");
}

class AdminDashboard {
    constructor() {
        this.playerTableBody = document.getElementById("player-table-body");
        this.leaderboardTableBody = document.getElementById("leaderboard-table-body");
        this.runsTableBody = document.getElementById("runs-table-body");
        this.runDetailModal = document.getElementById("run-detail-modal");
        this.runDetailSummary = document.getElementById("run-detail-summary");
        this.runDetailSetup = document.getElementById("run-detail-setup");
        this.runDetailFailures = document.getElementById("run-detail-failures");
        this.runDetailTimelineBody = document.getElementById("run-detail-timeline-body");
        this.runDetailTimelineMeta = document.getElementById("run-detail-timeline-meta");
        this.runDetailRaw = document.getElementById("run-detail-raw");
        this.runDetailToggle = document.getElementById("run-detail-toggle");
        this.toastEl = document.getElementById("admin-toast");
        this.announcementMessageInput = document.getElementById("announcement-message");
        this.announcementCharCount = document.getElementById("announcement-char-count");
        this.announcementRecipientSummary = document.getElementById("announcement-recipient-summary");
        this.announcementSelectionCount = document.getElementById("announcement-selection-count");
        this.sendSelectedBtn = document.getElementById("send-selected-btn");
        this.sendAllBtn = document.getElementById("send-all-btn");
        this.bulkLivesInput = document.getElementById("bulk-lives-input");
        this.bulkBudgetInput = document.getElementById("bulk-budget-input");
        this.bulkSettingsSummary = document.getElementById("bulk-settings-summary");
        this.bulkSettingsSelectionCount = document.getElementById("bulk-settings-selection-count");
        this.bulkSettingsApplyBtn = document.getElementById("bulk-settings-apply-btn");
        this.playerCampusFilter = document.getElementById("player-campus-filter");
        this.playerBranchFilter = document.getElementById("player-branch-filter");
        this.playerSectionFilter = document.getElementById("player-section-filter");
        this.playerUsernameFilter = document.getElementById("player-username-filter");
        this.playerFilterSummary = document.getElementById("player-filter-summary");
        this.playerFiltersResetBtn = document.getElementById("player-filters-reset-btn");
        this.gradingScoreThresholdInput = document.getElementById("grading-score-threshold-input");
        this.gradingScorePointsInput = document.getElementById("grading-score-points-input");
        this.gradingTimeThresholdInput = document.getElementById("grading-time-threshold-input");
        this.gradingTimePointsInput = document.getElementById("grading-time-points-input");
        this.gradingValidRunsThresholdInput = document.getElementById("grading-valid-runs-threshold-input");
        this.gradingValidRunsPointsInput = document.getElementById("grading-valid-runs-points-input");
        this.gradingIntegrityPointsInput = document.getElementById("grading-integrity-points-input");
        this.gradingMilestonesBody = document.getElementById("grading-milestones-body");
        this.gradingScalingBody = document.getElementById("grading-scaling-body");
        this.gradingCalculateBtn = document.getElementById("grading-calculate-btn");
        this.gradingExportRawBtn = document.getElementById("grading-export-raw-btn");
        this.gradingExportScaledBtn = document.getElementById("grading-export-scaled-btn");
        this.gradingSummary = document.getElementById("grading-summary");
        this.gradingPreviewHeadRow = document.getElementById("grading-preview-head-row");
        this.gradingPreviewBody = document.getElementById("grading-preview-body");
        this.selectedUsers = new Set();
        this.players = [];
        this.filteredPlayers = [];
        this.playerFilters = {
            campus: "",
            branch: "",
            section: "",
            username: "",
        };
        this.runs = [];
        this.runDetailRawVisible = false;
        this.gradingConfig = cloneValue(DEFAULT_GRADING_CONFIG);
        this.gradingPreview = null;
        this.gradingPreviewConfig = null;
        this.gradingPreviewDirty = true;
        this.gradingBusy = false;
        this.activeTab = "players";
        this.initializePlayerFilters();
        this.bindPlayerFilters();
        this.bindAnnouncementComposer();
        this.bindBulkSettingsForm();
        this.bindGradingForm();
        this.renderGradingConfig();
        this.updateGradingSummary();
        this.updateGradingButtons();
        this.refreshData();
        this.refreshRuns();
        this.runsRefreshTimer = setInterval(() => {
            void this.refreshRuns();
        }, 10000);
        this.showTab(this.activeTab);
    }

    get authToken() {
        return sessionStorage.getItem("authToken");
    }

    async apiRequest(path, options = {}) {
        const headers = {
            ...(options.headers || {}),
            Authorization: `Bearer ${this.authToken}`,
        };

        if (!(options.body instanceof FormData)) {
            headers["Content-Type"] = headers["Content-Type"] || "application/json";
        }

        const response = await fetch(`${API_BASE_URL}${path}`, {
            ...options,
            headers,
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            const message = payload.message || "Request failed";
            const error = new Error(message);
            error.status = response.status;
            throw error;
        }

        return payload;
    }

    showToast(message, type = "success") {
        this.toastEl.textContent = message;
        this.toastEl.className = `fixed bottom-4 right-4 px-6 py-3 rounded shadow-lg transform transition-transform duration-300 z-50 ${
            type === "error" ? "bg-red-600" : "bg-green-600"
        } text-white`;
        this.toastEl.style.transform = "translateY(0)";

        setTimeout(() => {
            this.toastEl.style.transform = "translateY(6rem)";
        }, 2500);
    }

    bindAnnouncementComposer() {
        if (!this.announcementMessageInput) {
            return;
        }

        this.announcementMessageInput.addEventListener("input", () => {
            this.updateAnnouncementComposerState();
        });

        this.updateAnnouncementComposerState();
    }

    updateAnnouncementComposerState() {
        const text = String(this.announcementMessageInput?.value || "");
        const selectedCount = this.selectedUsers.size;
        const maxLength = Number(this.announcementMessageInput?.maxLength || 280);

        if (this.announcementCharCount) {
            this.announcementCharCount.textContent = `${text.length} / ${maxLength}`;
            this.announcementCharCount.className = `text-xs font-mono ${
                text.length > maxLength * 0.9 ? "text-yellow-400" : "text-gray-500"
            }`;
        }

        if (this.announcementSelectionCount) {
            this.announcementSelectionCount.textContent = `${selectedCount} selected`;
        }

        if (this.announcementRecipientSummary) {
            if (selectedCount === 0) {
                this.announcementRecipientSummary.textContent =
                    "Send to all players, or select one or more players below.";
            } else if (selectedCount === 1) {
                const [username] = Array.from(this.selectedUsers);
                this.announcementRecipientSummary.textContent = `Selected audience: ${username}.`;
            } else {
                this.announcementRecipientSummary.textContent = `Selected audience: ${selectedCount} players.`;
            }
        }

        if (this.sendSelectedBtn) {
            this.sendSelectedBtn.disabled = selectedCount === 0;
            this.sendSelectedBtn.classList.toggle("opacity-40", selectedCount === 0);
            this.sendSelectedBtn.classList.toggle("cursor-not-allowed", selectedCount === 0);
        }
    }

    setAnnouncementComposerBusy(isBusy) {
        [this.sendSelectedBtn, this.sendAllBtn, this.announcementMessageInput].forEach((element) => {
            if (!element) {
                return;
            }
            element.disabled = isBusy || (element === this.sendSelectedBtn && this.selectedUsers.size === 0);
        });
    }

    getAnnouncementMessage() {
        return String(this.announcementMessageInput?.value || "").trim();
    }

    clearAnnouncementComposer() {
        if (this.announcementMessageInput) {
            this.announcementMessageInput.value = "";
        }
        this.updateAnnouncementComposerState();
    }

    bindBulkSettingsForm() {
        [this.bulkLivesInput, this.bulkBudgetInput].forEach((input) => {
            if (!input) {
                return;
            }

            input.addEventListener("input", () => {
                this.updateBulkSettingsState();
            });
        });

        this.updateBulkSettingsState();
    }

    updateBulkSettingsState() {
        const selectedCount = this.selectedUsers.size;
        const hasLivesValue = String(this.bulkLivesInput?.value || "").trim() !== "";
        const hasBudgetValue = String(this.bulkBudgetInput?.value || "").trim() !== "";
        const hasAnyValue = hasLivesValue || hasBudgetValue;

        if (this.bulkSettingsSelectionCount) {
            this.bulkSettingsSelectionCount.textContent = `${selectedCount} selected`;
        }

        if (this.bulkSettingsSummary) {
            if (selectedCount === 0) {
                this.bulkSettingsSummary.textContent =
                    "Select one or more players, then set lives and/or starting budget.";
            } else if (!hasAnyValue) {
                this.bulkSettingsSummary.textContent =
                    "Leave a field blank to skip it, or enter both values to overwrite both.";
            } else if (selectedCount === 1) {
                const [username] = Array.from(this.selectedUsers);
                this.bulkSettingsSummary.textContent = `Ready to update ${username}.`;
            } else {
                this.bulkSettingsSummary.textContent = `Ready to update ${selectedCount} selected players.`;
            }
        }

        if (this.bulkSettingsApplyBtn) {
            const disabled = selectedCount === 0 || !hasAnyValue;
            this.bulkSettingsApplyBtn.disabled = disabled;
            this.bulkSettingsApplyBtn.classList.toggle("opacity-40", disabled);
            this.bulkSettingsApplyBtn.classList.toggle("cursor-not-allowed", disabled);
        }
    }

    setBulkSettingsBusy(isBusy) {
        [this.bulkLivesInput, this.bulkBudgetInput, this.bulkSettingsApplyBtn].forEach((element) => {
            if (!element) {
                return;
            }
            element.disabled = isBusy;
        });
    }

    clearBulkSettingsInputs() {
        if (this.bulkLivesInput) {
            this.bulkLivesInput.value = "";
        }
        if (this.bulkBudgetInput) {
            this.bulkBudgetInput.value = "";
        }
        this.updateBulkSettingsState();
    }

    bindGradingForm() {
        const bindings = [
            [this.gradingScoreThresholdInput, "scoreThreshold", "minScore"],
            [this.gradingScorePointsInput, "scoreThreshold", "points"],
            [this.gradingTimeThresholdInput, "timeThreshold", "minSeconds"],
            [this.gradingTimePointsInput, "timeThreshold", "points"],
            [this.gradingValidRunsThresholdInput, "validRunsThreshold", "minRuns"],
            [this.gradingValidRunsPointsInput, "validRunsThreshold", "points"],
        ];

        bindings.forEach(([input, section, field]) => {
            if (!input) {
                return;
            }
            input.addEventListener("input", () => {
                this.gradingConfig[section][field] = toNonNegativeInteger(input.value, 0);
                this.markGradingConfigDirty();
            });
        });

        if (this.gradingIntegrityPointsInput) {
            this.gradingIntegrityPointsInput.addEventListener("input", () => {
                this.gradingConfig.integrityPoints = toNonNegativeInteger(
                    this.gradingIntegrityPointsInput.value,
                    0
                );
                this.markGradingConfigDirty();
            });
        }
    }

    setGradingButtonState(button, enabled, enabledClasses = []) {
        if (!button) {
            return;
        }

        button.disabled = !enabled;
        button.classList.toggle("opacity-40", !enabled);
        button.classList.toggle("cursor-not-allowed", !enabled);

        const disabledClasses = ["bg-slate-800", "border-slate-600", "text-slate-300"];
        disabledClasses.forEach((className) => {
            button.classList.toggle(className, !enabled);
        });
        enabledClasses.forEach((className) => {
            button.classList.toggle(className, enabled);
        });
    }

    setGradingBusy(isBusy) {
        this.gradingBusy = isBusy === true;
        if (this.gradingCalculateBtn) {
            this.gradingCalculateBtn.disabled = this.gradingBusy;
            this.gradingCalculateBtn.classList.toggle("opacity-40", this.gradingBusy);
            this.gradingCalculateBtn.classList.toggle("cursor-not-allowed", this.gradingBusy);
        }
        this.updateGradingButtons();
    }

    updateGradingButtons() {
        const canExport =
            Boolean(this.gradingPreview) && this.gradingPreviewDirty !== true && !this.gradingBusy;

        this.setGradingButtonState(this.gradingExportRawBtn, canExport, [
            "bg-blue-900/60",
            "hover:bg-blue-700",
            "border-blue-500/30",
            "text-blue-100",
        ]);
        this.setGradingButtonState(this.gradingExportScaledBtn, canExport, [
            "bg-emerald-900/60",
            "hover:bg-emerald-700",
            "border-emerald-500/30",
            "text-emerald-100",
        ]);
    }

    updateGradingSummary() {
        if (!this.gradingSummary) {
            return;
        }

        if (!this.gradingPreview) {
            this.gradingSummary.textContent =
                "Adjust the config above, then calculate a grading preview.";
            return;
        }

        const summary = this.gradingPreview.summary || {};
        const generatedAt = summary.generatedAt
            ? new Date(summary.generatedAt).toLocaleString()
            : "unknown";
        const staleMessage =
            this.gradingPreviewDirty === true
                ? " Configuration changed since this preview. Recalculate before exporting."
                : "";

        this.gradingSummary.textContent =
            `${Number(summary.cohortSize || 0)} players | ` +
            `${Number(summary.eligibleRunCount || 0)} survival runs | ` +
            `raw max ${Number(summary.rawTotalMax || 0)} | ` +
            `generated ${generatedAt}.` +
            staleMessage;
    }

    markGradingConfigDirty() {
        this.gradingPreviewDirty = true;
        this.updateGradingButtons();
        this.updateGradingSummary();
    }

    renderGradingConfig() {
        if (this.gradingScoreThresholdInput) {
            this.gradingScoreThresholdInput.value = this.gradingConfig.scoreThreshold.minScore;
        }
        if (this.gradingScorePointsInput) {
            this.gradingScorePointsInput.value = this.gradingConfig.scoreThreshold.points;
        }
        if (this.gradingTimeThresholdInput) {
            this.gradingTimeThresholdInput.value = this.gradingConfig.timeThreshold.minSeconds;
        }
        if (this.gradingTimePointsInput) {
            this.gradingTimePointsInput.value = this.gradingConfig.timeThreshold.points;
        }
        if (this.gradingValidRunsThresholdInput) {
            this.gradingValidRunsThresholdInput.value = this.gradingConfig.validRunsThreshold.minRuns;
        }
        if (this.gradingValidRunsPointsInput) {
            this.gradingValidRunsPointsInput.value = this.gradingConfig.validRunsThreshold.points;
        }
        if (this.gradingIntegrityPointsInput) {
            this.gradingIntegrityPointsInput.value = this.gradingConfig.integrityPoints;
        }

        this.renderMilestoneRows();
        this.renderScalingBandRows();
    }

    renderMilestoneRows() {
        if (!this.gradingMilestonesBody) {
            return;
        }

        const milestones = Array.isArray(this.gradingConfig.milestones)
            ? this.gradingConfig.milestones
            : [];

        if (!milestones.length) {
            this.gradingMilestonesBody.innerHTML = `
                <tr>
                    <td colspan="5" class="p-4 text-center text-gray-500 italic">No milestones configured.</td>
                </tr>
            `;
            return;
        }

        this.gradingMilestonesBody.innerHTML = milestones
            .map(
                (milestone, index) => `
                    <tr class="border-b border-gray-800">
                        <td class="p-2">
                            <input
                                type="text"
                                value="${escapeHtml(milestone.label || "")}"
                                oninput="adminDashboard.updateMilestoneField(${index}, 'label', this.value)"
                                class="w-full rounded-lg border border-gray-700 bg-gray-950/70 px-3 py-2 text-sm text-gray-200 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                            />
                        </td>
                        <td class="p-2">
                            <select
                                onchange="adminDashboard.updateMilestoneField(${index}, 'metric', this.value)"
                                class="w-full rounded-lg border border-gray-700 bg-gray-950/70 px-3 py-2 text-sm text-gray-200 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                            >
                                <option value="survivalSeconds" ${milestone.metric === "survivalSeconds" ? "selected" : ""}>time</option>
                                <option value="score" ${milestone.metric === "score" ? "selected" : ""}>score</option>
                            </select>
                        </td>
                        <td class="p-2">
                            <input
                                type="number"
                                min="0"
                                inputmode="numeric"
                                value="${Number(milestone.minValue || 0)}"
                                oninput="adminDashboard.updateMilestoneField(${index}, 'minValue', this.value)"
                                class="w-full rounded-lg border border-gray-700 bg-gray-950/70 px-3 py-2 text-right text-sm text-gray-200 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                            />
                        </td>
                        <td class="p-2">
                            <input
                                type="number"
                                min="0"
                                inputmode="numeric"
                                value="${Number(milestone.points || 0)}"
                                oninput="adminDashboard.updateMilestoneField(${index}, 'points', this.value)"
                                class="w-full rounded-lg border border-gray-700 bg-gray-950/70 px-3 py-2 text-right text-sm text-gray-200 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                            />
                        </td>
                        <td class="p-2 text-right">
                            <button
                                onclick="adminDashboard.removeMilestoneRow(${index})"
                                class="bg-red-900/60 hover:bg-red-700 text-red-100 px-3 py-2 rounded border border-red-500/30 transition text-xs"
                            >
                                Remove
                            </button>
                        </td>
                    </tr>
                `
            )
            .join("");
    }

    renderScalingBandRows() {
        if (!this.gradingScalingBody) {
            return;
        }

        const scalingBands = Array.isArray(this.gradingConfig.scalingBands)
            ? this.gradingConfig.scalingBands
            : [];

        if (!scalingBands.length) {
            this.gradingScalingBody.innerHTML = `
                <tr>
                    <td colspan="4" class="p-4 text-center text-gray-500 italic">No scaling bands configured.</td>
                </tr>
            `;
            return;
        }

        this.gradingScalingBody.innerHTML = scalingBands
            .map(
                (band, index) => `
                    <tr class="border-b border-gray-800">
                        <td class="p-2">
                            <input
                                type="text"
                                value="${escapeHtml(band.label || "")}"
                                oninput="adminDashboard.updateScalingBandField(${index}, 'label', this.value)"
                                class="w-full rounded-lg border border-gray-700 bg-gray-950/70 px-3 py-2 text-sm text-gray-200 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                            />
                        </td>
                        <td class="p-2">
                            <input
                                type="number"
                                min="0"
                                max="100"
                                inputmode="numeric"
                                value="${Number(band.maxPercentile || 0)}"
                                oninput="adminDashboard.updateScalingBandField(${index}, 'maxPercentile', this.value)"
                                class="w-full rounded-lg border border-gray-700 bg-gray-950/70 px-3 py-2 text-right text-sm text-gray-200 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                            />
                        </td>
                        <td class="p-2">
                            <input
                                type="number"
                                min="0"
                                inputmode="numeric"
                                value="${Number(band.scaledTotal || 0)}"
                                oninput="adminDashboard.updateScalingBandField(${index}, 'scaledTotal', this.value)"
                                class="w-full rounded-lg border border-gray-700 bg-gray-950/70 px-3 py-2 text-right text-sm text-gray-200 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                            />
                        </td>
                        <td class="p-2 text-right">
                            <button
                                onclick="adminDashboard.removeScalingBandRow(${index})"
                                class="bg-red-900/60 hover:bg-red-700 text-red-100 px-3 py-2 rounded border border-red-500/30 transition text-xs"
                            >
                                Remove
                            </button>
                        </td>
                    </tr>
                `
            )
            .join("");
    }

    updateMilestoneField(index, field, value) {
        const milestone = this.gradingConfig.milestones?.[index];
        if (!milestone) {
            return;
        }

        if (field === "label" || field === "metric") {
            milestone[field] = value;
        } else {
            milestone[field] = toNonNegativeInteger(value, 0);
        }

        this.markGradingConfigDirty();
    }

    addMilestoneRow() {
        this.gradingConfig.milestones.push({
            label: `Milestone ${this.gradingConfig.milestones.length + 1}`,
            metric: "survivalSeconds",
            minValue: 0,
            points: 0,
        });
        this.renderMilestoneRows();
        this.markGradingConfigDirty();
    }

    removeMilestoneRow(index) {
        if (!Array.isArray(this.gradingConfig.milestones)) {
            return;
        }
        this.gradingConfig.milestones.splice(index, 1);
        this.renderMilestoneRows();
        this.markGradingConfigDirty();
    }

    updateScalingBandField(index, field, value) {
        const band = this.gradingConfig.scalingBands?.[index];
        if (!band) {
            return;
        }

        if (field === "label") {
            band.label = value;
        } else {
            band[field] = toNonNegativeInteger(value, 0);
        }

        this.markGradingConfigDirty();
    }

    addScalingBandRow() {
        this.gradingConfig.scalingBands.push({
            label: `Band ${this.gradingConfig.scalingBands.length + 1}`,
            maxPercentile: 100,
            scaledTotal: 0,
        });
        this.renderScalingBandRows();
        this.markGradingConfigDirty();
    }

    removeScalingBandRow(index) {
        if (!Array.isArray(this.gradingConfig.scalingBands)) {
            return;
        }
        this.gradingConfig.scalingBands.splice(index, 1);
        this.renderScalingBandRows();
        this.markGradingConfigDirty();
    }

    buildGradingConfigPayload() {
        return {
            scoreThreshold: {
                minScore: toNonNegativeInteger(this.gradingConfig.scoreThreshold.minScore, 0),
                points: toNonNegativeInteger(this.gradingConfig.scoreThreshold.points, 0),
            },
            timeThreshold: {
                minSeconds: toNonNegativeInteger(this.gradingConfig.timeThreshold.minSeconds, 0),
                points: toNonNegativeInteger(this.gradingConfig.timeThreshold.points, 0),
            },
            validRunsThreshold: {
                minRuns: toNonNegativeInteger(this.gradingConfig.validRunsThreshold.minRuns, 0),
                points: toNonNegativeInteger(this.gradingConfig.validRunsThreshold.points, 0),
            },
            integrityPoints: toNonNegativeInteger(this.gradingConfig.integrityPoints, 0),
            milestones: (this.gradingConfig.milestones || []).map((milestone) => ({
                label: normalizeText(milestone.label),
                metric: milestone.metric === "score" ? "score" : "survivalSeconds",
                minValue: toNonNegativeInteger(milestone.minValue, 0),
                points: toNonNegativeInteger(milestone.points, 0),
            })),
            scalingBands: (this.gradingConfig.scalingBands || []).map((band) => ({
                label: normalizeText(band.label),
                maxPercentile: toNonNegativeInteger(band.maxPercentile, 0),
                scaledTotal: toNonNegativeInteger(band.scaledTotal, 0),
            })),
        };
    }

    async calculateGrades() {
        const payload = this.buildGradingConfigPayload();
        this.setGradingBusy(true);

        try {
            const preview = await this.apiRequest("/admin/grades/preview", {
                method: "POST",
                body: JSON.stringify(payload),
            });

            this.gradingPreview = preview;
            this.gradingPreviewConfig = cloneValue(payload);
            this.gradingPreviewDirty = false;
            this.renderGradingPreview();
            this.updateGradingSummary();
            this.updateGradingButtons();
            this.showToast(
                `Calculated grades for ${Number(preview?.summary?.cohortSize || 0)} players`
            );
        } catch (error) {
            this.showToast(error.message || "Failed to calculate grades", "error");
        } finally {
            this.setGradingBusy(false);
        }
    }

    renderGradingPreview() {
        if (!this.gradingPreviewHeadRow || !this.gradingPreviewBody) {
            return;
        }

        const rows = Array.isArray(this.gradingPreview?.rows) ? this.gradingPreview.rows : [];
        const milestoneDefinitions = buildMilestoneDefinitions(
            this.gradingPreviewConfig?.milestones || []
        );
        const headerCells = [
            "Rank",
            "Player",
            "Name",
            "Flagged",
            "Best Score",
            "Best Time (s)",
            "Runs",
            "Score Pts",
            "Time Pts",
            "Run Pts",
            "Integrity",
            ...milestoneDefinitions.map((milestone) => milestone.label),
            "Raw Total",
            "Scaled Total",
        ];

        this.gradingPreviewHeadRow.innerHTML = headerCells
            .map((label) => `<th class="p-3">${escapeHtml(label)}</th>`)
            .join("");

        if (!rows.length) {
            this.gradingPreviewBody.innerHTML = `
                <tr>
                    <td colspan="${headerCells.length}" class="p-4 text-center text-gray-500 italic">No grading rows available.</td>
                </tr>
            `;
            return;
        }

        this.gradingPreviewBody.innerHTML = rows
            .map((row) => {
                const milestoneCells = milestoneDefinitions
                    .map(
                        (milestone) => `
                            <td class="p-3 text-right">${Number(
                                row?.milestoneAwards?.[milestone.id] || 0
                            )}</td>
                        `
                    )
                    .join("");

                return `
                    <tr class="border-b border-gray-800">
                        <td class="p-3">${Number(row.rawRank || 0)}</td>
                        <td class="p-3 font-semibold text-white">${escapeHtml(row.username || "")}</td>
                        <td class="p-3">${escapeHtml(row.displayName || "-")}</td>
                        <td class="p-3">${row.flagged ? "Yes" : "No"}</td>
                        <td class="p-3 text-right text-yellow-300">${Number(row.bestScore || 0)}</td>
                        <td class="p-3 text-right">${Number(row.bestSurvivalSeconds || 0)}</td>
                        <td class="p-3 text-right">${Number(row.validRunCount || 0)}</td>
                        <td class="p-3 text-right">${Number(row.scoreThresholdPointsAwarded || 0)}</td>
                        <td class="p-3 text-right">${Number(row.timeThresholdPointsAwarded || 0)}</td>
                        <td class="p-3 text-right">${Number(row.validRunsPointsAwarded || 0)}</td>
                        <td class="p-3 text-right">${Number(row.integrityPointsAwarded || 0)}</td>
                        ${milestoneCells}
                        <td class="p-3 text-right text-cyan-200">${Number(row.rawTotal || 0)}</td>
                        <td class="p-3 text-right text-emerald-200">${Number(row.scaledTotal || 0)}</td>
                    </tr>
                `;
            })
            .join("");
    }

    buildGradingCsvHeaders(mode = "raw") {
        const milestoneDefinitions = buildMilestoneDefinitions(
            this.gradingPreviewConfig?.milestones || []
        );
        const headers = [
            { key: "username", label: "username" },
            { key: "displayName", label: "displayName" },
            { key: "locked", label: "locked" },
            { key: "flagged", label: "flagged" },
            { key: "lives", label: "lives" },
            { key: "startingBudget", label: "startingBudget" },
            { key: "validRunCount", label: "validRunCount" },
            { key: "bestScore", label: "bestScore" },
            { key: "bestSurvivalSeconds", label: "bestSurvivalSeconds" },
            {
                key: "scoreThresholdPointsAwarded",
                label: "scoreThresholdPointsAwarded",
            },
            {
                key: "timeThresholdPointsAwarded",
                label: "timeThresholdPointsAwarded",
            },
            {
                key: "validRunsPointsAwarded",
                label: "validRunsPointsAwarded",
            },
            {
                key: "integrityPointsAwarded",
                label: "integrityPointsAwarded",
            },
            ...milestoneDefinitions.map((milestone) => ({
                key: `milestone_${milestone.id}`,
                label: `milestone_${milestone.id}`,
            })),
            { key: "rawTotal", label: "rawTotal" },
            { key: "rawRank", label: "rawRank" },
        ];

        if (mode === "scaled") {
            headers.push(
                { key: "scalePercentile", label: "scalePercentile" },
                { key: "scaleBandLabel", label: "scaleBandLabel" },
                { key: "scaledTotal", label: "scaledTotal" }
            );
        }

        return headers;
    }

    buildGradingCsvRows(mode = "raw") {
        const rows = Array.isArray(this.gradingPreview?.rows) ? this.gradingPreview.rows : [];
        const milestoneDefinitions = buildMilestoneDefinitions(
            this.gradingPreviewConfig?.milestones || []
        );

        return rows.map((row) => {
            const csvRow = {
                username: row.username || "",
                displayName: row.displayName || "",
                locked: row.locked ? "true" : "false",
                flagged: row.flagged ? "true" : "false",
                lives: Number(row.lives || 0),
                startingBudget: Number(row.startingBudget || 0),
                validRunCount: Number(row.validRunCount || 0),
                bestScore: Number(row.bestScore || 0),
                bestSurvivalSeconds: Number(row.bestSurvivalSeconds || 0),
                scoreThresholdPointsAwarded: Number(row.scoreThresholdPointsAwarded || 0),
                timeThresholdPointsAwarded: Number(row.timeThresholdPointsAwarded || 0),
                validRunsPointsAwarded: Number(row.validRunsPointsAwarded || 0),
                integrityPointsAwarded: Number(row.integrityPointsAwarded || 0),
                rawTotal: Number(row.rawTotal || 0),
                rawRank: Number(row.rawRank || 0),
            };

            milestoneDefinitions.forEach((milestone) => {
                csvRow[`milestone_${milestone.id}`] = Number(
                    row?.milestoneAwards?.[milestone.id] || 0
                );
            });

            if (mode === "scaled") {
                csvRow.scalePercentile = Number(row.scalePercentile || 0);
                csvRow.scaleBandLabel = row.scaleBandLabel || "";
                csvRow.scaledTotal = Number(row.scaledTotal || 0);
            }

            return csvRow;
        });
    }

    exportGradesCsv(mode = "raw") {
        if (!this.gradingPreview || this.gradingPreviewDirty) {
            this.showToast("Calculate grades before exporting", "error");
            return;
        }

        const headers = this.buildGradingCsvHeaders(mode);
        const rows = this.buildGradingCsvRows(mode);
        const csvContent = buildCsvContent(headers, rows);
        const timestamp = formatFilenameTimestamp(this.gradingPreview?.summary?.generatedAt);
        const filename =
            mode === "scaled"
                ? `assignment-grades-scaled-${timestamp}.csv`
                : `assignment-grades-raw-${timestamp}.csv`;

        downloadCsvFile(filename, csvContent);
        this.showToast(mode === "scaled" ? "Scaled CSV exported" : "Raw CSV exported");
    }

    async refreshData() {
        try {
            const [playersPayload, leaderboardPayload] = await Promise.all([
                this.apiRequest("/admin/players", { method: "GET" }),
                this.apiRequest("/admin/leaderboard", { method: "GET" }),
            ]);

            this.setPlayers(playersPayload.players || []);
            this.renderLeaderboard(leaderboardPayload.leaderboard || []);
            this.updateAnnouncementComposerState();
            this.updateBulkSettingsState();
        } catch (error) {
            if (error.status === 401 || error.status === 403) {
                this.logout();
                return;
            }

            this.showToast(error.message || "Failed to load data", "error");
        }
    }

    async refreshRuns() {
        if (!this.runsTableBody) {
            return;
        }

        try {
            const payload = await this.apiRequest("/admin/runs?limit=50", { method: "GET" });
            this.runs = payload.runs || [];
            this.renderRuns(this.runs);
        } catch (error) {
            this.runsTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="p-4 text-center text-red-400">${error.message}</td>
                </tr>
            `;
        }
    }

    renderPlayers() {
        const players = this.getFilteredPlayers();
        this.filteredPlayers = players;

        const selectAll = document.getElementById("select-all");
        if (selectAll) {
            const allSelected =
                players.length > 0 && players.every((player) => this.selectedUsers.has(player.username));
            const someVisibleSelected = players.some((player) =>
                this.selectedUsers.has(player.username)
            );
            selectAll.checked = allSelected;
            selectAll.indeterminate = !allSelected && someVisibleSelected;
        }

        this.updatePlayerFilterState();
        this.updateAnnouncementComposerState();
        this.updateBulkSettingsState();

        if (!players.length) {
            this.playerTableBody.innerHTML = `
                <tr>
                    <td colspan="9" class="p-4 text-center text-gray-500 italic">No players found.</td>
                </tr>
            `;
            return;
        }

        this.playerTableBody.innerHTML = players
            .map((player) => {
                const inputId = `budget-${player.username}`;
                const isSelected = this.selectedUsers.has(player.username);
                const isLocked = player.locked === true;
                const deviceBound = player.deviceBound === true;
                const isFlagged = player.flagged === true;
                return `
                    <tr class="border-b border-gray-800 hover:bg-gray-800/40 transition">
                        <td class="p-3">
                            <input
                                type="checkbox"
                                class="accent-cyan-400"
                                ${isSelected ? "checked" : ""}
                                onchange="adminDashboard.toggleSelection('${player.username}', this.checked)"
                            />
                        </td>
                        <td class="p-3 font-bold text-white">${player.username}</td>
                        <td class="p-3">
                            <span class="px-2 py-1 rounded text-xs font-semibold ${
                                isLocked ? "bg-red-900/60 text-red-200" : "bg-green-900/60 text-green-200"
                            }">
                                ${isLocked ? "Locked" : "Active"}
                            </span>
                        </td>
                        <td class="p-3">
                            <span class="px-2 py-1 rounded text-xs font-semibold ${
                                deviceBound ? "bg-cyan-900/60 text-cyan-200" : "bg-gray-800 text-gray-300"
                            }">
                                ${deviceBound ? "Bound" : "None"}
                            </span>
                        </td>
                        <td class="p-3">
                            <span class="px-2 py-1 rounded text-xs font-semibold ${
                                isFlagged ? "bg-red-900/60 text-red-200" : "bg-gray-800 text-gray-300"
                            }" title="${isFlagged ? (player.flagReason || "Flagged") : ""}">
                                ${isFlagged ? "Flagged" : "Clear"}
                            </span>
                        </td>
                        <td class="p-3 text-right">${player.lives}</td>
                        <td class="p-3 text-right">
                            <input
                                id="${inputId}"
                                type="number"
                                min="0"
                                value="${player.startingBudget}"
                                class="w-28 px-2 py-1 text-right bg-gray-900/70 border border-gray-700 rounded"
                            />
                        </td>
                        <td class="p-3 text-right text-yellow-300">${player.bestScore}</td>
                        <td class="p-3 text-right">
                            <div class="flex justify-end gap-2">
                                <button
                                    onclick="adminDashboard.addLife('${player.username}')"
                                    class="bg-green-700 hover:bg-green-600 text-white text-xs px-3 py-1.5 rounded border border-green-500/40"
                                >
                                    +1 Life
                                </button>
                                <button
                                    onclick="adminDashboard.updateBudget('${player.username}', '${inputId}')"
                                    class="bg-blue-700 hover:bg-blue-600 text-white text-xs px-3 py-1.5 rounded border border-blue-500/40"
                                >
                                    Save Budget
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            })
            .join("");
    }

    setPlayers(players) {
        this.players = Array.isArray(players) ? players : [];
        const playerNames = new Set(this.players.map((player) => player.username));
        Array.from(this.selectedUsers).forEach((username) => {
            if (!playerNames.has(username)) {
                this.selectedUsers.delete(username);
            }
        });
        this.renderPlayers();
    }

    readPlayerFilters() {
        return {
            campus: normalizeText(this.playerCampusFilter?.value).toUpperCase(),
            branch: normalizeText(this.playerBranchFilter?.value).toUpperCase(),
            section: normalizeText(this.playerSectionFilter?.value).toUpperCase(),
            username: normalizeText(this.playerUsernameFilter?.value).toLowerCase(),
        };
    }

    getFilteredPlayers() {
        this.playerFilters = this.readPlayerFilters();
        return this.players.filter((player) => {
            const campus = normalizeText(player.campus).toUpperCase();
            const branch = normalizeText(player.branch).toUpperCase();
            const section = normalizeText(player.section).toUpperCase();
            const username = normalizeText(player.username).toLowerCase();

            if (this.playerFilters.campus && campus !== this.playerFilters.campus) {
                return false;
            }

            if (this.playerFilters.branch && branch !== this.playerFilters.branch) {
                return false;
            }

            if (this.playerFilters.section && section !== this.playerFilters.section) {
                return false;
            }

            if (this.playerFilters.username && !username.includes(this.playerFilters.username)) {
                return false;
            }

            return true;
        });
    }

    initializePlayerFilters() {
        [
            [this.playerCampusFilter, PLAYER_FILTER_CONFIG?.campus],
            [this.playerBranchFilter, PLAYER_FILTER_CONFIG?.branch],
            [this.playerSectionFilter, PLAYER_FILTER_CONFIG?.section],
        ].forEach(([element, config]) => {
            if (!element || !config) {
                return;
            }

            element.innerHTML = buildSelectOptionsMarkup(config);
        });

        if (this.playerUsernameFilter && PLAYER_FILTER_CONFIG?.username?.placeholder) {
            this.playerUsernameFilter.placeholder = PLAYER_FILTER_CONFIG.username.placeholder;
        }
    }

    bindPlayerFilters() {
        [
            [this.playerCampusFilter, "change"],
            [this.playerBranchFilter, "change"],
            [this.playerSectionFilter, "change"],
            [this.playerUsernameFilter, "input"],
        ].forEach(([element, eventName]) => {
            if (!element) {
                return;
            }

            element.addEventListener(eventName, () => {
                this.renderPlayers();
            });
        });

        this.updatePlayerFilterState();
    }

    updatePlayerFilterState() {
        this.playerFilters = this.readPlayerFilters();
        const hasActiveFilters = Object.values(this.playerFilters).some((value) => value !== "");
        const filteredCount = this.filteredPlayers.length;
        const totalCount = this.players.length;

        if (this.playerFilterSummary) {
            this.playerFilterSummary.textContent = hasActiveFilters
                ? `Showing ${filteredCount} of ${totalCount} players.`
                : `Showing all ${totalCount} players.`;
        }

        if (this.playerFiltersResetBtn) {
            this.playerFiltersResetBtn.disabled = !hasActiveFilters;
            this.playerFiltersResetBtn.classList.toggle("opacity-40", !hasActiveFilters);
            this.playerFiltersResetBtn.classList.toggle("cursor-not-allowed", !hasActiveFilters);
        }
    }

    clearPlayerFilters() {
        if (this.playerCampusFilter) {
            this.playerCampusFilter.value = "";
        }
        if (this.playerBranchFilter) {
            this.playerBranchFilter.value = "";
        }
        if (this.playerSectionFilter) {
            this.playerSectionFilter.value = "";
        }
        if (this.playerUsernameFilter) {
            this.playerUsernameFilter.value = "";
        }
        this.renderPlayers();
    }

    renderLeaderboard(rows) {
        if (!rows.length) {
            this.leaderboardTableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="p-4 text-center text-gray-500 italic">No scores submitted yet.</td>
                </tr>
            `;
            return;
        }

        this.leaderboardTableBody.innerHTML = rows
            .map(
                (row) => `
                    <tr class="border-b border-gray-800">
                        <td class="p-3">${row.rank}</td>
                        <td class="p-3 font-semibold text-white">${row.username}</td>
                        <td class="p-3 text-right text-yellow-300">${row.bestScore}</td>
                        <td class="p-3 text-right">${row.bestSurvivalSeconds}</td>
                    </tr>
                `
            )
            .join("");
    }

    renderRuns(runs) {
        if (!this.runsTableBody) {
            return;
        }

        if (!runs.length) {
            this.runsTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="p-4 text-center text-gray-500 italic">No runs found.</td>
                </tr>
            `;
            return;
        }

        this.runsTableBody.innerHTML = runs
            .map((run) => {
                const when = new Date(run.createdAt || Date.now()).toLocaleString();
                return `
                    <tr class="border-b border-gray-800">
                        <td class="p-3">${when}</td>
                        <td class="p-3">${run.username}</td>
                        <td class="p-3 text-right text-yellow-300">${run.score}</td>
                        <td class="p-3 text-right">${run.survivalSeconds}</td>
                        <td class="p-3 text-right">${run.eventsCount ?? 0}</td>
                        <td class="p-3 text-right">
                            <button
                                onclick="adminDashboard.viewRunDetail('${run.id}')"
                                class="bg-emerald-700 hover:bg-emerald-600 text-white text-xs px-3 py-1.5 rounded border border-emerald-500/40"
                            >
                                View
                            </button>
                        </td>
                    </tr>
                `;
            })
            .join("");
    }

    async viewRunDetail(runId) {
        if (!runId || !this.runDetailModal) {
            return;
        }

        try {
            const payload = await this.apiRequest(`/admin/runs/${encodeURIComponent(runId)}`, {
                method: "GET",
            });
            this.runDetailRawVisible = false;
            const run = payload.run || {};
            const setup = run.setup || {};
            const services = Array.isArray(setup.services) ? setup.services : [];
            const timeline = Array.isArray(run.timeline) ? run.timeline : [];
            const runSummary = run.summary || {};

            const serviceCounts = {};
            const tierCounts = {};

            services.forEach((svc) => {
                const type = svc.type || "unknown";
                serviceCounts[type] = (serviceCounts[type] || 0) + 1;

                if (svc.tier !== null && svc.tier !== undefined) {
                    const tierKey = `tier_${svc.tier}`;
                    tierCounts[tierKey] = (tierCounts[tierKey] || 0) + 1;
                }
            });

            const summary = {
                id: run.id,
                user: run.username,
                score: run.score,
                claimedScore: run.claimedScore,
                survivalSeconds: run.survivalSeconds,
                mode: run.mode,
                reason: run.reason,
                eventsCount: run.eventsCount,
                requestsProcessed: Number(runSummary.requestsProcessed || 0),
                timelineBucketSeconds: Number(run.timelineBucketSeconds || 1),
                upkeepEnabled: setup.upkeepEnabled !== false,
                autoRepairEnabled: setup.autoRepairEnabled === true,
                servicesTotal: services.length,
                serviceCounts,
                tierCounts,
                failures: run.failures || {},
                scoreBreakdown: run.scoreBreakdown || runSummary.scoreBreakdown || {},
                timelineBuckets: timeline.length,
            };

            this.renderRunSummary(summary);
            this.renderRunSetup(summary, setup);
            this.renderRunFailures(summary.failures);
            this.renderTimeline(timeline, summary.timelineBucketSeconds);
            this.renderRawRun({ summary, timeline, run, recomputed: payload.recomputed });
            this.runDetailModal.classList.remove("hidden");
        } catch (error) {
            this.showToast(error.message || "Failed to load run detail", "error");
        }
    }

    closeRunDetail() {
        if (this.runDetailModal) {
            this.runDetailModal.classList.add("hidden");
        }
    }

    showTab(tabName) {
        this.activeTab = tabName;
        const panels = {
            players: document.getElementById("players-panel"),
            leaderboard: document.getElementById("leaderboard-panel"),
            grading: document.getElementById("grading-panel"),
            runs: document.getElementById("runs-panel"),
        };

        Object.entries(panels).forEach(([key, panel]) => {
            if (!panel) return;
            panel.classList.toggle("hidden", key !== tabName);
        });

        document.querySelectorAll("[data-tab]").forEach((button) => {
            const isActive = button.getAttribute("data-tab") === tabName;
            button.classList.toggle("bg-blue-900/60", isActive && tabName === "players");
            button.classList.toggle("text-blue-100", isActive && tabName === "players");
            button.classList.toggle("bg-purple-900/60", isActive && tabName === "leaderboard");
            button.classList.toggle("text-purple-100", isActive && tabName === "leaderboard");
            button.classList.toggle("bg-cyan-900/60", isActive && tabName === "grading");
            button.classList.toggle("text-cyan-100", isActive && tabName === "grading");
            button.classList.toggle("bg-emerald-900/60", isActive && tabName === "runs");
            button.classList.toggle("text-emerald-100", isActive && tabName === "runs");
            if (!isActive) {
                button.classList.remove("bg-blue-900/60", "text-blue-100");
                button.classList.remove("bg-purple-900/60", "text-purple-100");
                button.classList.remove("bg-cyan-900/60", "text-cyan-100");
                button.classList.remove("bg-emerald-900/60", "text-emerald-100");
            }
        });
    }

    toggleRunRaw() {
        this.runDetailRawVisible = !this.runDetailRawVisible;
        if (this.runDetailRaw) {
            this.runDetailRaw.classList.toggle("hidden", !this.runDetailRawVisible);
        }
        if (this.runDetailToggle) {
            this.runDetailToggle.textContent = this.runDetailRawVisible
                ? "Hide Raw JSON"
                : "Show Raw JSON";
        }
    }

    renderRunSummary(summary) {
        if (!this.runDetailSummary) return;
        const rows = [
            ["Player", summary.user],
            ["Score", summary.score],
            ["Claimed", summary.claimedScore ?? "n/a"],
            ["Time (s)", summary.survivalSeconds],
            ["Mode", summary.mode],
            ["Reason", summary.reason],
            ["Events", summary.eventsCount],
            ["Requests", summary.requestsProcessed || 0],
            ["Buckets", summary.timelineBuckets],
            ["Bucket (s)", summary.timelineBucketSeconds || 1],
            ["Upkeep", summary.upkeepEnabled ? "On" : "Off"],
            ["Auto-Repair", summary.autoRepairEnabled ? "On" : "Off"],
        ];

        this.runDetailSummary.innerHTML = rows
            .map(
                ([label, value]) => `
                <div class="bg-gray-900/70 border border-gray-700 rounded-lg p-3">
                    <div class="text-[10px] text-gray-500 uppercase font-mono mb-1">${label}</div>
                    <div class="text-sm text-gray-200 font-mono">${value}</div>
                </div>
            `
            )
            .join("");
    }

    renderRunSetup(summary, setup) {
        if (!this.runDetailSetup) return;
        const services = summary.serviceCounts || {};
        const tiers = summary.tierCounts || {};
        const serviceList = Object.entries(services)
            .map(([type, count]) => `${type}: ${count}`)
            .join(" | ");
        const tierList = Object.entries(tiers)
            .map(([tier, count]) => `${tier.replace("tier_", "Tier ")}: ${count}`)
            .join(" | ");

        this.runDetailSetup.innerHTML = `
            <div class="mb-2">Services: ${serviceList || "None"}</div>
            <div class="mb-2">Tiers: ${tierList || "None"}</div>
            <div>Money: ${Math.round(setup.money ?? 0)} | Reputation: ${Math.round(
            setup.reputation ?? 0
        )}</div>
        `;
    }

    renderRunFailures(failures) {
        if (!this.runDetailFailures) return;
        const entries = Object.entries(failures || {});
        if (!entries.length) {
            this.runDetailFailures.textContent = "No failure data.";
            return;
        }
        this.runDetailFailures.innerHTML = entries
            .map(([key, value]) => `${key}: ${value}`)
            .join(" | ");
    }

    renderTimeline(timeline, timelineBucketSeconds = 1) {
        if (!this.runDetailTimelineBody) return;
        if (!Array.isArray(timeline) || !timeline.length) {
            this.runDetailTimelineBody.innerHTML = `
                <tr>
                    <td colspan="6" class="py-4 text-center text-gray-500">No timeline data.</td>
                </tr>
            `;
            if (this.runDetailTimelineMeta) {
                this.runDetailTimelineMeta.textContent = "";
            }
            return;
        }

        const maxRows = 120;
        const step = Math.max(1, Math.ceil(timeline.length / maxRows));
        const sampled = timeline.filter((_, idx) => idx % step === 0);
        if (this.runDetailTimelineMeta) {
            this.runDetailTimelineMeta.textContent = `Showing ${sampled.length} of ${timeline.length} buckets (step ${step}, ${Number(timelineBucketSeconds || 1)}s each)`;
        }

        this.runDetailTimelineBody.innerHTML = sampled
            .map((point) => {
                const score = point.score || {};
                const failures = point.failures || {};
                const failureTotal = Object.values(failures).reduce(
                    (sum, value) => sum + Number(value || 0),
                    0
                );
                return `
                    <tr class="border-b border-gray-800">
                        <td class="py-1 text-left">${point.t}</td>
                        <td class="py-1 text-right text-yellow-300">${Math.round(
                            score.total || 0
                        )}</td>
                        <td class="py-1 text-right">${Math.round(score.storage || 0)}</td>
                        <td class="py-1 text-right">${Math.round(score.database || 0)}</td>
                        <td class="py-1 text-right">${Math.round(
                            score.maliciousBlocked || 0
                        )}</td>
                        <td class="py-1 text-right">${failureTotal}</td>
                    </tr>
                `;
            })
            .join("");
    }

    renderRawRun(payload) {
        if (!this.runDetailRaw) return;
        this.runDetailRaw.textContent = JSON.stringify(payload, null, 2);
        this.runDetailRaw.classList.toggle("hidden", !this.runDetailRawVisible);
        if (this.runDetailToggle) {
            this.runDetailToggle.textContent = this.runDetailRawVisible
                ? "Hide Raw JSON"
                : "Show Raw JSON";
        }
    }

    async addLife(username) {
        try {
            await this.apiRequest(`/admin/players/${encodeURIComponent(username)}/lives`, {
                method: "PATCH",
                body: JSON.stringify({ delta: 1 }),
            });

            this.showToast(`Added 1 life to ${username}`);
            await this.refreshData();
        } catch (error) {
            this.showToast(error.message || "Failed to add life", "error");
        }
    }

    async updateBudget(username, inputId) {
        const input = document.getElementById(inputId);
        const value = Number(input?.value);

        if (!Number.isFinite(value) || value < 0) {
            this.showToast("Budget must be a non-negative number", "error");
            return;
        }

        try {
            await this.apiRequest(`/admin/players/${encodeURIComponent(username)}/starting-budget`, {
                method: "PATCH",
                body: JSON.stringify({ startingBudget: value }),
            });

            this.showToast(`Updated ${username} starting budget`);
            await this.refreshData();
        } catch (error) {
            this.showToast(error.message || "Failed to update budget", "error");
        }
    }

    logout() {
        sessionStorage.removeItem("authToken");
        sessionStorage.removeItem("currentUser");
        window.location.href = "login.html";
    }

    toggleSelection(username, checked) {
        if (checked) {
            this.selectedUsers.add(username);
        } else {
            this.selectedUsers.delete(username);
        }
        this.renderPlayers();
    }

    toggleSelectAll() {
        const selectAll = document.getElementById("select-all");
        if (!selectAll) {
            return;
        }

        if (selectAll.checked) {
            this.filteredPlayers.forEach((player) => this.selectedUsers.add(player.username));
        } else {
            this.filteredPlayers.forEach((player) => this.selectedUsers.delete(player.username));
        }

        this.renderPlayers();
    }

    async sendAnnouncement(scope) {
        const message = this.getAnnouncementMessage();
        if (!message) {
            this.showToast("Enter an announcement message", "error");
            return;
        }

        const isSelectedScope = scope === "selected";
        const usernames = isSelectedScope ? Array.from(this.selectedUsers) : [];
        if (isSelectedScope && !usernames.length) {
            this.showToast("Select at least one player first", "error");
            return;
        }

        this.setAnnouncementComposerBusy(true);

        try {
            const body = { message };
            if (isSelectedScope) {
                body.usernames = usernames;
            }

            const payload = await this.apiRequest("/admin/messages", {
                method: "POST",
                body: JSON.stringify(body),
            });

            const recipientCount = Number(payload?.recipients?.count || 0);
            this.clearAnnouncementComposer();
            this.showToast(
                isSelectedScope
                    ? `Announcement sent to ${recipientCount} selected player${recipientCount === 1 ? "" : "s"}`
                    : `Announcement broadcast to ${recipientCount} player${recipientCount === 1 ? "" : "s"}`
            );
        } catch (error) {
            this.showToast(error.message || "Failed to send announcement", "error");
        } finally {
            this.setAnnouncementComposerBusy(false);
            this.updateAnnouncementComposerState();
        }
    }

    async bulkUpdateSelectedPlayers() {
        if (!this.selectedUsers.size) {
            this.showToast("Select at least one player", "error");
            return;
        }

        const livesValue = String(this.bulkLivesInput?.value || "").trim();
        const budgetValue = String(this.bulkBudgetInput?.value || "").trim();
        if (!livesValue && !budgetValue) {
            this.showToast("Enter lives and/or starting budget", "error");
            return;
        }

        const body = {
            usernames: Array.from(this.selectedUsers),
        };

        if (livesValue) {
            const lives = Number(livesValue);
            if (!Number.isFinite(lives) || lives < 0) {
                this.showToast("Lives must be a non-negative number", "error");
                return;
            }
            body.lives = lives;
        }

        if (budgetValue) {
            const startingBudget = Number(budgetValue);
            if (!Number.isFinite(startingBudget) || startingBudget < 0) {
                this.showToast("Starting budget must be a non-negative number", "error");
                return;
            }
            body.startingBudget = startingBudget;
        }

        this.setBulkSettingsBusy(true);

        try {
            const payload = await this.apiRequest("/admin/players/bulk-settings", {
                method: "PATCH",
                body: JSON.stringify(body),
            });

            const updatedCount = Array.isArray(payload?.updated) ? payload.updated.length : this.selectedUsers.size;
            this.clearBulkSettingsInputs();
            this.showToast(
                `Updated ${updatedCount} selected player${updatedCount === 1 ? "" : "s"}`
            );
            await this.refreshData();
        } catch (error) {
            this.showToast(error.message || "Failed to update selected players", "error");
        } finally {
            this.setBulkSettingsBusy(false);
            this.updateBulkSettingsState();
        }
    }

    async lockSelected(locked) {
        if (!this.selectedUsers.size) {
            this.showToast("Select at least one player", "error");
            return;
        }

        try {
            await this.apiRequest("/admin/players/lock", {
                method: "PATCH",
                body: JSON.stringify({
                    usernames: Array.from(this.selectedUsers),
                    locked,
                }),
            });

            this.showToast(locked ? "Players locked" : "Players unlocked");
            this.selectedUsers.clear();
            await this.refreshData();
        } catch (error) {
            this.showToast(error.message || "Failed to update access", "error");
        }
    }

    async resetDeviceSelected() {
        if (!this.selectedUsers.size) {
            this.showToast("Select at least one player", "error");
            return;
        }

        try {
            await this.apiRequest("/admin/players/reset-device", {
                method: "PATCH",
                body: JSON.stringify({
                    usernames: Array.from(this.selectedUsers),
                }),
            });

            this.showToast("SSO devices reset");
            this.selectedUsers.clear();
            await this.refreshData();
        } catch (error) {
            this.showToast(error.message || "Failed to reset devices", "error");
        }
    }

    async unflagSelected() {
        if (!this.selectedUsers.size) {
            this.showToast("Select at least one player", "error");
            return;
        }

        try {
            await this.apiRequest("/admin/players/unflag", {
                method: "PATCH",
                body: JSON.stringify({
                    usernames: Array.from(this.selectedUsers),
                }),
            });

            this.showToast("Players unflagged");
            this.selectedUsers.clear();
            await this.refreshData();
        } catch (error) {
            this.showToast(error.message || "Failed to unflag players", "error");
        }
    }
}

window.AdminDashboard = AdminDashboard;
window.adminDashboard = new AdminDashboard();
