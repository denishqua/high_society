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

        # --- 2.5 Dynamic Risk-Based Bidding (Poverty Avoidance) ---
        if len(money_list) > 1:
            is_poorest = (my_money == money_list[-1])
            is_richest = (my_money == money_list[0])
            
            if is_poorest:
                # We are the poorest player. Drastically reduce max_bid to survive.
                danger_factor = 0.4 if end_game_triggers >= 2 else 0.7
                max_bid *= danger_factor
            elif is_richest:
                # We are the richest player. Leverage our wealth aggressively.
                safety_margin = my_money - money_list[1]
                if safety_margin > 10:
                    max_bid *= 1.25
                else:
                    max_bid *= 1.1
            else:
                # Middle of the pack, but if close to poorest, be careful
                margin_to_poorest = my_money - money_list[-1]
                if margin_to_poorest <= 5:
                    danger_factor = 0.6 if end_game_triggers >= 2 else 0.8
                    max_bid *= danger_factor

        # --- 3. Tactical Overrides ---
        tactic_used = None
        
        if game_state.auction_type == 'negative':
            # Tactic 1: Nothing to Lose Bluff (Only if not poorest)
            is_poorest = len(money_list) > 1 and (my_money == money_list[-1])
            trigger_bluff = False
            if not is_poorest:
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
            
            # Poverty Trap (let-them-spend)
            # If the poorest player is someone else and they have bid significantly,
            # let them win so they spend their money and get eliminated!
            if end_game_triggers >= 1 and tactic_used is None:
                poorest_money = min(money_list)
                poorest_players = [pl for pl in game_state.players if pl.total_money() == poorest_money]
                if len(poorest_players) == 1 and poorest_players[0].id != p.id:
                    target = poorest_players[0]
                    # If the poorest player has bid more than 15% of their total money
                    if target.bid_total() > target.total_money() * 0.15:
                        max_bid = target.bid_total() - 1  # Force ourselves to pass and let them spend
                        tactic_used = "let-them-spend"

        if game_state.auction_type == 'negative' and tactic_used != "bluff" and end_game_triggers >= 1:
            # Poverty Avoidance for negative: if we are the poorest player, pass immediately to conserve all money
            poorest_money = min(money_list)
            poorest_players = [pl for pl in game_state.players if pl.total_money() == poorest_money]
            if len(poorest_players) == 1 and poorest_players[0].id == p.id:
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
        
        # Find next active opponent (safely, avoiding infinite loop if no other active player)
        next_idx = (player_index + 1) % num_players
        found_active_opponent = False
        for _ in range(num_players - 1):
            if not game_state.players[next_idx].has_passed:
                found_active_opponent = True
                break
            next_idx = (next_idx + 1) % num_players
            
        if found_active_opponent and next_idx != player_index:
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
        
        # Calculate dynamic waste tolerance based on card value and hand size
        card_importance = 1.0
        if card.type == 'multiplier':
            card_importance = 2.0
        elif card.type == 'point':
            card_importance = card.value / 5.0  # Point 10 -> 2.0, Point 5 -> 1.0, Point 1 -> 0.2
        elif card.type == 'penalty':
            card_importance = 1.5
            
        waste_tolerance = 5.0 * card_importance
        
        # Increase tolerance if hand is small (less options means we have to overpay)
        if len(p.hand) < 5:
            waste_tolerance += (5 - len(p.hand)) * 3.0
        
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
            if waste > waste_tolerance:
                game_state.pass_auction(player_index)
            else:
                game_state.bid(player_index, best_combo)
        else:
            game_state.pass_auction(player_index)
