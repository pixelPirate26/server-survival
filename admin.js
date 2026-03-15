const API_BASE_URL = window.SERVER_API_URL

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
        this.selectedUsers = new Set();
        this.players = [];
        this.runs = [];
        this.runDetailRawVisible = false;
        this.activeTab = "players";
        this.bindAnnouncementComposer();
        this.bindBulkSettingsForm();
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

    async refreshData() {
        try {
            const [playersPayload, leaderboardPayload] = await Promise.all([
                this.apiRequest("/admin/players", { method: "GET" }),
                this.apiRequest("/admin/leaderboard", { method: "GET" }),
            ]);

            this.renderPlayers(playersPayload.players || []);
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

    renderPlayers(players) {
        this.players = players;
        const playerNames = new Set(players.map((player) => player.username));
        Array.from(this.selectedUsers).forEach((username) => {
            if (!playerNames.has(username)) {
                this.selectedUsers.delete(username);
            }
        });

        if (!players.length) {
            this.updateAnnouncementComposerState();
            this.updateBulkSettingsState();
            this.playerTableBody.innerHTML = `
                <tr>
                    <td colspan="9" class="p-4 text-center text-gray-500 italic">No players found.</td>
                </tr>
            `;
            return;
        }

        const allSelected = players.every((player) => this.selectedUsers.has(player.username));
        const selectAll = document.getElementById("select-all");
        if (selectAll) {
            selectAll.checked = allSelected;
            selectAll.indeterminate = !allSelected && this.selectedUsers.size > 0;
        }

        this.updateAnnouncementComposerState();
        this.updateBulkSettingsState();

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
            button.classList.toggle("bg-emerald-900/60", isActive && tabName === "runs");
            button.classList.toggle("text-emerald-100", isActive && tabName === "runs");
            if (!isActive) {
                button.classList.remove("bg-blue-900/60", "text-blue-100");
                button.classList.remove("bg-purple-900/60", "text-purple-100");
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
        this.renderPlayers(this.players);
    }

    toggleSelectAll() {
        const selectAll = document.getElementById("select-all");
        if (!selectAll) {
            return;
        }

        if (selectAll.checked) {
            this.players.forEach((player) => this.selectedUsers.add(player.username));
        } else {
            this.selectedUsers.clear();
        }

        this.renderPlayers(this.players);
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

const adminDashboard = new AdminDashboard();
