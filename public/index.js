// index.js

let currentUser = null;

// Init
document.addEventListener('DOMContentLoaded', () => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
        currentUser = JSON.parse(storedUser);
        showDashboard();
    }
});

// Auth Functions
function showLogin() {
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('register-form').classList.add('hidden');
}

function showRegister() {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('register-form').classList.remove('hidden');
}

async function login() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    if (!email || !password) return showToast('Enter email and password');

    try {
        const res = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        loginSuccess(data);
    } catch (e) {
        showToast(e.message);
    }
}

async function register() {
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    if (!name || !email || !password) return showToast('Fill all fields');

    try {
        const res = await fetch('/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        // Auto login or just fill login? Let's just login
        loginSuccess(data);
    } catch (e) {
        showToast(e.message);
    }
}

function loginSuccess(user) {
    currentUser = user;
    localStorage.setItem('user', JSON.stringify(user));
    showToast(`Welcome ${user.name}`);
    showDashboard();
}

function logout() {
    localStorage.removeItem('user');
    currentUser = null;
    document.getElementById('auth-section').classList.remove('hidden');
    document.getElementById('dashboard-section').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('dashboard-section').classList.remove('hidden');
    document.getElementById('user-name-display').innerText = currentUser.name;
}


// Lobby Functions
async function createLobby() {
    const name = document.getElementById('lobby-name').value;
    const boot = document.getElementById('boot-amount').value;
    const initialWallet = document.getElementById('initial-wallet').value;
    if (!name || !boot) return showToast('Enter Name and Boot Amount');

    try {
        const res = await fetch('/lobby/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                bootAmount: parseInt(boot),
                initialWallet: parseInt(initialWallet),
                userId: currentUser.id
            })
        });
        const data = await res.json();
        if (data.id) {
            window.location.href = `/lobby.html?lobbyId=${data.id}`;
        } else {
            showToast(data.error || 'Failed to create lobby');
        }
    } catch (e) {
        console.error(e);
        showToast('Error creating lobby');
    }
}

async function joinLobby() {
    const title = document.getElementById('lobby-identifier').value;
    const playerName = document.getElementById('join-player-name').value;
    if (!title) return showToast('Enter Lobby ID or Name');

    try {
        const res = await fetch('/lobby/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lobbyIdentifier: title,
                userId: currentUser.id,
                playerName: playerName || null
            })
        });
        const data = await res.json();
        if (data.error && data.error !== 'Already joined') {
            showToast(data.error);
        } else {
            // Success or Already Joined (which returns lobby info too usually, or we handled it)
            // Backend returns { message: '...', player: ..., lobby: ... }
            // or { error: ... }
            if (data.lobby) {
                window.location.href = `/lobby.html?lobbyId=${data.lobby.id}`;
            } else {
                showToast(data.message || 'Error joining');
            }
        }
    } catch (e) {
        console.error(e);
        showToast('Error joining lobby');
    }
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.innerText = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}
