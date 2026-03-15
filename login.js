const API_BASE_URL = window.SERVER_API_URL 

document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("login-form");
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    const errorMsg = document.getElementById("error-msg");
    const errorText = document.getElementById("error-text");
    const loginBtn = document.getElementById("login-btn");

    function setLoadingState(isLoading) {
        if (isLoading) {
            loginBtn.innerHTML = '<span class="animate-spin inline-block mr-2">⟳</span> VERIFYING SESSION...';
            loginBtn.classList.add("opacity-75", "cursor-wait");
            return;
        }

        loginBtn.innerHTML = "Initialize Connection";
        loginBtn.classList.remove("opacity-75", "cursor-wait");
    }

    function getDeviceId() {
        const storageKey = "ss_device_id";
        let deviceId = localStorage.getItem(storageKey);
        if (!deviceId) {
            if (window.crypto?.randomUUID) {
                deviceId = window.crypto.randomUUID();
            } else {
                deviceId = `dev-${Math.random().toString(36).slice(2)}-${Date.now()}`;
            }
            localStorage.setItem(storageKey, deviceId);
        }
        return deviceId;
    }

    async function authenticate(username, password) {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-device-id": getDeviceId(),
            },
            body: JSON.stringify({ username, password }),
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(payload.message || "Authentication failed");
        }

        return payload;
    }

    function applyPasswordRequirement() {
        const isAdmin = String(usernameInput.value || "").trim().toLowerCase() === "admin";
        passwordInput.disabled = !isAdmin;
        passwordInput.required = isAdmin;
        if (isAdmin) {
            passwordInput.classList.remove("opacity-50", "cursor-not-allowed");
        } else {
            passwordInput.value = "";
            passwordInput.classList.add("opacity-50", "cursor-not-allowed");
        }
    }

    usernameInput.addEventListener("input", applyPasswordRequirement);
    applyPasswordRequirement();

    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        errorMsg.classList.add("hidden");
        setLoadingState(true);

        try {
            const username = usernameInput.value.trim();
            const isAdmin = String(usernameInput.value || "").trim().toLowerCase() === "admin";
            const password = isAdmin ? passwordInput.value : "";
            const result = await authenticate(username, password);

            sessionStorage.setItem("authToken", result.token);
            sessionStorage.setItem("currentUser", JSON.stringify(result.user));
            if (window.runSyncService && typeof window.runSyncService.notifyLogin === "function") {
                try {
                    await window.runSyncService.notifyLogin();
                } catch (error) {
                    console.warn("Queued run sync could not start after login:", error.message);
                }
            }

            loginBtn.innerHTML = "Access Granted";
            loginBtn.classList.remove("bg-blue-600", "hover:bg-blue-500");
            loginBtn.classList.add("bg-green-600", "hover:bg-green-500");

            setTimeout(() => {
                if (result.user.role === "admin") {
                    window.location.href = "admin.html";
                } else {
                    window.location.href = "index.html";
                }
            }, 300);
        } catch (error) {
            errorText.textContent = error.message || "Authentication failed";
            errorMsg.classList.remove("hidden");

            loginForm.classList.add("translate-x-1");
            setTimeout(() => loginForm.classList.remove("translate-x-1"), 100);
            setTimeout(() => loginForm.classList.add("-translate-x-1"), 200);
            setTimeout(() => loginForm.classList.remove("-translate-x-1"), 300);

            setLoadingState(false);
        }
    });
});
