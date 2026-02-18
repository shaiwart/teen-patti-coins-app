const API_BASE_URL = 'http://localhost:3000';
const socket = io('http://localhost:3000');
let adminUser = null;

// DOM
const loginOverlay = document.getElementById('login-overlay');
const emailInput = document.getElementById('admin-email');
const passInput = document.getElementById('admin-password');
const errorMsg = document.getElementById('login-error');

// Check Auth on Load
const storedUser = localStorage.getItem('adminUser');
if (storedUser) {
    adminUser = JSON.parse(storedUser);
    loginOverlay.style.display = 'none';
    fetchStats();
    joinSocket();
}

async function login() {
    const email = emailInput.value;
    const password = passInput.value;
    errorMsg.innerText = '';

    try {
        const res = await fetch(`${API_BASE_URL}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (data.error) {
            errorMsg.innerText = data.error;
            return;
        }

        // Success
        adminUser = data.user; // Contains ID (check server logic)
        // Ensure token is saved (server returns { user, token })
        // In my server implementation I returned logic: res.json({ user, token: user.id });

        localStorage.setItem('adminUser', JSON.stringify(adminUser));
        loginOverlay.style.display = 'none';

        fetchStats();
        joinSocket();

    } catch (e) {
        errorMsg.innerText = 'Login failed';
        console.error(e);
    }
}

// Initial Fetch
async function fetchStats() {
    if (!adminUser) return;
    try {
        const res = await fetch(`${API_BASE_URL}/admin/stats`, {
            headers: { 'x-admin-userid': adminUser.id }
        });

        if (res.status === 403 || res.status === 401) {
            // Token expired or invalid
            logout();
            return;
        }

        const data = await res.json();
        updateUI(data);
    } catch (e) {
        console.error(e);
    }
}

function logout() {
    localStorage.removeItem('adminUser');
    // location.reload(); // Reload might just refresh current page which is admin.html
    window.location.href = 'index.html'; // Or just reload if staying on admin page
}

function joinSocket() {
    if (adminUser) {
        socket.emit('join_admin_dashboard', adminUser.id);
    }
}

socket.on('connect', () => {
    console.log('Connected to Admin Dashboard');
    joinSocket();
});

socket.on('admin_stats_update', (data) => {
    updateUI(data);
});

function updateUI(data) {
    document.getElementById('totalUsers').innerText = data.totalUsers;
    document.getElementById('totalLobbies').innerText = data.totalLobbies;
    document.getElementById('activeGames').innerText = data.activeGames;
    document.getElementById('liveSockets').innerText = data.liveSockets;
    document.getElementById('totalPot').innerText = `₹${data.totalPot}`;

    // Format Uptime
    const uptime = Math.floor(data.uptime);
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = uptime % 60;
    document.getElementById('uptime').innerText = `${h}h ${m}m ${s}s`;
}

// Loop to keep time ticking locally if socket delays? No, socket sends every 5s.
fetchStats();
