// lobby.js

const API_URL = '';
let currentLobbyId = null;
let currentUser = null;
let currentPlayerId = null;
let gameState = null;
let socket = null; // Socket instance

// DOM Elements
const ui = {
    pot: document.getElementById('pot-amount'),
    stake: document.getElementById('current-stake'),
    playersContainer: document.getElementById('players-container'),
    statusBar: document.getElementById('status-bar'),
    adminControls: document.getElementById('admin-controls'),
    playerControls: document.getElementById('player-controls'),
    showControls: document.getElementById('show-controls'),
    winnerSelector: document.getElementById('winner-selector'),
    addPlayerModal: document.getElementById('add-player-modal'),
    lobbyName: document.getElementById('display-lobby-name')
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    currentLobbyId = urlParams.get('lobbyId');

    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
        alert('Please login first');
        window.location.href = '/';
        return;
    }
    currentUser = JSON.parse(storedUser);

    if (!currentLobbyId) {
        alert('No Lobby ID found. Redirecting to home.');
        window.location.href = '/';
        return;
    }

    initSocket();
    fetchInitialState();
});

// Logic
function initSocket() {
    socket = io();

    socket.on('connect', () => {
        console.log('Connected to WebSocket');
        socket.emit('join_lobby', currentLobbyId);
    });

    socket.on('game_update', (data) => {
        console.log('Received Game Update', data);
        render(data);
    });

    socket.on('game_over', (data) => {
        console.log('Game Over Event', data);
        const winnerName = data.winner.name || "Unknown Player";
        const potAmount = data.pot;

        // Show Overlay
        const overlay = document.getElementById('winner-overlay');
        document.getElementById('winner-name').innerText = winnerName;
        document.getElementById('winner-pot').innerText = `₹${potAmount}`;

        overlay.classList.remove('hidden');

        // Hide after 5 seconds
        setTimeout(() => {
            overlay.classList.add('hidden');
        }, 3000);
    });
}

async function fetchInitialState() {
    if (!currentLobbyId) return;
    try {
        const res = await fetch(`/lobby/state?lobbyId=${currentLobbyId}`);
        const data = await res.json();

        if (data.error) {
            if (data.error === 'Lobby not found') {
                alert('Lobby not found!');
                window.location.href = '/';
            }
            return;
        }

        render(data);
    } catch (e) { console.error(e); }
}

function render(data) {
    const { lobby, players, game } = data;
    gameState = game;
    currentPlayers = players; // Store for re-ordering features

    // 1. App Header
    ui.lobbyName.innerText = lobby.name;
    ui.pot.innerText = `₹${game ? game.pot : 0}`;
    ui.stake.innerText = `₹${game ? game.current_stake : lobby.boot_amount} (Boot: ${lobby.boot_amount})`;

    // 2. Players
    ui.playersContainer.innerHTML = '';

    // Identify My Player ID from the list based on currentUser.id
    const myPlayer = players.find(p => p.user_id === currentUser.id);
    currentPlayerId = myPlayer ? myPlayer.id : null;

    players.forEach(p => {
        const isTurn = game && game.status === 'ACTIVE' && game.current_turn_player_id === p.id;
        const isWinner = game && game.status === 'COMPLETED' && game.winner_id === p.id;
        const isPacked = p.game_status === 'PACKED';
        const isMe = currentPlayerId === p.id;

        const el = document.createElement('div');
        el.className = `player-card ${isTurn ? 'active-turn' : ''} ${isPacked ? 'packed' : ''} ${isWinner ? 'winner' : ''}`;

        // Removed manual click to switch identity

        el.innerHTML = `
            <div class="player-info">
                <span class="player-name">${p.name} ${isMe ? '(YOU)' : ''} ${isTurn ? '🎯' : ''} ${isWinner ? '🏆' : ''}</span>
                <span class="player-balance">₹${p.wallet_balance}</span>
            </div>
            <div class="player-status status-${p.game_status?.toLowerCase() || 'blind'}">
                ${p.game_status || 'WAITING'}
            </div>
        `;
        ui.playersContainer.appendChild(el);
    });

    // 3. Controls
    document.getElementById('action-panel').classList.remove('hidden');
    ui.adminControls.classList.add('hidden');
    ui.playerControls.classList.add('hidden');
    ui.showControls.classList.add('hidden');
    ui.winnerSelector.classList.add('hidden');
    ui.statusBar.innerText = '';

    if (!game) {
        ui.statusBar.innerText = 'Waiting to Start...';
        // Only Admin can start? Or anyone? Requirement says "only admin should be able to select winner". 
        // Let's restrict Start to Admin too for consistency, or keep it open if not requested.
        // User only asked for "select winner". I'll restrict "Start" too if I'm already here? 
        // For now, adhere strictly to "select winner". 
        // But "admin_user_id" is available in lobby object.
        const isAdmin = currentUser.id === lobby.admin_user_id;
        if (isAdmin) ui.adminControls.classList.remove('hidden');
    } else if (game.status === 'COMPLETED') {
        ui.statusBar.innerText = `Winner: ${players.find(p => p.id === game.winner_id)?.name}. Ready for new game.`;
        const isAdmin = currentUser.id === lobby.admin_user_id;
        if (isAdmin) ui.adminControls.classList.remove('hidden');
    } else if (game.status === 'SHOW_PENDING') {
        ui.statusBar.innerText = 'Show Requested! Admin select winner.';
        const isAdmin = currentUser.id === lobby.admin_user_id;
        if (isAdmin) {
            ui.winnerSelector.classList.remove('hidden');
            renderWinnerSelector(players);
        } else {
            ui.statusBar.innerText += ' (Waiting for Admin)';
        }
    } else {
        // ... active game logic ...
        const turnPlayer = players.find(p => p.id === game.current_turn_player_id);
        ui.statusBar.innerText = `Current Turn: ${turnPlayer?.name}`;

        // If it's MY turn
        if (currentPlayerId && game.current_turn_player_id === currentPlayerId) {
            ui.playerControls.classList.remove('hidden');

            // Show Button Logic
            const activeCount = players.filter(p => (p.game_status === 'BLIND' || p.game_status === 'SEEN') && p.is_active).length;
            if (activeCount === 2) {
                ui.showControls.classList.remove('hidden');
            }

            // Button Labels logic
            const me = players.find(p => p.id === currentPlayerId);
            const btnBlind = document.getElementById('btn-blind');
            const btnSeen = document.getElementById('btn-seen');

            if (me.game_status === 'SEEN') {
                btnBlind.classList.add('hidden'); // Can't play blind if seen
                btnSeen.innerText = 'Chaal';
            } else {
                btnBlind.classList.remove('hidden');
                btnSeen.innerText = 'See & Chaal'; // Or just Chaal
            }
        }
    }
}

function renderWinnerSelector(players) {
    ui.winnerSelector.querySelector('#winner-list').innerHTML = '';
    const candidates = players.filter(p => p.game_status !== 'PACKED');

    candidates.forEach(p => {
        const btn = document.createElement('button');
        btn.innerText = p.name;
        btn.onclick = () => endGame(p.id);
        ui.winnerSelector.querySelector('#winner-list').appendChild(btn);
    });
}

async function startGame() {
    // Open Modal instead of direct start
    if (!currentLobbyId) return;
    openStartGameModal();
}

// Re-order modal logic
let localPlayerOrder = []; // Array of player objects

function openStartGameModal() {
    if (currentPlayers.length < 2) return alert('Need at least 2 players to start.');

    // Filter active players only?
    // Requirement implies "active players in the game".
    localPlayerOrder = [...currentPlayers.filter(p => p.is_active)]; // Copy

    const modal = document.getElementById('start-game-modal');
    if (!modal) {
        console.error('Start Game Modal not found in DOM. Please refresh the page.');
        alert('Error: Start Game Modal missing. Try refreshing the page.');
        return;
    }

    renderReorderList();
    modal.classList.remove('hidden');
}

function closeStartGameModal() {
    document.getElementById('start-game-modal').classList.add('hidden');
}

function renderReorderList() {
    const list = document.getElementById('player-order-list');
    list.innerHTML = '';

    localPlayerOrder.forEach((p, index) => {
        const el = document.createElement('div');
        el.className = 'player-card'; // Reuse style
        el.style.padding = '10px';
        el.style.justifyContent = 'space-between';

        el.innerHTML = `
            <span>${index + 1}. ${p.name}</span>
            <div>
                <button class="btn-small" onclick="movePlayer(${index}, -1)" ${index === 0 ? 'disabled' : ''}>⬆️</button>
                <button class="btn-small" onclick="movePlayer(${index}, 1)" ${index === localPlayerOrder.length - 1 ? 'disabled' : ''}>⬇️</button>
            </div>
        `;
        list.appendChild(el);
    });
    renderTableVisualization();
}

function movePlayer(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= localPlayerOrder.length) return;

    // Swap
    [localPlayerOrder[index], localPlayerOrder[newIndex]] = [localPlayerOrder[newIndex], localPlayerOrder[index]];
    renderReorderList();
}

async function confirmStartGame() {
    if (!currentLobbyId) return;
    try {
        const playerOrderIds = localPlayerOrder.map(p => p.id);
        const res = await fetch('/game/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lobbyId: currentLobbyId, playerOrder: playerOrderIds })
        });
        const data = await res.json();
        if (data.error) alert(data.error);
        else {
            closeStartGameModal();
            pollState();
        }
    } catch (e) { console.error(e); }
}

async function startGame() {
    // Legacy direct start not used, logic moved to openStartGameModal -> confirmStartGame
    openStartGameModal();
}

async function sendAction(type) {
    if (!currentLobbyId || !currentPlayerId) return;

    const body = {
        lobbyId: currentLobbyId,
        playerId: currentPlayerId,
        actionType: type
    };

    if (type === 'RAISE') {
        const amt = document.getElementById('raise-amount').value;
        if (!amt) return alert('Enter Raise Amount');
        body.raiseAmount = parseInt(amt);
    }

    try {
        const res = await fetch('/game/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.error) alert(data.error);
        else {
            showToast('Action Sent');
            pollState();
        }
    } catch (e) { console.error(e); }
}

async function endGame(winnerId) {
    if (!gameState) return;
    try {
        const res = await fetch('/game/end', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId: gameState.id, winnerId, userId: currentUser.id })
        });
        const data = await res.json();
        if (data.error) alert(data.error);
        else pollState();
    } catch (e) { console.error(e); }
}

// Utilities
function copyLobbyId() {
    navigator.clipboard.writeText(currentLobbyId);
    showToast('Lobby ID Copied!');
}

/* 
async function addPlayer() {
   // Legacy manual add
}
*/

function openAddPlayerModal() {
    // ui.addPlayerModal.classList.remove('hidden');
    alert('Invite others to join using Lobby ID/Name!');
}
function closeModal() {
    ui.addPlayerModal.classList.add('hidden');
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.innerText = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

function renderTableVisualization() {
    const container = document.getElementById('table-visualization');
    if (!container) return;

    // Clear container (No center text for minimal look)
    container.innerHTML = '';

    const total = localPlayerOrder.length;
    const radius = 100; // px, from center
    const centerX = 125; // half of width (250)
    const centerY = 125; // half of height

    localPlayerOrder.forEach((p, index) => {
        // Distribute evenly. Top (Index 0) is -90 degrees.
        const angleDeg = (index * (360 / total)) - 90;
        const angleRad = angleDeg * (Math.PI / 180);

        const x = centerX + radius * Math.cos(angleRad);
        const y = centerY + radius * Math.sin(angleRad);

        const token = document.createElement('div');
        token.className = `player-token ${index === 0 ? 'dealer' : ''}`;
        token.style.left = `${x}px`;
        token.style.top = `${y}px`;

        // Show first letter or index
        token.innerText = index + 1;

        // Name Label
        const nameLabel = document.createElement('div');
        nameLabel.className = 'player-token-name';
        nameLabel.innerText = p.name;
        token.appendChild(nameLabel);

        container.appendChild(token);
    });
}
