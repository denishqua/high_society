from flask import Flask, render_template, request, jsonify
from engine import GameState

app = Flask(__name__)

# Global game state (in-memory for simple prototype)
game = GameState()

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/state", methods=["GET"])
def get_state():
    return jsonify(game.get_state())

@app.route("/api/start", methods=["POST"])
def start_game():
    data = request.json
    num_human = data.get("num_human", 1)
    num_cpu = data.get("num_cpu", 2)
    cpu_type = data.get("cpu_type", "agent")
    
    # Re-initialize game
    game.__init__()
    
    # We can use monkey-themed names!
    names = ["Lord Chimington", "Duke Macaque", "Count Baboon", "Sir Orangutan", "Baron Gorilla"]
    game.start_game(num_human, num_cpu, names[:num_human], cpu_type=cpu_type)
    
    return jsonify({"success": True})

@app.route("/api/bid", methods=["POST"])
def bid():
    data = request.json
    player_index = data.get("player_index")
    cards = data.get("cards", [])
    
    try:
        game.bid(player_index, cards)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400

@app.route("/api/pass", methods=["POST"])
def pass_auction():
    data = request.json
    player_index = data.get("player_index")
    
    try:
        game.pass_auction(player_index)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400

@app.route("/api/cpu_action", methods=["POST"])
def cpu_action():
    try:
        game.execute_cpu_turn()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400

@app.route("/api/next_round", methods=["POST"])
def next_round():
    try:
        game.start_round()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400

if __name__ == "__main__":
    app.run(debug=True, port=5000)
