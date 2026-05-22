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


class AgentBeliefs:
    def __init__(self, game_state, player_index):
        p = game_state.players[player_index]
        self.my_id = p.id
        self.my_name = p.name
        self.my_wealth = p.total_money()
        self.my_score = p.current_score()
        self.my_bid = p.bid_total()
        self.my_hand = list(p.hand)
        self.my_tableau = list(p.tableau)
        
        # Track opponents
        self.opponents = []
        for idx, pl in enumerate(game_state.players):
            if idx != player_index:
                self.opponents.append({
                    'id': pl.id,
                    'name': pl.name,
                    'wealth': pl.total_money(),
                    'score': pl.current_score(),
                    'bid': pl.bid_total(),
                    'has_passed': pl.has_passed,
                    'hand_size': len(pl.hand),
                    'tableau': list(pl.tableau)
                })
        
        # General state
        self.auction_type = game_state.auction_type
        self.current_card = game_state.current_auction_card
        self.highest_bid = game_state.get_highest_bid()
        self.end_game_triggers = game_state.end_game_triggers_revealed
        self.total_players = len(game_state.players)
        
        # Calculate financial rankings
        all_money = sorted([pl.total_money() for pl in game_state.players], reverse=True)
        self.poorest_money = all_money[-1]
        self.richest_money = all_money[0]
        self.is_poorest = (self.my_wealth == self.poorest_money)
        self.is_richest = (self.my_wealth == self.richest_money)
        
        # Find margin to poorest opponent's cash
        opp_money = [opp['wealth'] for opp in self.opponents]
        self.poorest_opp_money = min(opp_money) if opp_money else 0
        self.margin_to_poorest = self.my_wealth - self.poorest_opp_money
        
        # Calculate score leadership
        all_scores = [pl.current_score() for pl in game_state.players]
        self.leader_score = max(all_scores) if all_scores else 0
        self.is_leader = (self.my_score == self.leader_score)


class AgentBasedCPU(CPUStrategy):
    def execute_turn(self, game_state, player_index):
        if game_state.status != "in_progress":
            return
            
        p = game_state.players[player_index]
        if not p.is_cpu or p.has_passed:
            return
            
        # Parse beliefs
        beliefs = AgentBeliefs(game_state, player_index)
        
        # Evaluate PASS utility
        pass_utility = self.evaluate_action(beliefs, 'pass')
        
        # Generate and evaluate all valid BID options
        best_action = 'pass'
        best_combo = None
        max_utility = pass_utility
        
        # Calculate all combinations of added cards up to 3 cards
        for r in range(1, min(4, len(p.hand) + 1)):
            for combo in itertools.combinations(p.hand, r):
                bid_added = sum(combo)
                new_bid = p.bid_total() + bid_added
                
                # Check validity: bid must beat the highest bid
                if new_bid <= beliefs.highest_bid:
                    continue
                    
                # Evaluate this bid combination
                bid_utility = self.evaluate_action(beliefs, 'bid', list(combo))
                if bid_utility > max_utility:
                    max_utility = bid_utility
                    best_action = 'bid'
                    best_combo = list(combo)
                    
        # Execute selected action
        if best_action == 'bid' and best_combo is not None:
            game_state.bid(player_index, best_combo)
        else:
            game_state.pass_auction(player_index)
            
    def evaluate_action(self, beliefs, action_type, bid_combo=None):
        card = beliefs.current_card
        
        # Determine remaining wealth after this action
        if action_type == 'pass':
            remaining_wealth = beliefs.my_wealth
        else:
            remaining_wealth = beliefs.my_wealth - sum(bid_combo)
            
        # 1. Wealth Utility (Avoiding poverty elimination)
        wealth_utility = self.calculate_wealth_utility(beliefs, remaining_wealth)
        
        # 2. Card Utility (Points/Multipliers gain vs. Penalties taking)
        card_utility = self.calculate_card_utility(beliefs, card, action_type)
        
        # 3. Tactical Utility (Poverty Trap etc.)
        tactical_utility = self.calculate_tactical_utility(beliefs, action_type)
        
        # 4. Waste Penalty
        waste_penalty = 0.0
        if action_type == 'bid':
            added_sum = sum(bid_combo)
            new_bid_total = beliefs.my_bid + added_sum
            waste = new_bid_total - (beliefs.highest_bid + 1)
            
            waste_factor = 2.5
            if len(beliefs.my_hand) < 5:
                waste_factor = 1.0
            waste_penalty = max(0, waste) * waste_factor
            
        return wealth_utility + card_utility + tactical_utility - waste_penalty

    def calculate_wealth_utility(self, beliefs, remaining_money):
        poorest_opp = beliefs.poorest_opp_money
        margin = remaining_money - poorest_opp
        
        game_urgency = 1.0 + (beliefs.end_game_triggers * 1.5)
        
        if margin < 0:
            utility = margin * 8.0 * game_urgency
        elif margin == 0:
            utility = -15.0 * game_urgency
        elif margin <= 5:
            utility = (margin - 6) * 3.0 * game_urgency
        else:
            utility = margin * 0.1
            
        return utility

    def calculate_card_utility(self, beliefs, card, action_type):
        if beliefs.auction_type == 'positive':
            if action_type == 'pass':
                return 0.0
                
            if card.type == 'point':
                desperation = 1.0 + (max(0, beliefs.leader_score - beliefs.my_score) / 20.0)
                return card.value * 5.0 * desperation
            elif card.type == 'multiplier':
                marginal_value = max(beliefs.my_score, 10.0)
                return marginal_value * 5.0
                
        else: # negative auction
            if action_type == 'bid':
                return 0.0
                
            if card.name == 'Faux Pas':
                multiplier_count = sum(1 for c in beliefs.my_tableau if c.type == 'multiplier')
                multiplier_factor = 2 ** multiplier_count
                loss = 5.0 * multiplier_factor
                return -loss * 6.0
                
            elif card.name == 'Scandale':
                loss = beliefs.my_score / 2.0
                return -max(loss, 6.0) * 6.0
                
            elif card.name == 'Theft':
                point_cards = [c.value for c in beliefs.my_tableau if c.type == 'point']
                loss = max(point_cards) if point_cards else 5.0
                return -loss * 6.0
                
        return 0.0

    def calculate_tactical_utility(self, beliefs, action_type):
        if beliefs.auction_type == 'positive' and action_type == 'pass':
            highest_bidder = None
            for opp in beliefs.opponents:
                if opp['bid'] == beliefs.highest_bid and beliefs.highest_bid > 0:
                    highest_bidder = opp
                    break
                    
            if highest_bidder:
                is_poorest_opp = (highest_bidder['wealth'] == beliefs.poorest_money)
                if is_poorest_opp and highest_bidder['bid'] > highest_bidder['wealth'] * 0.15:
                    return 25.0
                    
        return 0.0
