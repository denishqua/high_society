# High Society: CPU AI Strategy Specification

This document outlines the heuristic-based strategy for a CPU agent playing the board game *High Society*. It is structured logically for easy translation into AI decision-making code (e.g., state evaluation, bid calculation, and action selection).

---

## 1. State Tracking & Memory Requirements
To execute this strategy, the CPU requires **Perfect Information Tracking**.

* **`Opponent_Hands`**: A map tracking the exact Money Cards remaining in each opponent's hand (since spent cards are public).
* **`Table_Bids`**: The current active money on the table for each player in the current auction.
* **`Unseen_Cards`**: An array tracking the unrevealed Status Cards remaining in the deck.
* **`End_Game_Triggers`**: An integer (0-3) tracking how many Prestige + Scandale cards have been revealed.
* **`Player_Scores`**: A real-time calculation of every player's current points (Luxury sum - Faux Pas + Prestige Multipliers / Scandale Divisors).
* **`Financial_Rank`**: The CPU's rank based on total remaining money (1st = richest, Last = poorest).
* **`Player_Count`**: The number of active players (3 to 5).

---

## 2. Base Valuation Logic (`Max_Bid` Calculation)
Before any tactical overrides, the CPU calculates a base `Max_Bid` for the current Status Card. It will never bid above this threshold unless an override dictates it.

### Bidding Multiplier (Scaled by Player Count)
More players mean more competition, less money to go around per person, and higher average winning bids for critical cards. The base valuation scales accordingly:
* **`Base_Multiplier`** = `1.5 + ((Player_Count - 3) * 0.25)` 
  *(e.g., 3 players = 1.5x, 4 players = 1.75x, 5 players = 2.0x)*

### A. Positive Auctions (Bid to Win)
* **Luxury Cards (Values 1-10):**
    * `Max_Bid` = `Face Value * Base_Multiplier`
* **Prestige Cards (x3 Multiplier):**
    * The `x3` multiplies the *final* score, meaning acquiring it early when a score is 0 or negative is still highly valuable for future point acquisitions.
    * `Estimated_Value` = `max(CPU_Current_Score, 10)` *(Assumes the CPU will score at least 10 base points by the end of the game)*
    * `Max_Bid` = `Estimated_Value * Base_Multiplier`

### B. Negative Auctions (Bid to Avoid)
* **Faux Pas (-5 points):** 
    * `Max_Bid = 8 * (Player_Count / 3)` money.
* **Theft / Forgery (Discard a Point Card):** 
    * Identify the CPU's highest acquired Luxury Card. `Max_Bid` = `Highest_Card_Value * Base_Multiplier`.
    * *Exception:* If no Point Cards, the CPU will lose its *next* acquired Point Card. `Max_Bid` = `5 * Base_Multiplier` (Estimating the average future card lost).
* **Scandale (/2 Divisor):** 
    * `Max_Bid` = `max(CPU_Current_Score / 2, 5) * Base_Multiplier`. 

---

## 3. Tactical Overrides (Evaluated Before Action)
Before generating a bid, the CPU checks if the game state triggers any specialized tactics.

### Tactic 1: The "Nothing to Lose" Override (Negative Auctions)
**Trigger Conditions (Any):**
* Card is **Faux Pas** AND CPU score <= 0.
* Card is **Scandale** AND CPU score <= 3.
* Card is **Theft/Forgery** AND CPU's highest currently held point card is <= 3. *(Note: If CPU has 0 point cards, do NOT trigger this override, as the penalty will apply to a potentially high-value future card).*

**Execution (The Bluff):**
1. CPU sets a `Safe_Bluff_Limit` of `4` to `6` total money.
2. If `Current_Table_Bid < Safe_Bluff_Limit`, the CPU incrementally bids using its smallest available cards (`1`, `2`, `3`) to artificially inflate the auction price.
3. If `Current_Table_Bid >= Safe_Bluff_Limit`, or the CPU runs out of small cards, the CPU **PASSES**, taking the negligible penalty and returning its bluff money to its hand, forcing opponents to discard their inflated bids.

### Tactic 2: Deck-Aware "Good Enough" Discount (Positive Auctions)
**Trigger Conditions (All):**
1. CPU is in 1st place for points by a safe margin.
2. Current card is a high-value Luxury Card (`8`, `9`, `10`).
3. `Unseen_Cards` contains cheaper Luxury Cards (`3`, `4`, `5`).
4. `Unseen_Cards` does NOT contain enough Prestige cards for a trailing opponent to realistically bridge the point gap.

**Execution:**
1. CPU deflates its `Max_Bid` for the current card (e.g., capping a `10` card at `5` money).
2. CPU bids small initially to test the waters. Once opponents bid aggressively, CPU **PASSES**, letting them burn resources while the CPU saves money for cheaper cards later.

### Tactic 3: The Poverty Trap & Catch-Up (State Dependent)
**Trigger Condition: Catch-Up (Highest Priority)**
* If the CPU is losing on points (trailing the leader by > 7 points): Apply a **Desperation Multiplier** (e.g., `Base_Multiplier + 0.5`) to `Max_Bid` for Positive Auctions. Ignore opponent financial states. 

**Trigger Condition: Poverty Trap (Late Game)**
* If `End_Game_Triggers >= 1` AND CPU is highly competitive in points AND one specific opponent has significantly lower money than everyone else (The Target).
* **Execution:** If The Target bids in a Positive Auction, CPU immediately outbids them to force them to spend their remaining safety net or starve them of points. If it's a Negative Auction, CPU passes immediately to force The Target to take the penalty or spend their last money.

---

## 4. Bidding Execution & Change Denial 
When the CPU decides to bid (and `Current_Table_Bid < Max_Bid`), it must select which cards to play. It uses Perfect Information to weaponize the "no change given" rule.

### Step 1: Opponent Modeling
1. Identify the next active opponent (or the biggest point threat).
2. Calculate their `Possible_Totals` array (Current Table Money + all possible combinations of cards in their hand).
3. Identify numerical gaps in their `Possible_Totals`.

### Step 2: Target Bid Calculation
1. CPU selects a `Target_Bid` that lands exactly at the top of an opponent's numerical gap. 
    * *Example:* If opponent's possible totals are `8, 15, 20`, CPU attempts to bid exactly `8` to force the opponent to jump straight to `15` to stay in.
2. If no gap can be exploited, `Target_Bid` = `Current_Table_Bid + 1`.

### Step 3: Card Selection (Greedy Algorithm)
1. CPU searches its hand for a combination of cards to exactly match `Target_Bid` (using existing table cards + new cards).
2. Prioritize using the fewest number of high-value cards possible, or combining small cards (`1`, `2`, `3`).
3. **The Waste Check:** If the CPU must overpay to raise (e.g., dropping a `20` card to raise a `4` bid), it calculates `Waste = Card_Played - Target_Bid`. If `Waste > 5`, the CPU **PASSES** instead of making a highly inefficient play.

### Step 4: Action
* Return `BID [Array of Cards]` or `PASS`.