/**
 * ADMIN DASHBOARD CONTROLLER
 * * INSTRUCTIONS FOR DEPLOYMENT:
 * 1. Change API_BASE_URL to your actual backend server address.
 * 2. Ensure your backend has endpoints:
 * - GET /players (Returns list of players with lives/status)
 * - POST /players/:id/restore (Restores lives to 3)
 */

// ================= CONFIGURATION =================
const API_BASE_URL = ""; // e.g., "https://api.myserver.com" or leave empty for local testing fallback
const MOCK_MODE = true;  // Set to FALSE when you have a real DB connection
// =================================================

class AdminDashboard {
    constructor() {
        this.tableBody = document.getElementById('student-table-body');
        this.toastEl = document.getElementById('admin-toast');
        this.init();
    }

    async init() {
        await this.refreshData();
    }

    showToast(msg, type = 'success') {
        this.toastEl.textContent = msg;
        this.toastEl.className = `fixed bottom-4 right-4 px-6 py-3 rounded shadow-lg transform transition-transform duration-300 z-50 ${type === 'error' ? 'bg-red-600' : 'bg-green-600'} text-white`;
        this.toastEl.style.transform = 'translateY(0)';
        setTimeout(() => {
            this.toastEl.style.transform = 'translateY(5rem)'; // Hide
        }, 3000);
    }

    // --- 1. FETCH PLAYERS ---
    async refreshData() {
        try {
            let players = [];

            if (!MOCK_MODE) {
                // REAL BACKEND MODE
                const response = await fetch(`${API_BASE_URL}/players`);
                if (!response.ok) throw new Error("Failed to fetch player data");
                players = await response.json();
            } else {
                // FALLBACK: Read from users.json just to show the list (Read-Only)
                // In a real app, this would also need to fetch "GameState" to see current lives
                const response = await fetch('users.json');
                const data = await response.json();
                players = data.users.map(u => ({
                    id: u.id,
                    username: u.username,
                    status: 'UNKNOWN', // Cannot know status without DB
                    lives: '?'         // Cannot know lives without DB
                }));
            }

            this.renderTable(players);
        } catch (error) {
            console.error("Admin Error:", error);
            this.showToast("Connection Failed: Check Console", "error");
        }
    }

    // --- 2. RESTORE LIVES ACTION ---
    async restoreLives(playerId, username) {
        if (!confirm(`Confirm: Restore 3 lives for Operator [${username}]?`)) return;

        try {
            if (!MOCK_MODE) {
                // REAL BACKEND MODE
                const response = await fetch(`${API_BASE_URL}/players/${playerId}/restore`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                if (!response.ok) throw new Error("Restore failed");
                
                this.showToast(`Lives Restored for ${username}`);
                this.refreshData(); // Refresh table to show new status
            } else {
                // MOCK MODE (Just console log)
                console.log(`[MOCK API] POST ${API_BASE_URL}/players/${playerId}/restore`);
                this.showToast(`(Simulation) Request sent for ${username}`);
                alert("This feature requires a running DB server. Connect API_BASE_URL in admin.js.");
            }
        } catch (error) {
            console.error("Restore Error:", error);
            this.showToast("Action Failed", "error");
        }
    }
    async resetSession(username) {
        if (!confirm(`Warning: Force logout for operator [${username}]? They will be allowed to log in again.`)) return;

        try {
            if (!MOCK_MODE) {
                // REAL BACKEND MODE
                // Endpoint: POST /players/:username/logout
                const response = await fetch(`${API_BASE_URL}/players/${username}/logout`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                if (!response.ok) throw new Error("Session reset failed");
                
                this.showToast(`Session Unlocked for ${username}`);
                this.refreshData(); 
            } else {
                // MOCK MODE
                console.log(`[MOCK API] POST ${API_BASE_URL}/players/${username}/logout`);
                this.showToast(`(Simulation) Session Reset for ${username}`);
            }
        } catch (error) {
            console.error("Reset Error:", error);
            this.showToast("Action Failed", "error");
        }
    }

    renderTable(players) {
        this.tableBody.innerHTML = '';
        
        players.forEach(p => {
            const row = document.createElement('tr');
            row.className = "border-b border-gray-800 hover:bg-gray-800/50 transition";
            
            const statusColor = p.lives === 0 ? 'text-red-500' : 'text-green-500';
            
            // Added the "Unlock" button (Yellow Key Icon)
            row.innerHTML = `
                <td class="p-3 text-gray-500">#${p.id}</td>
                <td class="p-3 font-bold text-white">${p.username}</td>
                <td class="p-3 ${statusColor}">${p.status || 'Active'}</td>
                <td class="p-3">${p.lives || '-'}</td>
                <td class="p-3 text-right flex justify-end gap-2">
                    <button onclick="adminDashboard.restoreLives('${p.id}', '${p.username}')" 
                        class="bg-green-700 hover:bg-green-600 text-white text-xs font-bold uppercase px-3 py-1.5 rounded shadow-[0_0_10px_rgba(21,128,61,0.4)] transition border border-green-500/30">
                        ❤️ Restore
                    </button>
                    
                    <button onclick="adminDashboard.resetSession('${p.username}')" 
                        class="bg-yellow-700 hover:bg-yellow-600 text-white text-xs font-bold uppercase px-3 py-1.5 rounded shadow-[0_0_10px_rgba(234,179,8,0.4)] transition border border-yellow-500/30"
                        title="Unlock Device (Force Logout)">
                        🔓 Unlock
                    </button>
                </td>
            `;
            this.tableBody.appendChild(row);
        });
    }
}
// Initialize
const adminDashboard = new AdminDashboard();