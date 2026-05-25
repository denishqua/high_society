# High Society: Digital Implementations

This repository contains two digital implementations of Reiner Knizia's classic auction and bidding board game **High Society**. The workspace has been organized into two separate subfolders to prevent any dependency conflicts.

---

## Workspace Structure

* [**`hotseat/`**](file:///Users/denis/Projects/high_society/hotseat/)
  An "Ape Aristocracy" themed digital implementation of High Society designed for local, same-screen "hotseat" multiplayer and playing against computer AI opponents. Built with Python (Flask, REST API, heuristic and agent-based CPUs) and modern vanilla HTML/CSS.
* [**`multiplayer/`**](file:///Users/denis/Projects/high_society/multiplayer/)
  A completely standalone, real-time multiplayer implementation designed for playing with friends on their own mobile devices over your local network or public tunnels (e.g., Pinggy). Built with Node.js, Express, and WebSockets (Socket.io).

---

## 1. Local Hotseat Implementation (`hotseat/`)

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
5. Open your browser to `http://127.0.0.1:5000`.

---

## 2. Local Network Multiplayer Implementation (`multiplayer/`)

### Architecture
* **The Central Display (`/board`)**: Shared TV or laptop screen hosting the main physical board. Shows status cards, active bidding pools, player statuses, and final results.
* **The Player Controller (`/`)**: Mobile phone interface. Displays private hands ($1k–$25k), and handles interactive bidding/passing.
* **Network Tunneling Ready**: Listens globally on `0.0.0.0:3000` to seamlessly accept incoming tunnels (e.g. Pinggy, Ngrok) or direct local network IP connections.

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
5. **Accessing the Game**:
   * **Central Display**: Connect your laptop/TV to `http://<your-computer-ip>:3000/board`.
   * **Players (Mobile)**: Scan a QR code of your local computer IP or tunnel URL pointing to `http://<your-computer-ip>:3000/` to join the game!
