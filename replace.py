import os

files = [
    'engine.py',
    'static/index.js',
    'static/index.css',
    'game_instructions.md',
    'README.md'
]

replacements = {
    'luxury': 'point',
    'Luxury': 'Point',
    'luxuries': 'point_cards',
    'Luxuries': 'Points', # The UI label is now Points, but we just want to replace standard occurrences. We already renamed the UI label.
    'prestige': 'multiplier',
    'Prestige': 'Multiplier',
    'disgrace': 'penalty',
    'Disgrace': 'Penalty'
}

for filepath in files:
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            content = f.read()
            
        # The UI string "Luxuries" was already changed to "Points". 
        # But for other places like "discard highest value luxury", we just want it to be "point".
        
        for old, new in replacements.items():
            content = content.replace(old, new)
            
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Updated {filepath}")
