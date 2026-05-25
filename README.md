# High Society: Digital Implementations

This repository contains two digital implementations of Reiner Knizia's classic auction and bidding board game **High Society**. The workspace has been organized into two separate subfolders to prevent any dependency conflicts.

---

## The Two Versions: Key Differences

| Feature | 1. Local Hotseat (`hotseat/`) | 2. Unified Network Multiplayer (`multiplayer/`) |
| :--- | :--- | :--- |
| **Technology** | Python (Flask REST API) & HTML/CSS/JS | Node.js (Express & Socket.io) |
| **Play Style** | Same-screen "hotseat" (passing a laptop/device) | Separate devices (everyone plays on their own phone) |
| **Opponents** | Supports human players + heuristic computer AI bots | Purely human-to-human local or internet multiplayer |
| **Layout** | Single shared display | **Unified Mobile Dashboard**: Renders the complete board state (bids, tableaus, ticker) and private hands on one screen |
| **UX Additions** | Premium Ape Aristocracy Theme | Synthesized Audio Turn Chimes, Selectable Avatars, pre-populated fun titles, and a synchronized 30s Turn Timer |

---

## 1. Local Hotseat Implementation (`hotseat/`)

Ideal for playing against computer AI bots or sitting together passing a single laptop/tablet around.

### Setup & Launch
1. Ensure Python 3 is installed.
2. Open your terminal in the `hotseat/` directory:
   ```bash
   cd hotseat
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Run the Flask server:
   ```bash
   python app.py
   ```
5. Open your browser to `http://127.0.0.1:5000` to start playing.

---

## 2. Unified Network Multiplayer Implementation (`multiplayer/`)

Ideal for playing with friends where **everyone joins on their own mobile phone**. 
Each device shows a beautiful glassmorphic dashboard: the public board elements (cards left, won assets, other players' bids) on top, and their private banknotes hand + bidding controls at the bottom.

### Features
* **Selectable Avatars & Titles**: Pre-populates a random funny Ape Aristocracy title (like *Archduke Orangutan*) and lets players pick an avatar (🦁, 🦊, 🦍, 🐨, 🐸, 🐼, 👑, 🎩).
* **Synthesized Turn Chime**: Uses browser-native Web Audio API to play a gorgeous crystal chord bell strike on the active player's phone when their turn starts.
* **30-Second Turn Timer**: Keeps players moving! A synchronized visual timer ticks down from 30s. If it hits 0s, the server automatically passes for them, returns their table bid, and advances the turn.
* **Collapsible Ticker**: Collapses the game logs chronicle natively to save screen space, fully expandable with a single tap.
* **Lobby Kick Support**: The lobby leader (first player to join) can kick players from the lobby before starting.
* **Session Persistence**: If a phone screen goes to sleep or connection drops, simply refreshing/reopening the page instantly reconnects the player back to their seat, hand, and active bidding pool.

### Setup & Launch
1. Ensure Node.js (v18+) is installed.
2. Open your terminal in the `multiplayer/` directory:
   ```bash
   cd multiplayer
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the Express/Socket.io server:
   ```bash
   node server.js
   ```

### Exposing the Game for Friends (Mobile Play)
Since the server listens globally on port `3000`, you can easily invite friends to join from their devices:

#### Option A: Expose via Pinggy Tunnel (Recommended for Remote Friends / Cellular)
Open a new terminal window on your host computer and run the following command to instantly expose the local server globally:
```bash
ssh -p 443 -R 0:localhost:3000 -o StrictHostKeyChecking=no free@a.pinggy.io
```
This command will output a public URL (e.g. `https://randomsubdomain.pinggy.link`). Text this URL to your friends, and they can tap it on their phones to join the lobby instantly!

#### Option B: Local Wi-Fi (For Friends on the Same Router)
Invite friends to connect to your Wi-Fi, and open their phone browsers to your local computer IP address:
`http://<your-computer-local-ip>:3000`
