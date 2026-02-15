const BASE_URL = 'http://127.0.0.1:3000';

async function runTest() {
    console.log(`--- Starting System Test against ${BASE_URL} ---`);

    try {
        // 1. Create Lobby
        console.log('\n1. Creating Lobby...');
        const lobbyRes = await fetch(`${BASE_URL}/lobby/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Test Lobby v2', bootAmount: 100 })
        });
        const lobby = await lobbyRes.json();
        if (!lobby.id) throw new Error('Failed to create lobby');
        console.log(`Lobby Created: ID ${lobby.id}, Boot ${lobby.boot_amount}`);

        // 2. Add Players
        console.log('\n2. Adding Players...');
        const p1Res = await fetch(`${BASE_URL}/player/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lobbyId: lobby.id, name: 'Alice', balance: 5000 })
        });
        const p1 = await p1Res.json();
        console.log(`Player 1 Added: ${p1.name} (ID: ${p1.id})`);

        const p2Res = await fetch(`${BASE_URL}/player/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lobbyId: lobby.id, name: 'Bob', balance: 5000 })
        });
        const p2 = await p2Res.json();
        console.log(`Player 2 Added: ${p2.name} (ID: ${p2.id})`);

        // 3. Start Game
        console.log('\n3. Starting Game...');
        const gameRes = await fetch(`${BASE_URL}/game/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lobbyId: lobby.id })
        });
        const gameData = await gameRes.json();
        if (gameData.error) throw new Error(gameData.error);
        const gameId = gameData.game.id;
        console.log(`Game Started: ID ${gameId}, Pot: ${gameData.game.pot}`);

        // 4. Perform Action (Blind)
        console.log('\n4. Player 1 (Alice) Plays BLIND...');
        const action1Res = await fetch(`${BASE_URL}/game/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lobbyId: lobby.id,
                playerId: p1.id,
                actionType: 'BLIND'
            })
        });
        const action1 = await action1Res.json();
        if (action1.error) throw new Error(action1.error);
        console.log('Action Successful:', action1.message);

        // 5. Check State
        console.log('\n5. Checking Lobby State...');
        const stateRes = await fetch(`${BASE_URL}/lobby/state?lobbyId=${lobby.id}`);
        const state = await stateRes.json();
        console.log(`Current Pot: ${state.game.pot}`);
        console.log(`Current Turn Player ID: ${state.game.current_turn_player_id}`);

        console.log('\n--- Test Completed Successfully ---');

    } catch (e) {
        console.error('\n!!! TEST FAILED !!!');
        console.error(e.message);
        if (e.cause) console.error('Cause:', e.cause);
    }
}

runTest();
