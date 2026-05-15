import random
import itertools
from cpu import DefaultHeuristicCPU

class StatusCard:
    def __init__(self, name, card_type, value, is_end_game_trigger=False):
        self.name = name
        self.type = card_type  # 'point', 'multiplier', 'penalty'
        self.value = value
        self.is_end_game_trigger = is_end_game_trigger

    def __repr__(self):
        return f"<{self.name} ({self.type})>"

    def to_dict(self):
        return {
            'name': self.name,
            'type': self.type,
            'value': self.value,
            'is_end_game_trigger': self.is_end_game_trigger
        }

def get_initial_deck():
    return [
        StatusCard("Point 1", "point", 1),
        StatusCard("Point 2", "point", 2),
        StatusCard("Point 3", "point", 3),
        StatusCard("Point 4", "point", 4),
        StatusCard("Point 5", "point", 5),
        StatusCard("Point 6", "point", 6),
        StatusCard("Point 7", "point", 7),
        StatusCard("Point 8", "point", 8),
        StatusCard("Point 9", "point", 9),
        StatusCard("Point 10", "point", 10),
        StatusCard("Multiplier 1", "multiplier", 2, True),
        StatusCard("Multiplier 2", "multiplier", 2, True),
        StatusCard("Multiplier 3", "multiplier", 2, True),
        StatusCard("Faux Pas", "penalty", -5),
        StatusCard("Theft", "penalty", "discard_point"),
        StatusCard("Scandale", "penalty", "halve_score", True)
    ]

MONEY_CARDS = [1, 2, 3, 4, 5, 8, 10, 12, 15, 20, 25]

class Player:
    def __init__(self, player_id, name, is_cpu=False, cpu_strategy=None):
        self.id = player_id
        self.name = name
        self.is_cpu = is_cpu
        self.cpu_strategy = cpu_strategy
        self.hand = list(MONEY_CARDS)
        self.tableau = []
        self.current_bid = []
        self.has_passed = False
        self.pending_theft = 0

    def bid_total(self):
        return sum(self.current_bid)

    def total_money(self):
        return sum(self.hand)

    def current_score(self):
        base = sum(c.value for c in self.tableau if c.type == 'point')
        if any(c.name == "Faux Pas" for c in self.tableau):
            base -= 5
            
        multiplier_count = sum(1 for c in self.tableau if c.type == 'multiplier')
        score = base * (2 ** multiplier_count)
        
        if any(c.name == "Scandale" for c in self.tableau):
            import math
            score = math.ceil(score / 2.0)
            
        return score

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'hand': self.hand,
            'tableau': [c.to_dict() for c in self.tableau],
            'current_bid': self.current_bid,
            'has_passed': self.has_passed,
            'bid_total': self.bid_total(),
            'total_money': self.total_money(),
            'pending_theft': self.pending_theft,
            'is_cpu': self.is_cpu,
            'score': self.current_score()
        }

class GameState:
    def __init__(self):
        self.status = "waiting" # waiting, in_progress, round_over, finished
        self.players = []
        self.auction_deck = []
        self.current_auction_card = None
        self.auction_type = None
        self.end_game_triggers_revealed = 0
        self.current_player_index = 0
        self.starting_player_index = 0
        self.game_results = None
        self.game_log = []
        self.last_round_result = None

    def log(self, msg, log_type='info'):
        self.game_log.append({"msg": msg, "type": log_type})
        print(msg)

    def start_game(self, num_human, num_cpu, player_names=None):
        num_players = num_human + num_cpu
        if not (3 <= num_players <= 5):
            raise ValueError("Player count must be 3-5")
        
        self.players = []
        human_count = 0
        cpu_count = 0
        for i in range(num_players):
            if human_count < num_human:
                name = player_names[i] if player_names and i < len(player_names) else f"Player {human_count+1}"
                self.players.append(Player(i, name, is_cpu=False))
                human_count += 1
            else:
                cpu_names = ["Bot Chimington", "Bot Macaque", "Bot Baboon", "Bot Orangutan", "Bot Gorilla"]
                name = cpu_names[cpu_count % len(cpu_names)]
                self.players.append(Player(i, name, is_cpu=True, cpu_strategy=DefaultHeuristicCPU()))
                cpu_count += 1
            
        self.auction_deck = get_initial_deck()
        random.shuffle(self.auction_deck)
        self.starting_player_index = random.randint(0, num_players - 1)
        self.status = "in_progress"
        self.end_game_triggers_revealed = 0
        self.log(f"Game started with {num_players} players.", "start")
        
        self.start_round()

    def start_round(self):
        for p in self.players:
            p.has_passed = False
            p.current_bid = []
            
        if not self.auction_deck:
            self.end_game()
            return

        self.current_auction_card = self.auction_deck.pop()
        self.log(f"Round started. Card revealed: {self.current_auction_card.name}", "start")
        
        if self.current_auction_card.is_end_game_trigger:
            self.end_game_triggers_revealed += 1
            if self.end_game_triggers_revealed == 4:
                self.log("4th End Game trigger revealed. Game ends immediately!", "danger")
                self.end_game()
                return

        if self.current_auction_card.type in ['point', 'multiplier']:
            self.auction_type = 'positive'
        else:
            self.auction_type = 'negative'
            
        self.status = "in_progress"
        self.current_player_index = self.starting_player_index
        self.log(f"{self.players[self.current_player_index].name} starts the bidding.", "info")

    def get_highest_bid(self):
        return max([p.bid_total() for p in self.players], default=0)

    def next_player(self):
        self.current_player_index = (self.current_player_index + 1) % len(self.players)
        # Skip players who have passed
        start_search = self.current_player_index
        while self.players[self.current_player_index].has_passed:
            self.current_player_index = (self.current_player_index + 1) % len(self.players)
            if self.current_player_index == start_search:
                # Everyone passed? Should be handled by logic before this.
                break

    def bid(self, player_index, added_cards):
        if self.status != "in_progress":
            raise ValueError("Game is not in progress")
            
        p = self.players[player_index]
        if p.has_passed:
            raise ValueError("Player has already passed")
            
        if player_index != self.current_player_index:
            raise ValueError("Not this player's turn")
            
        if not added_cards:
            raise ValueError("Must bid at least one card to raise. If you want to pass, use pass_auction().")

        # Verify cards are in hand
        for c in set(added_cards):
            if p.hand.count(c) < added_cards.count(c):
                raise ValueError(f"Player does not have {added_cards.count(c)}x {c} in hand")

        new_bid = p.bid_total() + sum(added_cards)
        
        if self.auction_type == 'positive':
            max_bid = self.get_highest_bid()
            if new_bid <= max_bid:
                raise ValueError(f"New bid ({new_bid}) must be strictly higher than current highest bid ({max_bid})")
                
        # Apply bid
        for c in added_cards:
            p.hand.remove(c)
            p.current_bid.append(c)
            
        self.log(f"{p.name} adds {added_cards} for a total bid of {new_bid}.", "bid")
        self.next_player()

    def pass_auction(self, player_index):
        if self.status != "in_progress":
            raise ValueError("Game is not in progress")

        p = self.players[player_index]
        if p.has_passed:
            raise ValueError("Player has already passed")

        if player_index != self.current_player_index:
            raise ValueError("Not this player's turn")

        p.has_passed = True
        self.log(f"{p.name} passes.", "pass")
        
        if self.auction_type == 'positive':
            # Reclaim money
            p.hand.extend(p.current_bid)
            p.current_bid = []
            
            # Check if one player remains
            active_players = [pl for pl in self.players if not pl.has_passed]
            if len(active_players) == 1:
                winner = active_players[0]
                self.log(f"{winner.name} wins {self.current_auction_card.name} for {winner.bid_total()}!", "win")
                
                if self.current_auction_card.type == 'point' and winner.pending_theft > 0:
                    winner.pending_theft -= 1
                    self.log(f"Pending Theft triggers! {winner.name}'s new {self.current_auction_card.name} is immediately discarded.", "danger")
                else:
                    winner.tableau.append(self.current_auction_card)
                
                
                amount_spent = winner.bid_total()
                # Money is discarded
                winner.current_bid = [] 
                self.starting_player_index = self.players.index(winner)
                
                self.last_round_result = {
                    "winner": winner.name,
                    "card": self.current_auction_card.name,
                    "amount": amount_spent,
                    "type": "positive"
                }
                self.status = "round_over"
            else:
                self.next_player()
                
        elif self.auction_type == 'negative':
            # First to pass gets the card AND gets their money back
            p.hand.extend(p.current_bid)
            p.current_bid = []
            
            p.tableau.append(self.current_auction_card)
            self.log(f"{p.name} takes {self.current_auction_card.name} and reclaims their bid.", "win")
            
            if self.current_auction_card.name == "Theft":
                 point_cards = [c for c in p.tableau if c.type == 'point']
                 if point_cards:
                     # Discard highest value point automatically for now
                     point_cards.sort(key=lambda c: c.value, reverse=True)
                     discarded = point_cards[0]
                     p.tableau.remove(discarded)
                     self.log(f"Theft triggers! {p.name} discards {discarded.name}.", "danger")
                 else:
                     p.pending_theft += 1
                     self.log(f"Theft triggers, but {p.name} has no point_cards! A pending theft is added.", "danger")
            
            # Everyone else discards their bid
            for other_p in self.players:
                if other_p != p:
                    other_p.current_bid = []
                    
            self.starting_player_index = player_index
            self.last_round_result = {
                "winner": p.name,
                "card": self.current_auction_card.name,
                "amount": 0, # They got it for free (reclaimed bid)
                "type": "negative"
            }
            self.status = "round_over"

    def execute_cpu_turn(self):
        if self.status != "in_progress":
            return
            
        p = self.players[self.current_player_index]
        if not p.is_cpu or p.has_passed:
            return
            
        if p.cpu_strategy:
            p.cpu_strategy.execute_turn(self, self.current_player_index)

    def end_game(self):
        self.status = "finished"
        self.log("--- GAME END ---")
        
        # Elimination
        min_money = min(p.total_money() for p in self.players)
        eliminated_players = [p for p in self.players if p.total_money() == min_money]
        
        for p in eliminated_players:
            self.log(f"ELIMINATED: {p.name} for having the least money ({p.total_money()}).")
            
        remaining_players = [p for p in self.players if p not in eliminated_players]
        
        # Scoring
        scores = {}
        for p in self.players:
            base = sum(c.value for c in p.tableau if c.type == 'point')
            if any(c.name == "Faux Pas" for c in p.tableau):
                base -= 5
                
            multiplier_count = sum(1 for c in p.tableau if c.type == 'multiplier')
            score = base * (2 ** multiplier_count)
            
            if any(c.name == "Scandale" for c in p.tableau):
                import math
                score = math.ceil(score / 2.0)
                
            scores[p] = score
            if p in remaining_players:
                self.log(f"SCORE: {p.name} scores {score}. (Money: {p.total_money()})")
            
        if not remaining_players:
            self.log("All players eliminated!")
            eliminated_dicts = []
            for p in eliminated_players:
                d = p.to_dict()
                d['final_score'] = scores[p]
                eliminated_dicts.append(d)
            self.game_results = {'rankings': [], 'eliminated': eliminated_dicts}
            return []
            
        # Tie-breaker logic
        def sort_key(p):
            max_point = max([c.value for c in p.tableau if c.type == 'point'], default=0)
            return (scores[p], p.total_money(), max_point)
            
        remaining_players.sort(key=sort_key, reverse=True)
        winner = remaining_players[0]
        self.log(f"WINNER: {winner.name}!")
        
        eliminated_dicts = []
        for p in eliminated_players:
            d = p.to_dict()
            d['final_score'] = scores[p]
            eliminated_dicts.append(d)
            
        self.game_results = {
            'rankings': [],
            'eliminated': eliminated_dicts
        }
        for p in remaining_players:
            p_dict = p.to_dict()
            p_dict['final_score'] = scores[p]
            self.game_results['rankings'].append(p_dict)
            
        return self.game_results['rankings']

    def get_state(self):
        return {
            'status': self.status,
            'auction_type': self.auction_type,
            'current_auction_card': self.current_auction_card.to_dict() if self.current_auction_card else None,
            'end_game_triggers_revealed': self.end_game_triggers_revealed,
            'current_player_index': self.current_player_index,
            'starting_player_index': self.starting_player_index,
            'players': [p.to_dict() for p in self.players],
            'game_results': self.game_results,
            'game_log': self.game_log,
            'last_round_result': self.last_round_result
        }

if __name__ == "__main__":
    # Test simulation
    print("Running Simulation...")
    game = GameState()
    game.start_game(3, ["Alice", "Bob", "Charlie"])
    
    # We force the deck to be deterministic for the test
    test_deck = [
        StatusCard("Scandale", "penalty", "halve_score", True), # 4th end game
        StatusCard("Point 10", "point", 10),
        StatusCard("Multiplier 3", "multiplier", 2, True), # 3rd
        StatusCard("Faux Pas", "penalty", -5),
        StatusCard("Multiplier 2", "multiplier", 2, True), # 2nd
        StatusCard("Point 5", "point", 5),
        StatusCard("Multiplier 1", "multiplier", 2, True), # 1st
    ]
    game.auction_deck = test_deck
    game.end_game_triggers_revealed = 0
    game.start_round() # Restart with deterministic deck
    
    # Round 1: Multiplier 1 (Positive)
    p_idx = game.current_player_index
    game.bid(p_idx, [5])
    game.pass_auction(game.current_player_index)
    game.pass_auction(game.current_player_index)
    # Winner should be p_idx
    
    # Round 2: Point 5 (Positive)
    p_idx = game.current_player_index
    game.pass_auction(p_idx) # Start player passes
    p2 = game.current_player_index
    game.bid(p2, [8])
    p3 = game.current_player_index
    game.pass_auction(p3)
    # Winner should be p2
    
    # Round 3: Multiplier 2 (Positive)
    p_idx = game.current_player_index
    game.bid(p_idx, [12])
    game.pass_auction(game.current_player_index)
    game.pass_auction(game.current_player_index)
    
    # Round 4: Faux Pas (Negative)
    # Players bid to avoid. First to pass gets it.
    p_idx = game.current_player_index
    game.bid(p_idx, [1])
    game.pass_auction(game.current_player_index) # Next player passes immediately
    
    # Round 5: Multiplier 3 (Positive)
    p_idx = game.current_player_index
    game.bid(p_idx, [20])
    game.pass_auction(game.current_player_index)
    game.pass_auction(game.current_player_index)
    
    # Round 6: Point 10 (Positive)
    p_idx = game.current_player_index
    game.bid(p_idx, [25])
    game.pass_auction(game.current_player_index)
    game.pass_auction(game.current_player_index)
    
    # Round 7: Scandale (4th trigger)
    # Should end game automatically
    
    print("\nFinal State Dump:")
    import json
    # print(json.dumps(game.get_state(), indent=2))
