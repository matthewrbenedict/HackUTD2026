import json
from flask import Flask, render_template

app = Flask(__name__)


# Load quiz messages from the JSON file
with open("example_data.json", "r", encoding="utf-8") as file:
    data = json.load(file)

messages = []

for theme in data["themes"]:
    messages.extend(theme["examples"])


@app.route("/")
def home():
    return render_template("index.html", message=messages[0])


if __name__ == "__main__":
    app.run(debug=True)