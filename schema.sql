-- Enable UUID extension if needed, though we can use SERIAL/INTEGER for simplicity in this MVP
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL, -- Simple text or hashed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lobbies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    boot_amount INTEGER NOT NULL DEFAULT 100,
    initial_wallet_amount INTEGER NOT NULL DEFAULT 10000,
    admin_user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS players (
    id SERIAL PRIMARY KEY,
    lobby_id INTEGER REFERENCES lobbies(id),
    user_id INTEGER REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    wallet_balance INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    turn_order INTEGER, -- To maintain turn sequence
    game_status VARCHAR(20) DEFAULT 'BLIND', -- BLIND, SEEN, PACKED
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    UNIQUE(lobby_id, name),
    UNIQUE(lobby_id, user_id)
);

CREATE TABLE IF NOT EXISTS games (
    id SERIAL PRIMARY KEY,
    lobby_id INTEGER REFERENCES lobbies(id),
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, COMPLETED, SHOW_PENDING
    pot INTEGER NOT NULL DEFAULT 0,
    current_stake INTEGER NOT NULL,
    current_turn_player_id INTEGER REFERENCES players(id),
    winner_id INTEGER REFERENCES players(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS actions (
    id SERIAL PRIMARY KEY,
    game_id INTEGER REFERENCES games(id),
    player_id INTEGER REFERENCES players(id),
    type VARCHAR(50) NOT NULL, -- BLIND, SEEN, FOLD, RAISE, SHOW
    amount INTEGER NOT NULL DEFAULT 0,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
