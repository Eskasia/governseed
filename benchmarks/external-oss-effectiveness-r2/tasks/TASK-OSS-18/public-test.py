from flask import Flask


app = Flask(__name__)
assert app.select_jinja_autoescape("INDEX.HTML") is True
assert app.select_jinja_autoescape("notes.txt") is False

