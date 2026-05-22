import unittest
import json
import math
from engine import GameState, StatusCard, Player, get_initial_deck
from app import app

class TestHighSocietyGame(unittest.TestCase):
    def setUp(self):
        self.game = GameState()

    def test_scoring_and_multipliers(self):
        # 1. Base player score
        p = Player(0, "Test Player")
        p.tableau = [
            StatusCard("Point 5", "point", 5),
            StatusCard("Point 10", "point", 10),
        ]
        self.assertEqual(p.current_score(), 15)

        # 2. Score with Faux Pas (-5)
        p.tableau.append(StatusCard("Faux Pas", "penalty", -5))
        self.assertEqual(p.current_score(), 10)

        # 3. Score with one Multiplier (x2)
        p.tableau.append(StatusCard("Multiplier 1", "multiplier", 2, True))
        self.assertEqual(p.current_score(), 20)

        # 4. Score with two Multipliers (x4)
        p.tableau.append(StatusCard("Multiplier 2", "multiplier", 2, True))
        self.assertEqual(p.current_score(), 40)

        # 5. Score with three Multipliers (x8)
        p.tableau.append(StatusCard("Multiplier 3", "multiplier", 2, True))
        self.assertEqual(p.current_score(), 80)

        # 6. Score with Scandale (halve score, rounded up)
        p.tableau.append(StatusCard("Scandale", "penalty", "halve_score", True))
        # 80 / 2 = 40
        self.assertEqual(p.current_score(), 40)

        # Let's test non-divisible odd score with Scandale to verify math.ceil
        p2 = Player(1, "Test Player 2")
        p2.tableau = [
            StatusCard("Point 3", "point", 3),
            StatusCard("Scandale", "penalty", "halve_score", True)
        ]
        # ceil(3 / 2.0) = 2
        self.assertEqual(p2.current_score(), 2)

    def test_game_setup(self):
        # Invalid player counts
        with self.assertRaises(ValueError):
            self.game.start_game(1, 1)  # 2 players total

        with self.assertRaises(ValueError):
            self.game.start_game(3, 3)  # 6 players total

        # Valid setup: 3 players
        self.game.start_game(1, 2, ["Human 1"])
        self.assertEqual(len(self.game.players), 3)
        self.assertEqual(self.game.players[0].name, "Human 1")
        self.assertTrue(self.game.players[1].is_cpu)
        self.assertTrue(self.game.players[2].is_cpu)

        # Game deck count (16 cards total, 1 is popped when starting the round)
        self.assertEqual(len(self.game.auction_deck), 15)
        self.assertIsNotNone(self.game.current_auction_card)

        # Check players' initial money hand
        for p in self.game.players:
            self.assertEqual(sum(p.hand), 105) # Sum of MONEY_CARDS: 1+2+3+4+5+8+10+12+15+20+25 = 105
            self.assertEqual(len(p.hand), 11)

    def test_bidding_positive_auction(self):
        # Force a positive card auction
        self.game.players = [
            Player(0, "Alice"),
            Player(1, "Bob"),
            Player(2, "Charlie")
        ]
        self.game.current_auction_card = StatusCard("Point 8", "point", 8)
        self.game.auction_type = "positive"
        self.game.status = "in_progress"
        self.game.current_player_index = 0

        # Alice bids 5 (possesses card 5)
        self.game.bid(0, [5])
        self.assertEqual(self.game.players[0].bid_total(), 5)
        self.assertNotIn(5, self.game.players[0].hand)
        self.assertEqual(self.game.current_player_index, 1) # Next player is Bob

        # Bob tries to bid 5 (invalid: must be strictly higher than 5)
        with self.assertRaises(ValueError):
            self.game.bid(1, [5])

        # Bob bids 8
        self.game.bid(1, [8])
        self.assertEqual(self.game.players[1].bid_total(), 8)
        self.assertEqual(self.game.current_player_index, 2) # Next player is Charlie

        # Charlie bids out of turn (should raise ValueError)
        with self.assertRaises(ValueError):
            self.game.bid(0, [10])

        # Charlie passes
        self.game.pass_auction(2)
        self.assertTrue(self.game.players[2].has_passed)
        # Bidding loop continues back to Alice (active players: Alice, Bob)
        self.assertEqual(self.game.current_player_index, 0)

        # Alice passes
        self.game.pass_auction(0)
        self.assertTrue(self.game.players[0].has_passed)

        # When Alice passes, only Bob is active. Bob should win!
        # Bob's tableau should get the card.
        self.assertIn("Point 8", [c.name for c in self.game.players[1].tableau])
        # Bob's spent money should be deducted (not returned to hand)
        self.assertNotIn(8, self.game.players[1].hand)
        # Alice's current bid is returned to hand when passing
        self.assertIn(5, self.game.players[0].hand)
        self.assertEqual(self.game.status, "round_over")

    def test_bidding_negative_auction(self):
        # Force a negative card auction
        self.game.players = [
            Player(0, "Alice"),
            Player(1, "Bob"),
            Player(2, "Charlie")
        ]
        self.game.current_auction_card = StatusCard("Faux Pas", "penalty", -5)
        self.game.auction_type = "negative"
        self.game.status = "in_progress"
        self.game.current_player_index = 0

        # Bids don't have to be higher than highest. Players bid to AVOID the penalty card.
        # First to pass takes the card, but gets their current bid back.
        # Everyone else keeps paying their bids (discarded).
        self.game.bid(0, [2])
        self.game.bid(1, [3])
        self.game.bid(2, [4])

        # Alice passes. She takes the card.
        self.game.pass_auction(0)
        self.assertTrue(self.game.players[0].has_passed)
        self.assertIn("Faux Pas", [c.name for c in self.game.players[0].tableau])

        # Alice should get her money back
        self.assertIn(2, self.game.players[0].hand)
        self.assertEqual(self.game.players[0].bid_total(), 0)

        # Bob and Charlie lose their bids
        self.assertEqual(self.game.players[1].bid_total(), 0)
        self.assertNotIn(3, self.game.players[1].hand)
        self.assertEqual(self.game.players[2].bid_total(), 0)
        self.assertNotIn(4, self.game.players[2].hand)

        self.assertEqual(self.game.status, "round_over")

    def test_theft_penalty_card(self):
        # Negative card "Theft": when taken, discards highest point card in tableau
        p = Player(0, "Alice")
        p.tableau = [
            StatusCard("Point 3", "point", 3),
            StatusCard("Point 8", "point", 8),
        ]
        self.game.players = [p]
        self.game.current_auction_card = StatusCard("Theft", "penalty", "discard_point")
        self.game.auction_type = "negative"
        self.game.status = "in_progress"
        self.game.current_player_index = 0

        # Alice passes, taking Theft
        self.game.pass_auction(0)
        
        # High value Point 8 should be discarded, Point 3 remains
        tableau_names = [c.name for c in p.tableau]
        self.assertNotIn("Point 8", tableau_names)
        self.assertIn("Point 3", tableau_names)
        self.assertEqual(p.pending_theft, 0)

        # Test pending theft if no point card exists
        p2 = Player(1, "Bob")
        self.game.players = [p2]
        self.game.current_auction_card = StatusCard("Theft", "penalty", "discard_point")
        self.game.status = "in_progress"
        self.game.current_player_index = 0
        self.game.pass_auction(0)

        self.assertEqual(p2.pending_theft, 1)

    def test_end_game_elimination_and_ties(self):
        # End game triggers
        self.game.players = [
            Player(0, "Alice"),
            Player(1, "Bob"),
            Player(2, "Charlie")
        ]
        
        # Setup tableaus
        # Alice: Point 10. Hand has all cards (105 money)
        self.game.players[0].tableau = [StatusCard("Point 10", "point", 10)]
        # Bob: Point 9. Hand missing 25 (80 money)
        self.game.players[1].tableau = [StatusCard("Point 9", "point", 9)]
        self.game.players[1].hand.remove(25)
        # Charlie: Point 5, Point 5. Hand missing 25 (80 money)
        self.game.players[2].tableau = [
            StatusCard("Point 5", "point", 5),
            StatusCard("Point 5", "point", 5),
        ]
        self.game.players[2].hand.remove(25)

        # Alice has 105 money, Bob has 80, Charlie has 80.
        # Bob and Charlie tie for lowest money (80). Both should be eliminated!
        self.game.end_game()
        
        results = self.game.game_results
        self.assertEqual(len(results['eliminated']), 2)
        eliminated_names = [pl['name'] for pl in results['eliminated']]
        self.assertIn("Bob", eliminated_names)
        self.assertIn("Charlie", eliminated_names)
        
        # Winner must be Alice
        self.assertEqual(len(results['rankings']), 1)
        self.assertEqual(results['rankings'][0]['name'], "Alice")

    def test_flask_api_endpoints(self):
        client = app.test_client()

        # 1. Start Game
        response = client.post("/api/start", json={"num_human": 1, "num_cpu": 2})
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data["success"])

        # 2. Get State
        response = client.get("/api/state")
        self.assertEqual(response.status_code, 200)
        state = json.loads(response.data)
        self.assertEqual(state["status"], "in_progress")
        self.assertEqual(len(state["players"]), 3)

        # 3. Invalid Bid
        # Test submitting a bad bid (e.g. out of turn or player_index invalid)
        response = client.post("/api/bid", json={"player_index": 99, "cards": [5]})
        self.assertEqual(response.status_code, 400)

    def test_cpu_poverty_avoidance(self):
        from cpu import AdvancedHeuristicCPU
        # 3 CPU players
        self.game.players = [
            Player(0, "Baboon", is_cpu=True, cpu_strategy=AdvancedHeuristicCPU()),
            Player(1, "Macaque", is_cpu=True, cpu_strategy=AdvancedHeuristicCPU()),
            Player(2, "Gorilla", is_cpu=True, cpu_strategy=AdvancedHeuristicCPU())
        ]
        # Player 0 is poorest (remove 25)
        self.game.players[0].hand.remove(25)
        
        # Negative auction
        self.game.current_auction_card = StatusCard("Faux Pas", "penalty", -5)
        self.game.auction_type = "negative"
        self.game.status = "in_progress"
        self.game.current_player_index = 0
        self.game.end_game_triggers_revealed = 2 # High danger

        # Poorest player executes turn. It should pass immediately to conserve money!
        self.game.execute_cpu_turn()
        self.assertTrue(self.game.players[0].has_passed)

    def test_cpu_let_them_spend(self):
        from cpu import AdvancedHeuristicCPU
        self.game.players = [
            Player(0, "Baboon", is_cpu=True, cpu_strategy=AdvancedHeuristicCPU()),
            Player(1, "Macaque", is_cpu=True, cpu_strategy=AdvancedHeuristicCPU()),
            Player(2, "Gorilla", is_cpu=True, cpu_strategy=AdvancedHeuristicCPU())
        ]
        # Player 1 is poorest (remove 25, total 80)
        self.game.players[1].hand.remove(25)
        
        # Positive auction for a Point 10
        self.game.current_auction_card = StatusCard("Point 10", "point", 10)
        self.game.auction_type = "positive"
        self.game.status = "in_progress"
        self.game.current_player_index = 0
        self.game.end_game_triggers_revealed = 1

        # Poorest player (Player 1) has bid 20 (which is > 15% of their total money)
        self.game.players[1].hand.remove(20)
        self.game.players[1].current_bid.append(20)
        
        # Player 0 (richest) should recognize that Player 1 has bid a lot,
        # and should pass to let them spend it and face elimination!
        self.game.execute_cpu_turn()
        self.assertTrue(self.game.players[0].has_passed)

    def test_cpu_waste_tolerance_scaling(self):
        from cpu import AdvancedHeuristicCPU
        self.game.players = [
            Player(0, "Baboon", is_cpu=True, cpu_strategy=AdvancedHeuristicCPU()),
            Player(1, "Macaque", is_cpu=True, cpu_strategy=AdvancedHeuristicCPU()),
            Player(2, "Gorilla", is_cpu=True, cpu_strategy=AdvancedHeuristicCPU())
        ]
        # Player 0 is richest (20 vs 1) and has a score of 15 (Point 5 + Point 10)
        self.game.players[0].hand = [20]
        self.game.players[0].tableau = [
            StatusCard("Point 5", "point", 5),
            StatusCard("Point 10", "point", 10)
        ]
        self.game.players[1].hand = [1]
        self.game.players[2].hand = [1]
        
        # Positive auction for Multiplier 1 (extremely valuable)
        self.game.current_auction_card = StatusCard("Multiplier 1", "multiplier", 2, True)
        self.game.auction_type = "positive"
        self.game.status = "in_progress"
        self.game.current_player_index = 0
        self.game.end_game_triggers_revealed = 0

        # Player 0 should bid their 20 despite the large waste, because Multiplier is high value
        # and hand options are restricted (dynamic waste tolerance scaling).
        self.game.execute_cpu_turn()
        self.assertFalse(self.game.players[0].has_passed)
        self.assertEqual(self.game.players[0].bid_total(), 20)

    def test_cpu_no_infinite_loop_when_others_passed(self):
        from cpu import AdvancedHeuristicCPU
        self.game.players = [
            Player(0, "Baboon", is_cpu=True, cpu_strategy=AdvancedHeuristicCPU()),
            Player(1, "Macaque", is_cpu=True, cpu_strategy=AdvancedHeuristicCPU()),
            Player(2, "Gorilla", is_cpu=True, cpu_strategy=AdvancedHeuristicCPU())
        ]
        # Macaque and Gorilla have already passed
        self.game.players[1].has_passed = True
        self.game.players[2].has_passed = True
        
        # Positive auction for Point 10
        self.game.current_auction_card = StatusCard("Point 10", "point", 10)
        self.game.auction_type = "positive"
        self.game.status = "in_progress"
        self.game.current_player_index = 0
        
        # Player 0 should execute turn without getting stuck in an infinite loop!
        # If it was stuck, this would hang indefinitely.
        self.game.execute_cpu_turn()
        self.assertTrue(True)

if __name__ == "__main__":
    unittest.main()
