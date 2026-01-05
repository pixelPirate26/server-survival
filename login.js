// CONFIG: Point this to your backend when ready
const API_AUTH_URL = ""; // e.g. "https://api.myserver.com"

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const errorMsg = document.getElementById('error-msg');
    const errorText = document.getElementById('error-text');
    const loginBtn = document.getElementById('login-btn');

    async function authenticate(username, password) {
        // 1. LOCAL CHECK: Verify credentials against users.json first
        try {
            const response = await fetch('users.json');
            if (!response.ok) throw new Error("Database error");
            const data = await response.json();
            
            // Check credentials
            const user = data.users.find(u => u.username === username && u.password === password);
            
            if (!user) return { success: false, reason: "Invalid Operator ID or Key" };

            // 2. SERVER CHECK: If local creds are good, check Server for Active Session
            if (API_AUTH_URL) {
                try {
                    const sessionCheck = await fetch(`${API_AUTH_URL}/login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username: username })
                    });

                    if (sessionCheck.status === 403) {
                        return { success: false, reason: "Login Locked: User active on another device." };
                    }
                    
                    if (!sessionCheck.ok) {
                        // Optional: Handle other server errors
                        console.warn("Server warning:", await sessionCheck.text());
                    }
                } catch (serverErr) {
                    console.error("Server connection failed, proceeding with local auth only.");
                }
            }

            return { success: true, user: user };

        } catch (error) {
            console.error("Auth Error:", error);
            // Fallback for admin
            if (username === 'admin' && password === 'adminpassword') return { success: true, user: { username: 'admin' } };
            return { success: false, reason: "System Error" };
        }
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        errorMsg.classList.add('hidden');
        loginBtn.innerHTML = '<span class="animate-spin inline-block mr-2">⟳</span> VERIFYING SESSION...';
        loginBtn.classList.add('opacity-75', 'cursor-wait');
        
        const username = usernameInput.value;
        const password = passwordInput.value;

        setTimeout(async () => {
            const result = await authenticate(username, password);

            if (result.success) {
                loginBtn.innerHTML = 'ACCESS GRANTED';
                loginBtn.classList.remove('bg-blue-600', 'hover:bg-blue-500');
                loginBtn.classList.add('bg-green-600', 'hover:bg-green-500');
        
                sessionStorage.setItem('currentUser', JSON.stringify({
                    username: result.user.username
                }));

                setTimeout(() => {
                    // Redirect Logic
                    if (result.user.username === 'admin') {
                        window.location.href = 'admin.html';
                    } else {
                        window.location.href = 'index.html';
                    }
                }, 500);
            } else {
                // Show specific error (Invalid Password OR Session Locked)
                errorText.textContent = result.reason;
                errorMsg.classList.remove('hidden');
                
                // Shake animation
                loginForm.classList.add('translate-x-1');
                setTimeout(() => loginForm.classList.remove('translate-x-1'), 100);
                setTimeout(() => loginForm.classList.add('-translate-x-1'), 200);
                setTimeout(() => loginForm.classList.remove('-translate-x-1'), 300);

                loginBtn.innerHTML = 'INITIALIZE CONNECTION';
                loginBtn.classList.remove('opacity-75', 'cursor-wait');
            }
        }, 500);
    });
});