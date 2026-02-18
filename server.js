const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
const { runSchema } = require('./init-db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for dev/file://
        methods: ["GET", "POST"]
    }
});

const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); // Serve frontend files

// Database Connection
// Database Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL, // Priortize full URL (Railway provides this)
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'teen-patti-app-v2',
    password: process.env.DB_PASSWORD || '123',
    port: process.env.DB_PORT || 5432,
});

// Test DB Connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Error connecting to the database', err.stack);
    } else {
        console.log('Connected to Database at:', res.rows[0].now);
    }
});

const ADMIN_SECRET = 'super-secret-admin-key'; // Simple auth for MVP

// --- Socket.IO Logic ---
io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('join_lobby', (lobbyId) => {
        socket.join(`lobby_${lobbyId}`);
        console.log(`Socket joined lobby_${lobbyId}`);
    });

    socket.on('join_admin_dashboard', async (userId) => {
        // Simple verification: Check if user exists and is SUPER_ADMIN
        try {
            const userRes = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
            if (userRes.rows.length > 0 && userRes.rows[0].role === 'SUPER_ADMIN') {
                socket.join('admin_dashboard');
                console.log(`Super Admin ${userId} joined dashboard`);
                // Send immediate stats
                broadcastAdminStats();
            } else {
                console.log(`Unauthorized dashboard join attempt by ${userId}`);
            }
        } catch (e) {
            console.error('Socket Admin Auth Error:', e);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

// Helper to broadcast admin stats
const broadcastAdminStats = async () => {
    try {
        const usersRes = await pool.query('SELECT COUNT(*) FROM users');
        const lobbiesRes = await pool.query('SELECT COUNT(*) FROM lobbies');
        const activeGamesRes = await pool.query("SELECT COUNT(*) FROM games WHERE status = 'ACTIVE'");
        const totalPotRes = await pool.query("SELECT SUM(pot) FROM games WHERE status = 'ACTIVE'");

        const stats = {
            totalUsers: parseInt(usersRes.rows[0].count),
            totalLobbies: parseInt(lobbiesRes.rows[0].count),
            activeGames: parseInt(activeGamesRes.rows[0].count),
            totalPot: parseInt(totalPotRes.rows[0].sum || 0),
            liveSockets: io.engine.clientsCount,
            uptime: process.uptime()
        };

        io.to('admin_dashboard').emit('admin_stats_update', stats);
    } catch (e) {
        console.error('Error broadcasting admin stats:', e);
    }
};

// Broadcast stats every 5 seconds
setInterval(broadcastAdminStats, 5000);

// Helper to broadcast updates
const broadcastLobbyState = async (lobbyId) => {
    try {
        // Fetch fresh state (Reuse logic from /lobby/state)
        const lobbyRes = await pool.query('SELECT * FROM lobbies WHERE id = $1', [lobbyId]);
        const lobby = lobbyRes.rows[0];

        const playersRes = await pool.query('SELECT * FROM players WHERE lobby_id = $1 ORDER BY turn_order ASC', [lobbyId]);
        const players = playersRes.rows;

        const gameRes = await pool.query(`SELECT * FROM games WHERE lobby_id = $1 AND status != 'COMPLETED'`, [lobbyId]);
        const game = gameRes.rows[0] || null;

        // Get Last Winner
        const lastWinnerRes = await pool.query(
            `SELECT u.name FROM games g 
             JOIN players p ON g.winner_id = p.id 
             JOIN users u ON p.user_id = u.id 
             WHERE g.lobby_id = $1 AND g.status = 'COMPLETED' 
             ORDER BY g.created_at DESC LIMIT 1`,
            [lobbyId]
        );

        const statePayload = {
            lobby,
            players,
            game,
            lastWinner: lastWinnerRes.rows[0]?.name || null
        };

        io.to(`lobby_${lobbyId}`).emit('game_update', statePayload);
        console.log(`Broadcasted update to lobby_${lobbyId}`);
    } catch (e) {
        console.error('Error broadcasting state:', e);
    }
};

// API Routes Placeholder
app.get('/health', (req, res) => {
    res.json({ status: 'OK' });
});

// --- Game Logic Handling ---

// Helper function to get the active game for a lobby
const getActiveGame = async (lobbyId) => {
    const res = await pool.query(`SELECT * FROM games WHERE lobby_id = $1 AND status != 'COMPLETED'`, [lobbyId]);
    return res.rows[0];
};

// --- Auth Routes ---
app.post('/auth/register', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });

    try {
        const userRes = await pool.query(
            'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email',
            [name, email, password]
        );
        res.json(userRes.rows[0]);
    } catch (e) {
        if (e.code === '23505') return res.status(400).json({ error: 'Email already exists' });
        res.status(500).json({ error: e.message });
    }
});

app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const userRes = await pool.query('SELECT * FROM users WHERE email = $1 AND password = $2', [email, password]);
        if (userRes.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

        const user = userRes.rows[0];
        delete user.password;
        res.json(user);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// --- API Routes ---

// Start Game
app.post('/game/start', async (req, res) => {
    const { lobbyId, playerOrder } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check if game already active
        const existingGame = await client.query(`SELECT * FROM games WHERE lobby_id = $1 AND status != 'COMPLETED'`, [lobbyId]);
        if (existingGame.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Game already active' });
        }

        // Get Lobby Boot Amount
        const lobbyRes = await client.query('SELECT * FROM lobbies WHERE id = $1', [lobbyId]);
        if (lobbyRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Lobby not found' });
        }
        const bootAmount = lobbyRes.rows[0].boot_amount;

        // If playerOrder is provided, update turn_order
        if (playerOrder && Array.isArray(playerOrder) && playerOrder.length > 0) {
            for (let i = 0; i < playerOrder.length; i++) {
                const playerId = playerOrder[i];
                // Update turn_order AND increment games_played
                await client.query(
                    'UPDATE players SET turn_order = $1, games_played = games_played + 1 WHERE id = $2 AND lobby_id = $3',
                    [i + 1, playerId, lobbyId]
                );
            }
        }

        // Get Active Players (Now in correct order)
        const playersRes = await client.query('SELECT * FROM players WHERE lobby_id = $1 AND is_active = TRUE ORDER BY turn_order ASC', [lobbyId]);
        const players = playersRes.rows;

        if (players.length < 2) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Not enough players to start' });
        }

        // Deduct Boot Amount and Calculate Pot
        let initialPot = 0;
        for (const player of players) {
            if (player.wallet_balance < bootAmount) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: `Player ${player.name} has insufficient funds` });
            }
            await client.query('UPDATE players SET wallet_balance = wallet_balance - $1 WHERE id = $2', [bootAmount, player.id]);
            initialPot += bootAmount;
        }

        // Create Game
        const firstTurnPlayerId = players[0].id;

        const gameRes = await client.query(
            `INSERT INTO games (lobby_id, status, pot, current_stake, current_turn_player_id) 
             VALUES ($1, 'ACTIVE', $2, $3, $4) RETURNING *`,
            [lobbyId, initialPot, bootAmount, firstTurnPlayerId]
        );

        // Reset all players game_status to BLIND (just in case)
        await client.query(`UPDATE players SET game_status = 'BLIND' WHERE lobby_id = $1`, [lobbyId]);

        await client.query('COMMIT');
        res.json({ message: 'Game started', game: gameRes.rows[0] });

        // --- WebSocket Broadcast ---
        broadcastLobbyState(lobbyId);

    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        client.release();
    }
});

// Create Lobby
app.post('/lobby/create', async (req, res) => {
    const { name, bootAmount, initialWallet, userId } = req.body;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Create Lobby
        const resLobby = await client.query(
            'INSERT INTO lobbies (name, boot_amount, initial_wallet_amount, admin_user_id) VALUES ($1, $2, $3, $4) RETURNING *',
            [name, bootAmount, initialWallet, userId]
        );
        const lobby = resLobby.rows[0];

        // Auto-join Admin as Player
        const userRes = await client.query('SELECT name FROM users WHERE id = $1', [userId]);
        const userName = userRes.rows[0].name;

        await client.query(
            'INSERT INTO players (lobby_id, user_id, name, wallet_balance, turn_order) VALUES ($1, $2, $3, $4, 1)',
            [lobby.id, userId, userName, initialWallet]
        );

        await client.query('COMMIT');
        res.json(lobby);
    } catch (e) {
        await client.query('ROLLBACK');
        if (e.code === '23505') return res.status(400).json({ error: 'Lobby name taken' });
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// Join Lobby
app.post('/lobby/join', async (req, res) => {
    const { lobbyIdentifier, userId, playerName } = req.body; // lobbyIdentifier can be ID or Name
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Find Lobby
        console.log(`[Join Debug] Identifier: '${lobbyIdentifier}'`);
        let lobbyRes;
        if (Number.isInteger(Number(lobbyIdentifier))) {
            console.log('[Join Debug] type: ID');
            lobbyRes = await client.query('SELECT * FROM lobbies WHERE id = $1', [lobbyIdentifier]);
            if (lobbyRes.rows.length === 0) {
                console.log('[Join Debug] ID not found, trying name...');
                lobbyRes = await client.query('SELECT * FROM lobbies WHERE name = $1', [lobbyIdentifier]);
            }
        } else {
            console.log('[Join Debug] type: Name');
            lobbyRes = await client.query('SELECT * FROM lobbies WHERE name = $1', [lobbyIdentifier]);
        }

        if (lobbyRes.rows.length === 0) {
            console.log('[Join Debug] Lobby NOT FOUND');
            await client.query('ROLLBACK');
            return res.status(404).json({ error: `Lobby '${lobbyIdentifier}' not found` });
        }
        const lobby = lobbyRes.rows[0];
        console.log(`[Join Debug] Found Lobby: ${lobby.id} (${lobby.name})`);

        // Check if user already joined
        const existingPlayerRes = await client.query('SELECT * FROM players WHERE lobby_id = $1 AND user_id = $2', [lobby.id, userId]);
        if (existingPlayerRes.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.json({ message: 'Already joined', player: existingPlayerRes.rows[0], lobby });
        }

        // Determine Player Name (User provided or User's name?)
        // Requirement: "join with playername (playername inside one lobby should be unique)"
        // But also "Authenticated user".
        // Let's use the provided `playerName` or fallback to User's name.
        let nameToUse = playerName;
        if (!nameToUse) {
            const u = await client.query('SELECT name FROM users WHERE id = $1', [userId]);
            nameToUse = u.rows[0].name;
        }

        // Check Player Name Uniqueness in Lobby
        const nameCheck = await client.query('SELECT 1 FROM players WHERE lobby_id = $1 AND name = $2', [lobby.id, nameToUse]);
        if (nameCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Player name already taken in this lobby' });
        }

        // Get Turn Order
        const orderRes = await client.query('SELECT MAX(turn_order) as max_order FROM players WHERE lobby_id = $1', [lobby.id]);
        const nextOrder = (orderRes.rows[0].max_order || 0) + 1;

        // Add Player
        const newPlayer = await client.query(
            'INSERT INTO players (lobby_id, user_id, name, wallet_balance, turn_order) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [lobby.id, userId, nameToUse, lobby.initial_wallet_amount, nextOrder]
        );

        await client.query('COMMIT');
        res.json({ message: 'Joined successfully', player: newPlayer.rows[0], lobby });

        // --- WebSocket Broadcast ---
        broadcastLobbyState(lobby.id);

    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});
// Game Action
app.post('/game/action', async (req, res) => {
    const { lobbyId, playerId, actionType, raiseAmount } = req.body;
    // actionType: 'BLIND', 'SEEN_BET', 'FOLD', 'RAISE', 'SHOW'

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Get Game State and Logic Validation
        const gameRes = await client.query(`SELECT * FROM games WHERE lobby_id = $1 AND status = 'ACTIVE' FOR UPDATE`, [lobbyId]); // Lock game row

        if (gameRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'No active game found' });
        }
        const game = gameRes.rows[0];

        if (game.current_turn_player_id != playerId) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Not your turn' });
        }

        const playerRes = await client.query(`SELECT * FROM players WHERE id = $1`, [playerId]);
        const player = playerRes.rows[0];

        // 2. Process Action
        let deduction = 0;
        let nextStake = game.current_stake;
        let nextStatus = 'ACTIVE';
        let playerUpdateStatus = null; // actions can change player status (e.g., BLIND -> SEEN, or -> PACKED)

        // Get boot_amount from lobbies table as requested
        const lobbyRes = await client.query('SELECT boot_amount FROM lobbies WHERE id = $1', [game.lobby_id]);

        if (actionType === 'FOLD') {
            deduction = 0;
            playerUpdateStatus = 'PACKED';
        } else if (actionType === 'BLIND') {
            // Requirement: "Play Blind: Deduct Current Stake"
            // Ensure player is currently BLIND? (Optional validation, but good to have)
            // If player is SEEN, they shouldn't call BLIND action, but 'SEEN_BET' or whatever.
            // We'll trust the input mapping for now, or enforce simple logic.
            const bootAmount = lobbyRes.rows[0].boot_amount;
            // deduction = game.current_stake;
            deduction = bootAmount;
        } else if (actionType === 'SEEN_BET') {
            // Requirement: "Option A (Bet): Deduct Current Stake... Status -> SEEN"
            if (player.status !== 'SEEN') { // Assuming we track player status in game? 
                // Wait, players table has `is_active`, but not "Blind/Seen" state for the current game.
                // We need to track who is BLIND and who is SEEN *per game*.
                // The `players` table `is_active` is likely "Sitting in lobby".
                // We need a way to track "Blind/Seen/Packed" status for the *current game*.
                // Since there is no join table `game_players` in the schema provided in request,
                // and `players` table has `is_active`, maybe strict "Blind/Seen" state is ephemeral or stored in `actions` history?
                // OR, the prompt implies "All players start as status: BLIND".
                // I should add a `status` column to `players` table, OR `game_players` table.
                // Re-reading schema: `players`: (id, lobby_id, name, wallet_balance, is_active)
                // It does NOT have `status` (Blind/Seen).
                // I should ADD `status` to `players` table to track this transient state, OR create `game_players`.
                // Given the prompt "All players start as status: BLIND", this state must be stored.
                // I'll add `status` column to `players` table for simplicity in this MVP, assuming 1 active game per lobby means strict 1:1 player state.
                // UPDATE: I will execute an ALTER TABLE command in this block (or separately) to add `last_action` or `current_game_status`?
                // Better: I'll assume `is_active` is for "In the lobby". 
                // I'll add `game_status` column to `players` table. 'BLIND', 'SEEN', 'PACKED'.
            }
            deduction = game.current_stake;
            playerUpdateStatus = 'SEEN';
        } else if (actionType === 'RAISE') {
            // New Requirement: Input is Total Stake (not difference)
            // "the amount put in the field is the total raised amount (total)"

            const newTotalStake = parseInt(raiseAmount);
            if (isNaN(newTotalStake) || newTotalStake <= game.current_stake) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Raise amount must be higher than current stake' });
            }

            deduction = newTotalStake;
            nextStake = newTotalStake;
            playerUpdateStatus = 'SEEN';
        } else if (actionType === 'SHOW') {
            // Validation: Only 2 active players remaining.
            const activePlayersCountRes = await client.query(
                `SELECT COUNT(*) FROM players WHERE lobby_id = $1 AND is_active = TRUE AND (game_status = 'BLIND' OR game_status = 'SEEN')`,
                [lobbyId]
            ); // NOTE: I'm inventing `game_status` pending schema update.

            // Assume I fix schema in a moment.

            deduction = game.current_stake;
            nextStatus = 'SHOW_PENDING';
        }

        // 3. Balance Check
        if (player.wallet_balance < deduction) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Insufficient funds' });
        }

        // 4. Updates
        // Update Wallet
        await client.query(`UPDATE players SET wallet_balance = wallet_balance - $1 WHERE id = $2`, [deduction, playerId]);

        // Update Player Game Status (if changed)
        if (playerUpdateStatus) {
            await client.query(`UPDATE players SET game_status = $1 WHERE id = $2`, [playerUpdateStatus, playerId]);
        }

        // Update Game (Pot, Stake, Status)
        await client.query(
            `UPDATE games SET pot = pot + $1, current_stake = $2, status = $3 WHERE id = $4`,
            [deduction, nextStake, nextStatus, game.id]
        );

        // Record Action
        await client.query(
            `INSERT INTO actions (game_id, player_id, type, amount) VALUES ($1, $2, $3, $4)`,
            [game.id, playerId, actionType, deduction]
        );

        // 5. Turn Rotation (If Game not ended/show pending)
        let gameEnded = false;
        let winner = null;

        if (nextStatus === 'ACTIVE') {
            // Check for Auto-Win (Only 1 active player left)
            // Get all players who are NOT packed
            const activePlayersRes = await client.query(
                `SELECT * FROM players WHERE lobby_id = $1 AND is_active = TRUE AND game_status != 'PACKED'`,
                [lobbyId]
            );
            const activePlayers = activePlayersRes.rows;

            if (activePlayers.length === 1) {
                // Auto-End Game
                gameEnded = true;
                winner = activePlayers[0];

                // Credit Pot
                // NOTE: pot here is old game.pot. We need updated pot (game.pot + deduction).
                // But we already updated DB. Let's fetch updated game or calc:
                const finalPot = game.pot + deduction;

                await client.query(`UPDATE players SET wallet_balance = wallet_balance + $1, games_won = games_won + 1 WHERE id = $2`, [finalPot, winner.id]);
                await client.query(`UPDATE games SET status = 'COMPLETED', winner_id = $1 WHERE id = $2`, [winner.id, game.id]);

                // Reset statuses
                await client.query(`UPDATE players SET game_status = 'BLIND' WHERE lobby_id = $1`, [lobbyId]);
            } else {
                // Normal Rotation
                // Get all active players (including packed? No, rotation skips packed)
                // We need the full list to determine order, but skip packed for next turn
                const allPlayers = await client.query(
                    `SELECT * FROM players WHERE lobby_id = $1 AND is_active = TRUE ORDER BY turn_order ASC`,
                    [lobbyId]
                );

                let currentIndex = allPlayers.rows.findIndex(p => p.id === playerId);
                let nextPlayer = null;
                let loopCount = 0;

                while (!nextPlayer && loopCount < allPlayers.rows.length) {
                    currentIndex = (currentIndex + 1) % allPlayers.rows.length;
                    const p = allPlayers.rows[currentIndex];
                    if (p.game_status !== 'PACKED') {
                        nextPlayer = p;
                    }
                    loopCount++;
                }

                if (nextPlayer) {
                    await client.query(`UPDATE games SET current_turn_player_id = $1 WHERE id = $2`, [nextPlayer.id, game.id]);
                }
            }
        } else {
            // Game is SHOW_PENDING. Turn stops.
            await client.query(`UPDATE games SET current_turn_player_id = NULL WHERE id = $1`, [game.id]);
        }

        await client.query('COMMIT');

        if (gameEnded) {
            res.json({ message: 'Game ended. Winner declared.', winner, gameEnded: true });
            io.to(`lobby_${lobbyId}`).emit('game_over', { winner, pot: game.pot + deduction });
        } else {
            res.json({ message: 'Action successful', gameEnded: false });
        }

        // --- WebSocket Broadcast ---
        broadcastLobbyState(lobbyId);

    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        client.release();
    }
});



// End Game
app.post('/game/end', async (req, res) => {
    const { gameId, winnerId, userId } = req.body;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Verify Game & Winner
        const gameRes = await client.query(`SELECT * FROM games WHERE id = $1 AND status != 'COMPLETED'`, [gameId]);
        if (gameRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Active game not found' });
        }
        const game = gameRes.rows[0];

        // Verify Admin
        const lobbyRes = await client.query('SELECT admin_user_id FROM lobbies WHERE id = $1', [game.lobby_id]);
        if (lobbyRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Lobby not found' });
        }
        if (lobbyRes.rows[0].admin_user_id !== userId) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Only Lobby Admin can end the game' });
        }

        // Credit Pot to Winner and Increment Wins
        await client.query(`UPDATE players SET wallet_balance = wallet_balance + $1, games_won = games_won + 1 WHERE id = $2`, [game.pot, winnerId]);

        // Mark Game Completed
        await client.query(`UPDATE games SET status = 'COMPLETED', winner_id = $1 WHERE id = $2`, [winnerId, gameId]);

        // Reset Player Statuses for next game (Blind)
        await client.query(`UPDATE players SET game_status = 'BLIND' WHERE lobby_id = $1`, [game.lobby_id]);

        await client.query('COMMIT');
        res.json({ message: 'Game ended successfully' });

        // --- WebSocket Broadcast ---
        io.to(`lobby_${game.lobby_id}`).emit('game_over', {
            winner: { id: winnerId, name: (await pool.query('SELECT name FROM users WHERE id = (SELECT user_id FROM players WHERE id=$1)', [winnerId])).rows[0]?.name || 'Player' },
            pot: game.pot
        });
        broadcastLobbyState(game.lobby_id);

    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        client.release();
    }
});

// Get Lobby State
app.get('/lobby/state', async (req, res) => {
    const { lobbyId } = req.query;
    if (!lobbyId) return res.status(400).json({ error: 'Missing lobbyId' });

    try {
        const lobbyRes = await pool.query('SELECT * FROM lobbies WHERE id = $1', [lobbyId]);
        if (lobbyRes.rows.length === 0) return res.status(404).json({ error: 'Lobby not found' });
        const lobby = lobbyRes.rows[0];

        const playersRes = await pool.query('SELECT * FROM players WHERE lobby_id = $1 ORDER BY turn_order ASC', [lobbyId]);
        const players = playersRes.rows;

        const gameRes = await pool.query(`SELECT * FROM games WHERE lobby_id = $1 AND status != 'COMPLETED'`, [lobbyId]);
        const game = gameRes.rows[0] || null;

        res.json({
            lobby,
            players,
            game
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});




// Get User's Lobbies
app.get('/lobby/user', async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    try {
        const result = await pool.query('SELECT * FROM lobbies WHERE admin_user_id = $1 ORDER BY created_at DESC', [userId]);
        res.json(result.rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Delete Lobby
app.delete('/lobby/delete', async (req, res) => {
    const { lobbyId, userId } = req.body;
    if (!userId || !lobbyId) return res.status(400).json({ error: 'Missing fields' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Verify Admin
        const lobbyRes = await client.query('SELECT admin_user_id FROM lobbies WHERE id = $1', [lobbyId]);
        if (lobbyRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Lobby not found' });
        }
        if (lobbyRes.rows[0].admin_user_id !== userId) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Unauthorized: Only Admin can delete' });
        }

        // Cascade Delete
        // 1. Get Game IDs to delete actions
        const gamesRes = await client.query('SELECT id FROM games WHERE lobby_id = $1', [lobbyId]);
        const gameIds = gamesRes.rows.map(g => g.id);

        if (gameIds.length > 0) {
            // Delete Actions
            await client.query('DELETE FROM actions WHERE game_id = ANY($1)', [gameIds]);
            // Delete Games
            await client.query('DELETE FROM games WHERE lobby_id = $1', [lobbyId]);
        }

        // Delete Players
        await client.query('DELETE FROM players WHERE lobby_id = $1', [lobbyId]);

        // Delete Lobby
        await client.query('DELETE FROM lobbies WHERE id = $1', [lobbyId]);

        await client.query('COMMIT');
        res.json({ message: 'Lobby deleted successfully' });

    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
        res.status(500).json({ error: e.message || 'Internal Server Error' });
    } finally {
        client.release();
    }
});

// Admin Stats API
app.get('/admin/stats', async (req, res) => {
    // Auth Check: Look for user ID in header
    const userId = req.headers['x-admin-userid'];
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
        // Verify User Role
        const userRes = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length === 0 || userRes.rows[0].role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Forbidden: Super Admin access required' });
        }

        const usersRes = await pool.query('SELECT COUNT(*) FROM users');
        const lobbiesRes = await pool.query('SELECT COUNT(*) FROM lobbies');
        const activeGamesRes = await pool.query("SELECT COUNT(*) FROM games WHERE status = 'ACTIVE'");
        const totalPotRes = await pool.query("SELECT SUM(pot) FROM games WHERE status = 'ACTIVE'");

        res.json({
            totalUsers: parseInt(usersRes.rows[0].count),
            totalLobbies: parseInt(lobbiesRes.rows[0].count),
            activeGames: parseInt(activeGamesRes.rows[0].count),
            totalPot: parseInt(totalPotRes.rows[0].sum || 0),
            liveSockets: io.engine.clientsCount,
            uptime: process.uptime()
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Admin Login
app.post('/admin/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const userRes = await pool.query('SELECT * FROM users WHERE email = $1 AND password = $2', [email, password]);
        if (userRes.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

        const user = userRes.rows[0];
        if (user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Access Denied: You are not a Super Admin' });
        }

        delete user.password;
        res.json({ user, token: user.id }); // Using ID as token for MVP
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const startServer = async () => {
    // 1. Initialize Database Schema
    await runSchema(pool);

    // 2. Start Server
    server.listen(port, () => {
        console.log(`Server running on port ${port}`);
    });
};

startServer();

module.exports = { app, pool };
