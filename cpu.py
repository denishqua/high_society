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

class DefaultHeuristicCPU(CPUStrategy):
    def execute_turn(self, game_state, player_index):
        if game_state.status != "in_progress":
            return
            
        p = game_state.players[player_index]
        if not p.is_cpu or p.has_passed:
            return
            
        card = game_state.current_auction_card
        highest_bid = game_state.get_highest_bid()
        num_players = len(game_state.players)
        
        if game_state.auction_type == 'positive':
            # Smarter: scale willingness directly by card value and player count
            player_multiplier = num_players / 2.0
            
            if card.type == 'multiplier':
                max_willing = 15 * player_multiplier
            else:
                max_willing = card.value * player_multiplier
                
            # Prevent bidding more than we actually have
            if max_willing > p.total_money():
                max_willing = p.total_money()
                
            valid_combos = []
            for i in range(1, 4): # max 3 cards
                for combo in itertools.combinations(p.hand, i):
                    total = p.bid_total() + sum(combo)
                    if total > highest_bid and total <= max_willing:
                        valid_combos.append(list(combo))
                        
            if valid_combos:
                # Prioritize combinations with the lowest bid amount, but penalize using multiple cards
                # because having spare change (more cards) is useful. We implicitly value a card at ~2.5 bananas.
                valid_combos.sort(key=lambda x: sum(x) + len(x) * 2.5)
                game_state.bid(player_index, valid_combos[0])
            else:
                game_state.pass_auction(player_index)
        else:
            # Negative auction
            max_avoidance_bid = 5
            if card.name == 'Scandale':
                max_avoidance_bid = 15 # Worth fighting to avoid
            elif card.name == 'Theft':
                max_avoidance_bid = 10
            elif card.name == 'Faux Pas':
                max_avoidance_bid = 6
                
            # Still cap at ~30% of total money to avoid going broke early for a penalty
            if highest_bid >= max_avoidance_bid or highest_bid >= p.total_money() * 0.3:
                game_state.pass_auction(player_index)
            else:
                # find smallest card to bid
                hand_sorted = sorted(p.hand)
                valid_card = None
                for c in hand_sorted:
                    if p.bid_total() + c > highest_bid:
                        valid_card = c
                        break
                
                if valid_card:
                    game_state.bid(player_index, [valid_card])
                else:
                    game_state.pass_auction(player_index)
