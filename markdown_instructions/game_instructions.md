# Game Definition: High Society
**Designer:** Reiner Knizia
**Player Count:** 3–5 players

---

## 1. Component List

### Money Cards (Player Hands)
* **Total:** 55 cards (5 identical sets of 11 cards, one set per player).
* **Values per set:** `1, 2, 3, 4, 5, 8, 10, 12, 15, 20, 25`.
* **Behavior:** Hidden in hand until played. Once spent to win an auction, they are discarded permanently from the game.

### Status Cards (Auction Deck)
* **Total:** 16 cards, drawn one by one to act as the auction targets.
* **Point Cards (10 total):**
    * Values: `1, 2, 3, 4, 5, 6, 7, 8, 9, 10`.
    * Effect: Adds the face value to the player's final score.
* **Multiplier Cards (3 total):**
    * Values: `x3` (Multiplier).
    * Effect: Triples the player's final score.
    * **State Tag:** `[End-Game Trigger]` (Historically marked with a dark green background).
* **Penalty Cards (3 total):**
    * **Faux Pas / Passé:** Subtracts `5` points from the player's final score.
    * **Theft / Forgery:** Forces the player to discard one of their acquired Point Cards. If the player has no Point Cards at the time this is acquired, the player's next acquired Point Card will be discarded instead.
    * **Scandale:** Halves the player's final score (divide by 2).
    * **State Tag (Scandale Only):** `[End-Game Trigger]`.

*(Note: There are exactly 4 cards in the deck with the `[End-Game Trigger]` tag: the 3 Multiplier Cards and the 1 Scandale Card).*

---

## 2. Setup State
1.  Distribute one complete set of 11 Money Cards to each player.
2.  Shuffle all 16 Status Cards to form a single face-down Auction Deck.
3.  Randomly select a starting player.

---

## 3. Core Gameplay Loop (The Auction)
The game proceeds in rounds. At the start of a round, reveal the top card of the Auction Deck. The auction type depends on the revealed card.

### A. Positive Auctions (Point & Multiplier Cards)
* **Goal:** Players bid to **win** the card.
* **Turn Logic:**
    1.  The starting player begins by either making a bid or passing.
    2.  **Bidding:** To bid, a player places Money Cards face-up in front of them, announcing the total.
    3.  **Raising a Bid:** If a player already has an active bid on the table and it comes back to their turn, they may increase their bid by adding *more* Money Cards. **Constraint:** A player cannot pick up their current bid to make change (e.g., you cannot replace a `5` bid with a `10` card to bid 10; you must add a `5` card to your existing `5`).
    4.  **Passing:** If a player passes, they drop out of the current auction and return any Money Cards they had bid back into their hand.
* **Resolution:**
    * Bidding continues clockwise until all players but one have passed.
    * The remaining player **wins** the Status Card, places it face-up in their tableau, and **discards** the Money Cards they bid.
    * **Note:** If everyone else passes (e.g., the first players all pass), the last remaining player automatically wins the card for free (a bid of 0).
    * The winning player becomes the starting player for the next round.

### B. Negative Auctions (Penalty Cards)
* **Goal:** Players bid to **avoid** the card.
* **Turn Logic:**
    1.  Bidding proceeds exactly as in a Positive Auctions, with players laying down Money Cards to increase the bid and stay in the round.
* **Resolution:**
    * The auction ends the moment the **first player passes**.
    * The player who passes **receives** the Penalty Card and places it in their tableau.
    * **Important Constraint:** The player who passed gets to take their bid Money Cards *back into their hand*. All other players (who successfully avoided the card) must **discard** the Money Cards they had on the table.
    * The player who took the Penalty Card becomes the starting player for the next round.

---

## 4. Game End Trigger
* The game ends **immediately** the moment the **4th** card with the `[End-Game Trigger]` tag is revealed from the deck.
* This 4th card is **not** auctioned. The game halts exactly at the reveal state.

---

## 5. Elimination & Final Scoring Logic

### Phase 1: The Elimination (Cast Out)
1.  All players reveal their unspent Money Cards.
2.  Sum the total financial value for each player.
3.  The player (or players, in the event of a tie) with the **lowest** total money is immediately eliminated from the game. They cannot win, regardless of their Status Cards.

### Phase 2: Final Scoring (For Remaining Players)
For the players who survived elimination, calculate their final score sequentially:

1.  **Base Score:** Sum the values of all acquired Point Cards.
2.  **Apply Flat Penalty:** Subtract `5` if the player holds the *Faux Pas / Passé* Penalty Card. *(Note: Base scores can drop below zero).*
3.  **Apply Multipliers:** Multiply the current score by `3` for every Multiplier Card held. (e.g., 1 card = x3, 2 cards = x9, 3 cards = x27).
4.  **Apply Divisors:** If the player holds the *Scandale* Penalty Card, divide the final total by `2` (standard logic rounds up to the nearest integer).

### Tie-Breaker Logic
1.  The non-eliminated player with the highest final score wins.
2.  If tied, the tied player with the **most unspent money** wins.
3.  If still tied, the tied player with the **single highest-value Point Card** wins.