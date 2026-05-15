# High Society: The Ape Aristocracy

A digital implementation of the classic auction and bidding game "High Society" by Reiner Knizia, featuring a premium "Ape Aristocracy" theme, glassmorphic UI design, and computer AI players.

## Game Rules

Players bid on Luxury and Prestige cards while trying to avoid Disgrace cards. The game ends instantly when the fourth "End Game" card (Scandale or a Prestige card) is revealed. 

The player with the most points wins. However, there's a catch: **the player with the least money left at the end of the game is instantly eliminated**, regardless of their points! 

For full rules, see `game_instructions.md`.

## Features
- Complete implementation of the High Society ruleset (including tie-breakers and the Theft pending rule).
- Hot-seat multiplayer support.
- Heuristic-based Computer AI Players to play against.
- Sleek, modern, responsive UI built with Vanilla JS and CSS.
- Flask-based stateful REST API backend.

## Running the Game

1. Install requirements:
   ```bash
   pip install -r requirements.txt
   ```
2. Start the server:
   ```bash
   python app.py
   ```
3. Open your browser to `http://127.0.0.1:5000`

## Architecture
- `engine.py`: The core, pure-Python logic engine for the game state, card interactions, and AI decision making.
- `app.py`: The Flask wrapper exposing RESTful APIs.
- `templates/index.html` & `static/`: The frontend application.
