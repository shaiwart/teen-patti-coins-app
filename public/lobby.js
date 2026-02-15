// lobby.js

const API_URL = '';
let currentLobbyId = null;
let currentUser = null;
let currentPlayerId = null;
let gameState = null;
let pollInterval = null;

const POLL_RATE_MS = 2000;

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

    startPolling();
});


// Logic
function startPolling() {
    pollState();
    pollInterval = setInterval(pollState, POLL_RATE_MS);
}

async function pollState() {
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
        ui.adminControls.classList.remove('hidden'); // Anyone can start for now
    } else if (game.status === 'COMPLETED') {
        ui.statusBar.innerText = `Winner: ${players.find(p => p.id === game.winner_id)?.name}. Ready for new game.`;
        ui.adminControls.classList.remove('hidden');
    } else if (game.status === 'SHOW_PENDING') {
        ui.statusBar.innerText = 'Show Requested! Admin select winner.';
        ui.winnerSelector.classList.remove('hidden');
        renderWinnerSelector(players);
    } else {
        // ACTIVE Game
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
    if (!currentLobbyId) return;
    try {
        const res = await fetch('/game/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lobbyId: currentLobbyId })
        });
        const data = await res.json();
        if (data.error) alert(data.error);
        else pollState();
    } catch (e) { console.error(e); }
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
            body: JSON.stringify({ gameId: gameState.id, winnerId })
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
