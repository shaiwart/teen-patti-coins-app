# Teen Patti Ledger v2

A real-time web application to manage bets, pots, and balances for Teen Patti games. This app serves as a digital ledger and game coordinator, replacing physical chips and manual scorekeeping.

## 🚀 Features

- **Real-Time Gameplay**: Instant updates for actions (bet, fold, win) using WebSockets (Socket.IO).
- **Lobby System**: Create private rooms with custom Boot Amounts and Initial Chips.
- **Wallet System**: Tracks player balances across games.
- **Game Logic**:
  - Supports **Blind** and **Seen** play styles.
  - Handles **Chaal**, **Raise**, **Fold**, and **Show**.
  - Automatic **Pot** calculation.
  - Turn rotation and active player tracking.
- **Admin Tools**: Lobby creators can start games and declare winners.
- **Secure Auth**: Simple email/password authentication.

## 🛠️ Tech Stack

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Backend**: Node.js, Express.js
- **Real-Time Communication**: Socket.IO
- **Database**: PostgreSQL

## 📦 Installation & Setup

### Prerequisites
- Node.js (v14+)
- PostgreSQL Database

### Steps

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd teen-patti-ledger-v2
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Database Setup**
   - Ensure PostgreSQL is running.
   - Create a database (e.g., `teen-patti-app-v2`).
   - Run the schema script to create tables:
     ```bash
     psql -U postgres -d teen-patti-app-v2 -f schema.sql
     ```
   *(Note: Adjust `server.js` database config if your credentials differ)*

4. **Start the Server**
   ```bash
   node server.js
   ```
   The server will run on `http://localhost:3000`.

5. **Run the App**
   - Open `public/index.html` in your browser.
   - **OR** if serving static files via Express, navigate to `http://localhost:3000`.

## 🎮 How to Play

1. **Register/Login** to create a user profile.
2. **Create a Lobby**: Set a name, boot amount (entry fee per game), and initial wallet balance.
3. **Invite Friends**: Share the **Lobby ID** or Name. Friends invoke "Join Lobby" from their dashboard.
4. **Start Game**: The Admin (Lobby Creator) clicks "Start Game" and sets the initial turn order.
5. **Play**:
   - Players take turns participating.
   - **Blind**: Play without seeing cards (Boot amount deducted).
   - **Seen**: Manually mark yourself as 'Seen' (if playing with physical cards) and bet (Current Stake).
   - **Raise**: Increase the current stake.
   - **Side Show**: Request a show (if 2 players remain).
6. **End Game**: When a winner is decided (or all others fold), the Admin selects the winner to transfer the Pot to their wallet.

## ⚠️ Troubleshooting

- **CORS Errors**: Ensure you are accessing the backend via the correct URL. The code is configured to allow connections from `file://` (local HTML opening) via `http://localhost:3000`.
- **Socket Connection**: If real-time updates fail, ensure the backend server is running and the client is connecting to `http://localhost:3000`.

## 📄 License
MIT
