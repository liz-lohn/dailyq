import json
from http.server import BaseHTTPRequestHandler, HTTPServer
import sqlite3
import os
from openai import OpenAI
from urllib.parse import parse_qs
from datetime import datetime

from dotenv import load_dotenv
load_dotenv()

api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    raise EnvironmentError("Missing OpenAI API key. Please set OPENAI_API_KEY in the environment.")

client = OpenAI(api_key=api_key)

DB_FILE = "questions.db"  # Specify the new database file name

def init_questions_db():
    """
    Initialize the database for storing questions and answers.
    Creates the 'questions' table if it does not exist.
    """
    with sqlite3.connect(DB_FILE) as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS questions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date_question_created DATETIME NOT NULL,
                question TEXT NOT NULL,
                llm_answer TEXT NOT NULL,
                date_question_answered DATETIME NOT NULL,
                user_answer TEXT NOT NULL
            )
        ''')
        print(f"Database '{DB_FILE}' initialized with 'questions' table.")

class SimpleHTTPRequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/":
            # Serve the HTML file
            with open("index.html", "r") as f:
                self.send_response(200)
                self.send_header("Content-type", "text/html")
                self.end_headers()
                self.wfile.write(f.read().encode())
        elif self.path == "/style.css":
            # Serve the CSS file
            with open("style.css", "r") as f:
                self.send_response(200)
                self.send_header("Content-type", "text/css")
                self.end_headers()
                self.wfile.write(f.read().encode())
        elif self.path == "/script.js":
            # Serve the JS file
            with open("script.js", "r") as f:
                self.send_response(200)
                self.send_header("Content-type", "application/javascript")
                self.end_headers()
                self.wfile.write(f.read().encode())
        elif self.path == "/latest-unanswered":
            user_id = self.headers.get("User-ID")  # Fetch the user ID from the request headers
            if not user_id:
                self.send_response(401)  # Unauthorized
                self.end_headers()
                return

            with sqlite3.connect(DB_FILE) as conn:
                cursor = conn.execute('''
                    SELECT id, question
                    FROM questions
                    WHERE user_id = ? AND user_answer IS NULL
                    ORDER BY date_question_created DESC
                    LIMIT 1
                ''', (user_id,))
                result = cursor.fetchone()

            # Check if the result is valid and has the expected data
            if result:
                latest_unanswered = {"id": result[0], "question": result[1]}
            else:
                latest_unanswered = {"id": None, "question": None}

            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(latest_unanswered).encode())
        elif self.path == "/latest-answer":
            user_id = self.headers.get("User-ID")  # Fetch the user ID from the request headers
            if not user_id:
                self.send_response(401)  # Unauthorized
                self.end_headers()
                return
            with sqlite3.connect(DB_FILE) as conn:
                cursor = conn.execute('''
                    SELECT question, llm_answer, user_answer
                    FROM questions
                    WHERE user_id = ? AND user_answer IS NOT NULL
                    ORDER BY date_question_answered DESC
                    LIMIT 1
                ''', (user_id,))
                result = cursor.fetchone()

            if result:
                latest_answer = {
                    "question": result[0],
                    "llm_answer": result[1],
                    "user_answer": result[2]
                }
            else:
                latest_answer = {"question": None, "llm_answer": None, "user_answer": None}

            print("Latest Answer Result:", latest_answer)  # Debugging log

            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(latest_answer).encode())
        elif self.path == "/answers":
            user_id = self.headers.get("User-ID")  # Fetch the user ID from the request headers
            if not user_id:
                self.send_response(401)  # Unauthorized
                self.end_headers()
                return
            with sqlite3.connect(DB_FILE) as conn:
                # Fetch the latest answered question's ID
                cursor = conn.execute('''
                    SELECT id
                    FROM questions
                    WHERE user_id = ? AND user_answer IS NOT NULL
                    ORDER BY date_question_answered DESC
                    LIMIT 1
                ''', (user_id,))
                latest_answer_id = cursor.fetchone()

                # Fetch all answers except the latest one
                if latest_answer_id:
                    latest_id = latest_answer_id[0]
                    cursor = conn.execute('''
                        SELECT id, date_question_created, question, llm_answer, user_answer
                        FROM questions
                        WHERE id != ? AND user_answer IS NOT NULL AND user_id = ?
                        ORDER BY date_question_created DESC
                    ''', (latest_id, user_id,))
                else:
                    cursor = conn.execute('''
                        SELECT id, date_question_created, question, llm_answer, user_answer
                        FROM questions
                        WHERE user_answer IS NOT NULL AND user_id = ?
                        ORDER BY date_question_created DESC
                    ''', (user_id,))

                answers = [
                    {
                        "id": row[0],
                        "date_question_created": row[1],
                        "question": row[2],
                        "llm_answer": row[3],
                        "user_answer": row[4]
                    }
                    for row in cursor.fetchall()
                ]

            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(answers).encode())

    def do_POST(self):
        if self.path == "/add-answer":
            user_id = self.headers.get("User-ID")
            if not user_id:
                self.send_response(401)  # Unauthorized
                self.end_headers()
                return
            # Add a new user answer to the database
            content_length = int(self.headers["Content-Length"])
            post_data = self.rfile.read(content_length).decode()
            data = json.loads(post_data)

            question_id = data.get("id")
            user_answer = data.get("user_answer")

            if not question_id or not user_answer.strip():
                self.send_response(400)
                self.end_headers()
                return

            # Use placeholders for now for other fields
            question = "What is the meaning of life?"  # Example question
            llm_answer = "42"  # Example LLM answer
            current_time = datetime.now().isoformat()

            with sqlite3.connect(DB_FILE) as conn:
                conn.execute('''
                    UPDATE questions
                    SET user_answer = ?, user_id = ?, date_question_answered = ?
                    WHERE id = ?
                ''', (user_answer, user_id, datetime.now().isoformat(), question_id))
                conn.commit()

            self.send_response(200)
            self.end_headers()

        elif self.path == "/generate-new":
            user_id = self.headers.get("User-ID")
            if not user_id:
                self.send_response(401)  # Unauthorized
                self.end_headers()
                return

            with sqlite3.connect(DB_FILE) as conn:
                # Fetch all previous questions and user answers
                cursor = conn.execute('''
                    SELECT question, user_answer
                    FROM questions
                    WHERE user_id = ? AND user_answer IS NOT NULL
                ''', (user_id,))
                history = [{"question": row[0], "user_answer": row[1]} for row in cursor.fetchall()]

            # Prepare the prompt for OpenAI
            history_text = "\n".join([f"Q: {item['question']}\nA: {item['user_answer']}" for item in history])
            messages = [
                {"role": "system", "content": (
                    "You are an AI assistant designed to help users deepen their self-understanding and improve their relationship "
                    "with themselves by generating personalised self-reflection questions based on their previous answers. "
                    "Analyse the user's prior responses to identify themes, values, or areas of interest, and craft a unique, "
                    "concise question that encourages deep reflection on a different aspect of their self-perception or experiences. "
                    "Ensure the question is phrased in a compassionate and supportive tone, avoiding predictability and maintaining "
                    "the user's emotional well-being. Don't just go for clarifying questions to the user's original input – "
                    "surprise them in a good way. Don't act as a coach or therapist; instead, phrase questions as if you are dating this person. "
                    "Always use 'you' in your questions. If the user's history is empty, ask a question in the same style but that would help "
                    "generate the most relevant question after that."
                )},
                {"role": "user", "content": f"Here is the user's history:\n{history_text}\n\nGenerate a new question."}
            ]

            try:
                # Call OpenAI API to generate a new question
                response = client.chat.completions.create(model="gpt-4",
                messages=messages,
                max_tokens=150,
                temperature=0.7)
                new_question = response.choices[0].message.content.strip()
                print("Generated Question:", new_question)

                # Store the new question in the database
                with sqlite3.connect(DB_FILE) as conn:
                    cursor = conn.execute('''
                        INSERT INTO questions (user_id, date_question_created, question)
                        VALUES (?, ?, ?)
                    ''', (user_id, datetime.now().isoformat(), new_question))
                    new_question_id = cursor.lastrowid
                    conn.commit()

                # Call OpenAI API to generate an answer for the new question
                answer_messages = [
                    {"role": "system", "content": (
                        "You are an AI assistant tasked with answering questions about the user based on the their previous history of questions and answers. "
                        "Provide a thoughtful response to the following question that is addressed to the user. The answer needs to be about the user (not about you), use 'you' in your response. "
                        "If there is no past user's history - make a guess about a typical user interested in mindfulness and keep it light and humble, "
                        "accepting that your guess is likely wrong. Avoid reflecting on your own experience in any way." 
                    )},
                    {"role": "user", "content": f"Here is the user's history:\n{history_text}\n\nQuestion you need to answer about the user: {new_question}\nA:"}
                ]

                response = client.chat.completions.create(model="gpt-4",
                messages=answer_messages,
                max_tokens=150,
                temperature=0.7)
                llm_answer = response.choices[0].message.content.strip()
                print("Generated Answer:", llm_answer)

                # Update the database with the LLM's answer
                with sqlite3.connect(DB_FILE) as conn:
                    conn.execute('''
                        UPDATE questions
                        SET llm_answer = ?
                        WHERE id = ?
                    ''', (llm_answer, new_question_id))
                    conn.commit()

                # Respond to the frontend
                self.send_response(200)
                self.send_header("Content-type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({
                    "id": new_question_id,
                    "question": new_question, 
                    "llm_answer": llm_answer
                }).encode())
            except Exception as e:
                print("Error generating new question or answer:", e)
                self.send_response(500)
                self.end_headers()

if __name__ == "__main__":
    init_questions_db()
    server = HTTPServer(("localhost", 8000), SimpleHTTPRequestHandler)
    print("Server running at http://localhost:8000")
    server.serve_forever()