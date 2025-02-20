from flask import Flask, render_template, request, jsonify
import sqlite3
from ping3 import ping
import threading
import time

app = Flask(__name__)

# Caminho para o banco de dados SQLite
DATABASE = 'links.db'

# Dicionário para armazenar as threads de monitoramento
monitoring_threads = {}

# Função para inicializar o banco de dados
def init_db():
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            unidade TEXT NOT NULL,
            empresa TEXT NOT NULL,
            ip TEXT NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            status TEXT NOT NULL
        )
    ''')
    conn.commit()
    conn.close()

# Função para verificar o status do link (online/offline)
def check_link_status(link_id, ip):
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    while monitoring_threads.get(link_id):
        response_time = ping(ip, timeout=2)
        status = 'online' if response_time is not None else 'offline'
        cursor.execute('UPDATE links SET status = ? WHERE id = ?', (status, link_id))
        conn.commit()
        time.sleep(5)
    conn.close()

# Função para iniciar threads de monitoramento para links existentes
def start_monitoring_threads():
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    cursor.execute('SELECT id, ip FROM links')
    rows = cursor.fetchall()
    conn.close()

    for link_id, ip in rows:
        monitoring_threads[link_id] = True
        threading.Thread(target=check_link_status, args=(link_id, ip), daemon=True).start()

# Rota principal
@app.route('/')
def index():
    return render_template('index.html')

# Rota para cadastrar um novo link
@app.route('/cadastrar', methods=['POST'])
def cadastrar():
    try:
        data = request.json
        conn = sqlite3.connect(DATABASE)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO links (unidade, empresa, ip, latitude, longitude, status)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (data['unidade'], data['empresa'], data['ip'], data['latitude'], data['longitude'], 'offline'))
        link_id = cursor.lastrowid
        conn.commit()
        conn.close()

        # Inicia uma thread para monitorar o status do link
        monitoring_threads[link_id] = True
        threading.Thread(target=check_link_status, args=(link_id, data['ip']), daemon=True).start()

        return jsonify({'message': 'Link cadastrado com sucesso!'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

# Rota para listar todos os links
@app.route('/listar', methods=['GET'])
def listar():
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM links')
    rows = cursor.fetchall()
    conn.close()

    links = []
    for row in rows:
        links.append({
            'id': row[0],
            'unidade': row[1],
            'empresa': row[2],
            'ip': row[3],
            'latitude': row[4],
            'longitude': row[5],
            'status': row[6]
        })

    return jsonify(links)

# Rota para excluir um link
@app.route('/excluir/<int:link_id>', methods=['DELETE'])
def excluir(link_id):
    try:
        conn = sqlite3.connect(DATABASE)
        cursor = conn.cursor()
        cursor.execute('DELETE FROM links WHERE id = ?', (link_id,))
        conn.commit()
        conn.close()

        # Interrompe a thread de monitoramento
        monitoring_threads.pop(link_id, None)

        return jsonify({'message': 'Link excluído com sucesso!'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

# Rota para atualizar um link
@app.route('/atualizar/<int:link_id>', methods=['PUT'])
def atualizar(link_id):
    try:
        data = request.json
        conn = sqlite3.connect(DATABASE)
        cursor = conn.cursor()

        # Verifica se o link existe
        cursor.execute('SELECT ip FROM links WHERE id = ?', (link_id,))
        old_ip = cursor.fetchone()
        if not old_ip:
            return jsonify({'error': 'Link não encontrado'}), 404

        # Atualiza os dados do link
        cursor.execute('''
            UPDATE links
            SET unidade = ?, empresa = ?, ip = ?, latitude = ?, longitude = ?
            WHERE id = ?
        ''', (data['unidade'], data['empresa'], data['ip'], data['latitude'], data['longitude'], link_id))
        conn.commit()
        conn.close()

        # Interrompe a thread antiga
        monitoring_threads.pop(link_id, None)

        # Inicia uma nova thread de monitoramento com o IP atualizado
        monitoring_threads[link_id] = True
        threading.Thread(target=check_link_status, args=(link_id, data['ip']), daemon=True).start()

        return jsonify({'message': 'Link atualizado com sucesso!'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

if __name__ == '__main__':
    # Inicializar o banco de dados
    init_db()

    # Iniciar threads de monitoramento para links existentes
    start_monitoring_threads()

    # Iniciar o servidor Flask
    app.run(debug=True)