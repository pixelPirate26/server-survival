(function initializeRunSyncService(global) {
    const DB_NAME = "server-survival-sync";
    const STORE_NAME = "run-submissions";
    const DB_VERSION = 1;
    const REQUEST_TIMEOUT_MS = 15000;
    const RETRY_DELAYS_MS = [30000, 120000, 300000, 600000, 900000];
    const EVENT_PREFIX = "serverSurvival:";

    function emitEvent(name, detail) {
        global.dispatchEvent(new CustomEvent(`${EVENT_PREFIX}${name}`, { detail }));
    }

    function getCurrentUser() {
        try {
            return JSON.parse(sessionStorage.getItem("currentUser") || "{}");
        } catch (error) {
            return {};
        }
    }

    function getAuthToken() {
        return sessionStorage.getItem("authToken");
    }

    function createDeferred() {
        let resolve;
        let reject;
        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });
        return { promise, resolve, reject };
    }

    function requestToPromise(request) {
        const deferred = createDeferred();
        request.onsuccess = () => deferred.resolve(request.result);
        request.onerror = () => deferred.reject(request.error || new Error("IndexedDB request failed"));
        return deferred.promise;
    }

    function isTransientStatus(status) {
        return status === 408 || status === 429 || status >= 500;
    }

    function buildDelay(attemptCount) {
        const index = Math.min(Math.max(0, attemptCount - 1), RETRY_DELAYS_MS.length - 1);
        const baseDelay = RETRY_DELAYS_MS[index];
        const jitter = Math.floor(baseDelay * (Math.random() * 0.2));
        return baseDelay + jitter;
    }

    function createRunSyncService(apiBaseUrl) {
        let dbPromise = null;
        let flushPromise = null;
        let flushTimer = null;
        let lifecycleBound = false;

        function openDb() {
            if (dbPromise) {
                return dbPromise;
            }

            dbPromise = new Promise((resolve, reject) => {
                if (!global.indexedDB) {
                    reject(new Error("IndexedDB is not available"));
                    return;
                }

                const request = global.indexedDB.open(DB_NAME, DB_VERSION);

                request.onupgradeneeded = () => {
                    const db = request.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        const store = db.createObjectStore(STORE_NAME, {
                            keyPath: "submissionId",
                        });
                        store.createIndex("username", "username", { unique: false });
                        store.createIndex("nextAttemptAt", "nextAttemptAt", { unique: false });
                    }
                };

                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB"));
            });

            return dbPromise;
        }

        async function withStore(mode, handler) {
            const db = await openDb();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, mode);
                const store = transaction.objectStore(STORE_NAME);
                let settled = false;
                let handlerResult;

                const settle = (fn, value) => {
                    if (!settled) {
                        settled = true;
                        fn(value);
                    }
                };

                transaction.oncomplete = () => settle(resolve, handlerResult);
                transaction.onerror = () =>
                    settle(reject, transaction.error || new Error("IndexedDB transaction failed"));
                transaction.onabort = () =>
                    settle(reject, transaction.error || new Error("IndexedDB transaction aborted"));

                Promise.resolve()
                    .then(() => handler(store))
                    .then((result) => {
                        handlerResult = result;
                    })
                    .catch((error) => {
                        try {
                            transaction.abort();
                        } catch (abortError) {
                            // Ignore abort failures and surface the original error.
                        }
                        settle(reject, error);
                    });
            });
        }

        async function getItem(submissionId) {
            return withStore("readonly", (store) =>
                requestToPromise(store.get(submissionId))
            );
        }

        async function putItem(item) {
            return withStore("readwrite", (store) =>
                requestToPromise(store.put(item))
            );
        }

        async function deleteItem(submissionId) {
            return withStore("readwrite", (store) =>
                requestToPromise(store.delete(submissionId))
            );
        }

        async function listItems() {
            return withStore("readonly", (store) =>
                requestToPromise(store.getAll())
            );
        }

        async function countPendingForUser(username) {
            if (!username) {
                return 0;
            }
            const items = await listItems();
            return items.filter((item) => item.username === username).length;
        }

        async function getPendingLifeDelta(username) {
            if (!username) {
                return 0;
            }
            const items = await listItems();
            return items
                .filter((item) => item.username === username)
                .reduce((total, item) => total + Number(item.localLifeDelta || 0), 0);
        }

        async function emitQueueCount(username) {
            emitEvent("runSyncQueueChanged", {
                username,
                pendingCount: await countPendingForUser(username),
                pendingLifeDelta: await getPendingLifeDelta(username),
            });
        }

        async function apiRequest(path, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
            const controller = new AbortController();
            const timer = global.setTimeout(() => controller.abort(), timeoutMs);

            try {
                const response = await global.fetch(`${apiBaseUrl}${path}`, {
                    ...options,
                    signal: controller.signal,
                });
                const payload = await response.json().catch(() => ({}));

                if (!response.ok) {
                    const error = new Error(payload.message || "Request failed");
                    error.status = response.status;
                    error.payload = payload;
                    throw error;
                }

                return payload;
            } catch (error) {
                if (error.name === "AbortError") {
                    const timeoutError = new Error("Request timed out");
                    timeoutError.code = "ETIMEDOUT";
                    throw timeoutError;
                }
                throw error;
            } finally {
                global.clearTimeout(timer);
            }
        }

        async function pingBackend() {
            await apiRequest("/health", { method: "GET" }, 5000);
        }

        function classifySyncError(error) {
            if (error?.status === 401) {
                return "auth";
            }

            if (isTransientStatus(Number(error?.status)) || error?.code === "ETIMEDOUT") {
                return "transient";
            }

            if (error instanceof TypeError) {
                return "transient";
            }

            return "terminal";
        }

        async function markRetry(item, error, requiresAuth) {
            const updated = {
                ...item,
                attemptCount: Number(item.attemptCount || 0) + 1,
                lastError: String(error?.message || "Sync failed").slice(0, 240),
                lastAttemptAt: Date.now(),
                nextAttemptAt: Date.now() + buildDelay(Number(item.attemptCount || 0) + 1),
                requiresAuth: Boolean(requiresAuth),
            };
            await putItem(updated);
            await emitQueueCount(item.username);

            if (requiresAuth) {
                emitEvent("runSyncPaused", {
                    submissionId: item.submissionId,
                    username: item.username,
                    reason: "auth",
                });
            }
        }

        async function handleTerminalFailure(item, error) {
            await deleteItem(item.submissionId);
            emitEvent("runSyncFailed", {
                submissionId: item.submissionId,
                username: item.username,
                error: String(error?.message || "Run sync failed"),
                localLifeDelta: Number(item.localLifeDelta || 0),
            });
            await emitQueueCount(item.username);
        }

        async function handleSyncSuccess(item, payload) {
            await deleteItem(item.submissionId);
            if (payload?.user) {
                sessionStorage.setItem("currentUser", JSON.stringify(payload.user));
            }
            emitEvent("runSyncSuccess", {
                submissionId: item.submissionId,
                username: item.username,
                payload,
            });
            await emitQueueCount(item.username);
        }

        async function submitItem(item) {
            const currentUser = getCurrentUser();
            const token = getAuthToken();

            if (!currentUser?.username || currentUser.username !== item.username || !token) {
                return false;
            }

            try {
                const payload = await apiRequest("/runs/submit", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify(item.payload),
                });
                await handleSyncSuccess(item, payload);
                return true;
            } catch (error) {
                const errorType = classifySyncError(error);
                if (errorType === "auth") {
                    await markRetry(item, error, true);
                    return false;
                }

                if (errorType === "transient") {
                    await markRetry(item, error, false);
                    return false;
                }

                await handleTerminalFailure(item, error);
                return false;
            }
        }

        async function flushDueRuns(reason = "manual") {
            if (flushPromise) {
                return flushPromise;
            }

            flushPromise = (async () => {
                const currentUser = getCurrentUser();
                const token = getAuthToken();
                if (!currentUser?.username || !token) {
                    return { flushed: 0, reason };
                }

                const allItems = await listItems();
                const dueItems = allItems
                    .filter((item) => {
                        if (item.username !== currentUser.username) {
                            return false;
                        }
                        if (item.requiresAuth) {
                            return false;
                        }
                        return Number(item.nextAttemptAt || 0) <= Date.now();
                    })
                    .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));

                if (!dueItems.length) {
                    return { flushed: 0, reason };
                }

                try {
                    await pingBackend();
                } catch (error) {
                    return { flushed: 0, reason, skipped: "unreachable" };
                }

                let flushed = 0;
                for (const item of dueItems) {
                    const synced = await submitItem(item);
                    if (synced) {
                        flushed += 1;
                    }
                }

                return { flushed, reason };
            })().finally(() => {
                flushPromise = null;
            });

            return flushPromise;
        }

        function scheduleFlush(delayMs = 0, reason = "scheduled") {
            if (flushTimer) {
                global.clearTimeout(flushTimer);
            }

            flushTimer = global.setTimeout(() => {
                flushTimer = null;
                void flushDueRuns(reason).catch((error) => {
                    console.warn("Run sync flush failed:", error.message);
                });
            }, Math.max(0, delayMs));
        }

        async function enqueueRunSubmission({ submissionId, sessionId, payload, localLifeDelta }) {
            const currentUser = getCurrentUser();
            if (!currentUser?.username) {
                throw new Error("Authenticated player session is required");
            }

            const item = {
                submissionId,
                sessionId,
                username: currentUser.username,
                payload,
                attemptCount: 0,
                nextAttemptAt: Date.now(),
                lastError: null,
                localLifeDelta: Number(localLifeDelta || 0),
                createdAt: Date.now(),
                lastAttemptAt: null,
                requiresAuth: false,
            };

            await putItem(item);
            await emitQueueCount(currentUser.username);
            scheduleFlush(0, "enqueue");
            await flushDueRuns("enqueue");

            return {
                queued: true,
                synced: !(await getItem(submissionId)),
            };
        }

        async function notifyLogin() {
            const currentUser = getCurrentUser();
            if (!currentUser?.username) {
                return;
            }

            const items = await listItems();
            const updates = items
                .filter((item) => item.username === currentUser.username && item.requiresAuth)
                .map((item) =>
                    putItem({
                        ...item,
                        requiresAuth: false,
                        nextAttemptAt: Date.now(),
                    })
                );

            await Promise.all(updates);
            await emitQueueCount(currentUser.username);
            scheduleFlush(0, "login");
        }

        function bindLifecycleEvents() {
            if (lifecycleBound) {
                return;
            }
            lifecycleBound = true;

            global.addEventListener("online", () => {
                scheduleFlush(0, "online");
            });

            document.addEventListener("visibilitychange", () => {
                if (document.visibilityState === "visible") {
                    scheduleFlush(0, "visibility");
                }
            });
        }

        bindLifecycleEvents();
        scheduleFlush(0, "boot");

        return {
            enqueueRunSubmission,
            flushDueRuns,
            scheduleFlush,
            getPendingLifeDelta,
            notifyLogin,
        };
    }

    const apiBaseUrl =
        typeof global.SERVER_API_URL === "string" ? global.SERVER_API_URL.trim().replace(/\/+$/, "") : "";
    global.runSyncService = createRunSyncService(apiBaseUrl);
})(window);
