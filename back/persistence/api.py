"""REST API for user buckets and states: /api/users/<uid>/..."""
import json
import os
import re

from flask import Blueprint, Response, current_app, g, request
from werkzeug.exceptions import HTTPException, MethodNotAllowed, RequestEntityTooLarge
from werkzeug.routing import IntegerConverter

from . import db
from .normalize import InvalidInput, clean_name, is_int, loads_strict, normalize_graph, normalize_image_refs

URL_PREFIX = '/api/users'
BACK_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB_PATH = os.path.join(BACK_DIR, 'userdata', 'reveal.db')
DEFAULT_ALLOWED_ORIGINS = 'http://localhost:4200,http://127.0.0.1:4200'
DEFAULT_ALLOWED_HOSTS = 'localhost,127.0.0.1,[::1]'
DEFAULT_MAX_BODY_MB = '256'
CORS_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
UID_RE = re.compile(r'[A-Za-z0-9_-]{1,128}')
MAX_ID = 2 ** 63 - 1  # SQLite INTEGER range
BUCKET_PATCH_KEYS = frozenset(('name', 'inUse', 'isSaved'))
HTTP_ERROR_CODES = {404: 'not_found', 405: 'method_not_allowed', 413: 'body_too_large'}

bp = Blueprint('persistence', __name__, url_prefix=URL_PREFIX + '/<uid>')


class IdConverter(IntegerConverter):
    # Bounded so int() never sees Python's 4300-digit limit during routing (a non-JSON 500); longer ids are a JSON 404.
    regex = r'\d{1,19}'


class ApiError(Exception):
    def __init__(self, status, code, message, **extra):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.extra = extra


def _csv(value):
    return [part.strip() for part in value.split(',') if part.strip()]


def _config_defaults(app):
    c = app.config
    c.setdefault('REVEAL_MAX_BODY_BYTES',
                 int(float(os.environ.get('REVEAL_MAX_BODY_MB', DEFAULT_MAX_BODY_MB)) * 1024 * 1024))
    c.setdefault('REVEAL_ALLOWED_ORIGINS', _csv(os.environ.get('REVEAL_ALLOWED_ORIGINS', DEFAULT_ALLOWED_ORIGINS)))
    c.setdefault('REVEAL_ALLOWED_HOSTS', _csv(os.environ.get('REVEAL_ALLOWED_HOSTS', DEFAULT_ALLOWED_HOSTS)))


def init_app(app, db_path=None):
    """Configure REVEAL_* settings, create/migrate the database and register the blueprint."""
    c = app.config
    c['REVEAL_DB_PATH'] = (db_path or c.get('REVEAL_DB_PATH') or os.environ.get('REVEAL_DB_PATH')
                           or DEFAULT_DB_PATH)
    _config_defaults(app)
    db.init_db(c['REVEAL_DB_PATH'])
    app.url_map.converters['id'] = IdConverter  # must exist before the blueprint's rules are bound
    app.register_blueprint(bp)
    # Routing failures never reach blueprint handlers; answer them in JSON under our prefix only.
    app.register_error_handler(404, _routing_error)
    app.register_error_handler(405, _routing_error)


def init_cors(app):
    """CORS for the whole app: /api/* limited to REVEAL_ALLOWED_ORIGINS, /dataset/* open (images)."""
    from flask_cors import CORS
    _config_defaults(app)
    CORS(app, resources={
        r'/api/*': {'origins': list(app.config['REVEAL_ALLOWED_ORIGINS']), 'methods': CORS_METHODS},
        r'/dataset/*': {'origins': '*'},
    })


def get_db():
    if 'reveal_db' not in g:
        g.reveal_db = db.connect(current_app.config['REVEAL_DB_PATH'])
    return g.reveal_db


@bp.teardown_app_request
def _close_db(exc):
    conn = g.pop('reveal_db', None)
    if conn is not None:
        conn.close()


def _hostname(host):
    host = (host or '').strip().lower()
    if host.startswith('['):
        end = host.find(']')
        return host[:end + 1] if end != -1 else host
    return host.split(':', 1)[0]


def _origin_allowed(origin, allowed):
    origin = origin.strip().lower()
    return any(a == '*' or a.lower() == origin for a in allowed)


@bp.before_request
def _guard():
    if request.method == 'OPTIONS':
        return None  # flask-cors answers preflights
    cfg = current_app.config
    if _hostname(request.host) not in [h.lower() for h in cfg['REVEAL_ALLOWED_HOSTS']]:
        raise ApiError(403, 'forbidden_host', 'Host not allowed')
    origin = request.headers.get('Origin')
    if origin is not None and not _origin_allowed(origin, cfg['REVEAL_ALLOWED_ORIGINS']):
        raise ApiError(403, 'forbidden_origin', 'Origin not allowed')
    request.max_content_length = cfg['REVEAL_MAX_BODY_BYTES']  # Flask 3.1 per-request limit
    args = request.view_args or {}
    if not UID_RE.fullmatch(args.get('uid', '')):
        raise ApiError(400, 'invalid_uid', 'Invalid user id')
    for key in ('bucket_id', 'state_id'):
        if args.get(key, 0) > MAX_ID:
            raise ApiError(404, 'not_found', 'Not found')
    return None


def json_response(obj, status=200):
    # Compact on purpose: jsonify pretty-prints in debug mode.
    resp = Response(json.dumps(obj, separators=(',', ':')), status=status, mimetype='application/json')
    resp.headers['Cache-Control'] = 'no-store'
    return resp


def _error_response(status, code, message, extra=None):
    body = {'error': code, 'message': message}
    if extra:
        body.update(extra)
    return json_response(body, status)


def _http_error_response(e):
    code = HTTP_ERROR_CODES.get(e.code) or (e.name or 'http_error').lower().replace(' ', '_')
    resp = _error_response(e.code, code, e.description or e.name)
    if isinstance(e, MethodNotAllowed) and e.valid_methods:
        resp.headers['Allow'] = ', '.join(e.valid_methods)
    return resp


def _routing_error(e):
    path = request.path
    if path == URL_PREFIX or path.startswith(URL_PREFIX + '/'):
        return _http_error_response(e)
    return e  # unchanged default response for the rest of the app


@bp.errorhandler(ApiError)
def _api_error(e):
    return _error_response(e.status, e.code, e.message, e.extra)


@bp.errorhandler(InvalidInput)
def _invalid_input(e):
    return _error_response(400, e.code, e.message, e.extra)


@bp.errorhandler(HTTPException)
def _http_error(e):
    return _http_error_response(e)


@bp.errorhandler(Exception)
def _unexpected(e):
    current_app.logger.exception('persistence error')
    return _error_response(500, 'internal', 'Internal server error: %s' % e)


def read_json():
    if request.mimetype != 'application/json':
        raise ApiError(415, 'unsupported_media_type', 'Send Content-Type: application/json')
    data = request.get_data(cache=False)  # raises 413 over the limit when Content-Length is sent
    limit = request.max_content_length
    if request.content_length is None and limit is not None and len(data) >= limit:
        raise RequestEntityTooLarge()  # chunked bodies are silently cut at the limit instead
    try:
        body = loads_strict(data)
    except (ValueError, RecursionError):
        raise ApiError(400, 'invalid_json', 'Body is not valid JSON')
    if not isinstance(body, dict):
        raise ApiError(400, 'invalid_request', 'Body must be a JSON object')
    return body


def _not_found(what):
    return ApiError(404, 'not_found', '%s not found' % what)


# ---- collection ----

@bp.get('/collection')
def get_collection(uid):
    conn = get_db()
    with db.read_tx(conn):
        buckets = db.list_buckets(conn, uid)
        states = db.list_states(conn, uid)
    return json_response({'uid': uid, 'buckets': buckets, 'states': states})


# ---- buckets ----

@bp.get('/buckets')
def list_buckets(uid):
    conn = get_db()
    with db.read_tx(conn):
        buckets = db.list_buckets(conn, uid)
    return json_response({'buckets': buckets})


@bp.post('/buckets')
def create_bucket(uid):
    name = clean_name(read_json().get('name'))
    conn = get_db()
    with db.write_tx(conn):
        db.ensure_user(conn, uid)
        bucket_id = db.alloc_id(conn, uid, 'bucket')
        now = db.utcnow()
        conn.execute('INSERT INTO buckets(uid, id, name, date, updated_at, in_use, is_saved) '
                     'VALUES (?, ?, ?, ?, ?, 1, 0)', (uid, bucket_id, name, now, now))
        bucket = db.get_bucket(conn, uid, bucket_id)
    return json_response(bucket, 201)


@bp.patch('/buckets/<id:bucket_id>')
def update_bucket(uid, bucket_id):
    body = read_json()
    unknown = sorted(set(body) - BUCKET_PATCH_KEYS)
    if unknown:
        raise ApiError(400, 'unknown_fields', 'Unknown fields: %s' % ', '.join(unknown), fields=unknown)
    if not body:
        raise ApiError(400, 'invalid_request', 'Nothing to update')
    for key in ('inUse', 'isSaved'):
        if key in body and not isinstance(body[key], bool):
            raise ApiError(400, 'invalid_request', '%s must be a boolean' % key)
    name = clean_name(body['name']) if 'name' in body else None

    conn = get_db()
    with db.write_tx(conn):
        row = db.get_bucket_row(conn, uid, bucket_id)
        if row is None:
            raise _not_found('Bucket')
        in_use = body.get('inUse', bool(row['in_use']))
        is_saved = body.get('isSaved', bool(row['is_saved']))
        if not in_use and not is_saved:
            raise ApiError(409, 'would_orphan', 'A bucket that is not saved cannot be closed; delete it instead')
        conn.execute('UPDATE buckets SET name = ?, in_use = ?, is_saved = ?, updated_at = ? WHERE uid = ? AND id = ?',
                     (name if name is not None else row['name'], int(in_use), int(is_saved), db.utcnow(),
                      uid, bucket_id))
        bucket = db.get_bucket(conn, uid, bucket_id)
    return json_response(bucket)


@bp.delete('/buckets/<id:bucket_id>')
def delete_bucket(uid, bucket_id):
    conn = get_db()
    with db.write_tx(conn):
        cur = conn.execute('DELETE FROM buckets WHERE uid = ? AND id = ?', (uid, bucket_id))
        if cur.rowcount == 0:
            raise _not_found('Bucket')
    return Response(status=204)


@bp.post('/buckets/<id:bucket_id>/images')
def add_bucket_images(uid, bucket_id):
    keys = normalize_image_refs(read_json().get('images'))
    conn = get_db()
    with db.write_tx(conn):
        if db.get_bucket_row(conn, uid, bucket_id) is None:
            raise _not_found('Bucket')
        now = db.utcnow()
        before = conn.total_changes
        conn.executemany('INSERT OR IGNORE INTO bucket_images(uid, bucket_id, image, added_at) VALUES (?, ?, ?, ?)',
                         ((uid, bucket_id, key, now) for key in keys))
        if conn.total_changes != before:
            touch_bucket(conn, uid, bucket_id, now)
        bucket = db.get_bucket(conn, uid, bucket_id)
    return json_response(bucket)


def touch_bucket(conn, uid, bucket_id, now):
    conn.execute('UPDATE buckets SET updated_at = ? WHERE uid = ? AND id = ?', (now, uid, bucket_id))


# ---- states ----

@bp.get('/states')
def list_states(uid):
    return json_response({'states': db.list_states(get_db(), uid)})


@bp.get('/states/<id:state_id>')
def get_state(uid, state_id):
    meta, payload = db.get_state_with_payload(get_db(), uid, state_id)
    if meta is None:
        raise _not_found('State')
    # Splice meta and the stored graph without re-encoding: '{...meta' + ',' + '"links":...,"nodes":...}'.
    head = json.dumps(meta, separators=(',', ':')).encode('ascii')
    graph = db.decode_graph(payload)
    resp = Response(head[:-1] + b',' + graph[1:], mimetype='application/json')
    resp.headers['Cache-Control'] = 'no-store'
    return resp


def _encode(body):
    try:
        graph = normalize_graph(body)
        payload, size = db.encode_graph(graph)
    except RecursionError:
        raise InvalidInput('invalid_graph', 'The graph is nested too deeply')
    return payload, size, len(graph['nodes'])


@bp.post('/states')
def create_state(uid):
    body = read_json()
    name = clean_name(body.get('name'))
    payload, size, node_count = _encode(body)  # outside the transaction: keeps the write lock short
    conn = get_db()
    with db.write_tx(conn):
        db.ensure_user(conn, uid)
        existing = db.find_state_by_name(conn, uid, name)
        if existing is not None:
            raise ApiError(409, 'name_exists', 'A state with this name already exists', existing=existing)
        state_id = db.alloc_id(conn, uid, 'state')
        now = db.utcnow()
        conn.execute('INSERT INTO states(uid, id, name, date, updated_at, version, node_count, size_bytes, payload) '
                     'VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)', (uid, state_id, name, now, now, node_count, size, payload))
        meta = db.get_state_meta(conn, uid, state_id)
    return json_response(meta, 201)


@bp.put('/states/<id:state_id>')
def replace_state(uid, state_id):
    body = read_json()
    name = clean_name(body['name']) if body.get('name') is not None else None
    expected = body.get('expectedVersion')
    if expected is not None and not is_int(expected):
        raise ApiError(400, 'invalid_request', 'expectedVersion must be an integer')
    payload, size, node_count = _encode(body)
    conn = get_db()
    with db.write_tx(conn):
        current = db.get_state_meta(conn, uid, state_id)
        if current is None:
            raise _not_found('State')
        if expected is not None and expected != current['version']:
            raise ApiError(409, 'version_conflict', 'The state was changed elsewhere', current=current)
        if name is not None and name != current['name']:
            other = db.find_state_by_name(conn, uid, name)
            if other is not None and other['id'] != state_id:
                raise ApiError(409, 'name_exists', 'A state with this name already exists', existing=other)
        conn.execute('UPDATE states SET name = ?, version = version + 1, node_count = ?, size_bytes = ?, payload = ?, '
                     'updated_at = ? WHERE uid = ? AND id = ?',
                     (name if name is not None else current['name'], node_count, size, payload, db.utcnow(),
                      uid, state_id))
        meta = db.get_state_meta(conn, uid, state_id)
    return json_response(meta)


@bp.delete('/states/<id:state_id>')
def delete_state(uid, state_id):
    conn = get_db()
    with db.write_tx(conn):
        cur = conn.execute('DELETE FROM states WHERE uid = ? AND id = ?', (uid, state_id))
        if cur.rowcount == 0:
            raise _not_found('State')
    try:
        conn.execute('PRAGMA incremental_vacuum').fetchall()  # fetchall runs every step
    except Exception:
        current_app.logger.warning('incremental_vacuum failed', exc_info=True)
    return Response(status=204)
