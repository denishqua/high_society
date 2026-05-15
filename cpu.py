from abc import ABC, abstractmethod
import itertools

class CPUStrategy(ABC):
    @abstractmethod
    def execute_turn(self, game_state, player_index):
        """
        Evaluate the game_state and submit an action (bid or pass) 
        for the player at player_index.
        """
        pass

class AdvancedHeuristicCPU(CPUStrategy):
    def execute_turn(self, game_state, player_index):
        if game_state.status != "in_progress":
            return
            
        p = game_state.players[player_index]
        if not p.is_cpu or p.has_passed:
            return
            
        card = game_state.current_auction_card
        highest_bid = game_state.get_highest_bid()
        num_players = len(game_state.players)
        
        # --- 1. State Tracking ---
        unseen_cards = game_state.auction_deck
        end_game_triggers = game_state.end_game_triggers_revealed
        
        scores = {pl.id: pl.current_score() for pl in game_state.players}
        my_score = scores[p.id]
        leader_score = max(scores.values()) if scores else 0
        
        money_list = sorted([pl.total_money() for pl in game_state.players], reverse=True)
        my_money = p.total_money()
        my_financial_rank = money_list.index(my_money) + 1 # 1st = richest
        
        # --- 2. Base Valuation Logic ---
        base_multiplier = 1.5 + ((num_players - 3) * 0.25)
        max_bid = 0
        
        if game_state.auction_type == 'positive':
            if card.type == 'point':
                max_bid = card.value * base_multiplier
            elif card.type == 'multiplier':
                estimated_value = max(my_score, 10)
                max_bid = estimated_value * base_multiplier
        else:
            if card.name == 'Faux Pas':
                max_bid = 8 * (num_players / 3)
            elif card.name == 'Theft':
                highest_card = max([c.value for c in p.tableau if c.type == 'point'], default=0)
                if highest_card == 0:
                    max_bid = 5 * base_multiplier
                else:
                    max_bid = highest_card * base_multiplier
            elif card.name == 'Scandale':
                max_bid = max(my_score / 2, 5) * base_multiplier

        # --- 3. Tactical Overrides ---
        tactic_used = None
        
        if game_state.auction_type == 'negative':
            # Tactic 1: Nothing to Lose Bluff
            trigger_bluff = False
            if card.name == 'Faux Pas' and my_score <= 0:
                trigger_bluff = True
            elif card.name == 'Scandale' and my_score <= 3:
                trigger_bluff = True
            elif card.name == 'Theft':
                highest_card = max([c.value for c in p.tableau if c.type == 'point'], default=0)
                has_points = any(c.type == 'point' for c in p.tableau)
                if has_points and highest_card <= 3:
                    trigger_bluff = True
                    
            if trigger_bluff:
                safe_bluff_limit = 5
                if highest_bid < safe_bluff_limit:
                    max_bid = safe_bluff_limit
                    tactic_used = "bluff"
                else:
                    game_state.pass_auction(player_index)
                    return
                    
        elif game_state.auction_type == 'positive':
            # Catch-Up override
            if (leader_score - my_score) > 7:
                max_bid *= ((base_multiplier + 0.5) / base_multiplier) # Apply desperation multiplier
                tactic_used = "catch-up"
            else:
                # Deck-Aware Discount
                is_leader = my_score == leader_score and sum(1 for v in scores.values() if v == leader_score) == 1
                if is_leader and card.type == 'point' and card.value >= 8:
                    cheaper_points_left = any(c.type == 'point' and c.value <= 5 for c in unseen_cards)
                    multiplier_left = sum(1 for c in unseen_cards if c.type == 'multiplier')
                    if cheaper_points_left and multiplier_left <= 1:
                        max_bid = 5 # Deflate
                        tactic_used = "discount"
            
            # Poverty Trap
            if end_game_triggers >= 1 and (leader_score - my_score) <= 5:
                poorest_money = min(money_list)
                poorest_players = [pl for pl in game_state.players if pl.total_money() == poorest_money]
                if len(poorest_players) == 1 and poorest_players[0].id != p.id:
                    target = poorest_players[0]
                    if target.current_bid and sum(c.value for c in target.current_bid) > 0:
                        max_bid = target.total_money() + 5 # Force them to spend
                        tactic_used = "poverty-trap"

        if game_state.auction_type == 'negative' and tactic_used != "bluff" and end_game_triggers >= 1:
            # Poverty trap for negative
            poorest_money = min(money_list)
            poorest_players = [pl for pl in game_state.players if pl.total_money() == poorest_money]
            if len(poorest_players) == 1 and poorest_players[0].id != p.id:
                game_state.pass_auction(player_index)
                return

        # Cap max_bid by our actual money
        if max_bid > p.total_money():
            max_bid = p.total_money()

        # Decision Check
        if game_state.auction_type == 'negative' and tactic_used != "bluff":
            # For negative, we bid to avoid. If table is already high, we pass.
            if highest_bid >= max_bid or highest_bid >= p.total_money() * 0.3:
                game_state.pass_auction(player_index)
                return

        if game_state.auction_type == 'positive':
            if highest_bid >= max_bid:
                game_state.pass_auction(player_index)
                return

        # --- 4. Opponent Modeling & Change Denial ---
        target_bid = highest_bid + 1
        
        # Find next active opponent
        next_idx = (player_index + 1) % num_players
        while game_state.players[next_idx].has_passed or next_idx == player_index:
            next_idx = (next_idx + 1) % num_players
            
        if next_idx != player_index:
            next_p = game_state.players[next_idx]
            base_opp_bid = next_p.bid_total()
            
            # Calculate all possible totals they can make
            opp_possible = set([base_opp_bid])
            for r in range(1, min(4, len(next_p.hand) + 1)):
                for combo in itertools.combinations(next_p.hand, r):
                    opp_possible.add(base_opp_bid + sum(combo))
            
            opp_possible = sorted(list(opp_possible))
            
            # Find a gap right above current highest_bid
            for i in range(len(opp_possible) - 1):
                if opp_possible[i] > highest_bid and opp_possible[i] <= max_bid:
                    if opp_possible[i+1] > opp_possible[i] + 1:
                        target_bid = opp_possible[i]
                        break
            
        # --- 5. Greedy Card Selection ---
        best_combo = None
        min_waste = float('inf')
        
        my_current_bid_total = p.bid_total()
        
        # We need sum(combo) + my_current_bid_total >= target_bid
        for r in range(1, min(4, len(p.hand) + 1)):
            for combo in itertools.combinations(p.hand, r):
                bid_sum = my_current_bid_total + sum(combo)
                if bid_sum >= target_bid and bid_sum <= max_bid:
                    waste = bid_sum - target_bid
                    # Tie-break by using smaller cards (more cards means smaller average size)
                    score = waste + len(combo) * 0.1
                    if score < min_waste:
                        min_waste = score
                        best_combo = list(combo)
                        
        if best_combo is not None:
            waste = (my_current_bid_total + sum(best_combo)) - target_bid
            if waste > 5:
                game_state.pass_auction(player_index)
            else:
                game_state.bid(player_index, best_combo)
        else:
            game_state.pass_auction(player_index)
