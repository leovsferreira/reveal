"""SQLite storage for user buckets and states (stdlib only)."""
import gzip
import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

SCHEMA_VERSION = 1

SCHEMA = """
CREATE TABLE IF NOT EXISTS users(
  uid TEXT PRIMARY KEY,
  next_bucket_id INTEGER NOT NULL DEFAULT 1,
  next_state_id  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS buckets(
  uid TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  id INTEGER NOT NULL,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  in_use   INTEGER NOT NULL DEFAULT 1 CHECK (in_use IN (0,1)),
  is_saved INTEGER NOT NULL DEFAULT 0 CHECK (is_saved IN (0,1)),
  PRIMARY KEY (uid, id)
);
CREATE TABLE IF NOT EXISTS bucket_images(
  uid TEXT NOT NULL,
  bucket_id INTEGER NOT NULL,
  image TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (uid, bucket_id, image),
  FOREIGN KEY (uid, bucket_id) REFERENCES buckets(uid, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS states(
  uid TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  id INTEGER NOT NULL,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  node_count INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL,
  payload BLOB NOT NULL,
  PRIMARY KEY (uid, id)
);
CREATE INDEX IF NOT EXISTS states_by_name ON states(uid, name);
"""

CONNECTION_PRAGMAS = ('foreign_keys=ON', 'synchronous=FULL', 'journal_size_limit=67108864')

BUCKET_COLS = 'id, name, date, updated_at, in_use, is_saved'
# Never select the payload when listing: it is the last column, so its overflow pages are skipped.
STATE_META_COLS = 'id, name, date, updated_at, version, node_count, size_bytes'


def utcnow():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def connect(path):
    # Autocommit mode; writes use an explicit BEGIN IMMEDIATE (write_tx).
    conn = sqlite3.connect(path, timeout=30, isolation_level=None)
    try:
        conn.row_factory = sqlite3.Row
        for pragma in CONNECTION_PRAGMAS:
            conn.execute('PRAGMA ' + pragma)
    except BaseException:
        conn.close()
        raise
    return conn


def init_db(path):
    directory = os.path.dirname(os.path.abspath(path))
    os.makedirs(directory, exist_ok=True)
    conn = connect(path)
    try:
        version = conn.execute('PRAGMA user_version').fetchone()[0]
        if version > SCHEMA_VERSION:
            raise RuntimeError('%s has schema version %d; this code supports %d' % (path, version, SCHEMA_VERSION))
        if conn.execute('PRAGMA page_count').fetchone()[0] == 0:
            conn.execute('PRAGMA auto_vacuum=INCREMENTAL')  # must precede the first table
        conn.execute('PRAGMA journal_mode=WAL').fetchone()
        conn.executescript(SCHEMA)
        conn.execute('PRAGMA user_version=%d' % SCHEMA_VERSION)
    finally:
        conn.close()  # Windows: never leave file handles open


@contextmanager
def write_tx(conn):
    conn.execute('BEGIN IMMEDIATE')
    try:
        yield conn
    except BaseException:
        if conn.in_transaction:
            conn.execute('ROLLBACK')
        raise
    conn.execute('COMMIT')


@contextmanager
def read_tx(conn):
    # One snapshot for multi-query reads.
    conn.execute('BEGIN')
    try:
        yield conn
    finally:
        if conn.in_transaction:
            conn.execute('COMMIT')


def ensure_user(conn, uid):
    conn.execute('INSERT OR IGNORE INTO users(uid, created_at) VALUES (?, ?)', (uid, utcnow()))


_COUNTERS = {'bucket': ('next_bucket_id', 'buckets'), 'state': ('next_state_id', 'states')}  # fixed identifiers only


def alloc_id(conn, uid, kind):
    """Next never-reused id; call inside write_tx after ensure_user."""
    col, table = _COUNTERS[kind]
    (nid,) = conn.execute('SELECT MAX(u.%s, COALESCE((SELECT MAX(id) + 1 FROM %s WHERE uid = ?), 0)) '
                          'FROM users u WHERE u.uid = ?' % (col, table), (uid, uid)).fetchone()
    conn.execute('UPDATE users SET %s = ? WHERE uid = ?' % col, (nid + 1, uid))
    return nid


def encode_graph(graph):
    """graph = {'links': [...], 'nodes': [...]} -> (gzip payload, uncompressed size).

    sort_keys=True makes the JSON start with '{"links":', which GET /states/<id> relies on to splice the body.
    """
    raw = json.dumps(graph, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False).encode('ascii')
    return gzip.compress(raw, compresslevel=1, mtime=0), len(raw)


def decode_graph(payload):
    return gzip.decompress(payload)


def bucket_dict(row, images):
    return {
        'id': row['id'],
        'name': row['name'],
        'date': row['date'],
        'updatedAt': row['updated_at'],
        'inUse': bool(row['in_use']),
        'isSaved': bool(row['is_saved']),
        'images': images,
    }


def state_meta(row):
    return {
        'id': row['id'],
        'name': row['name'],
        'date': row['date'],
        'updatedAt': row['updated_at'],
        'version': row['version'],
        'nodeCount': row['node_count'],
        'sizeBytes': row['size_bytes'],
    }


def list_buckets(conn, uid):
    rows = conn.execute('SELECT %s FROM buckets WHERE uid = ? ORDER BY id' % BUCKET_COLS, (uid,)).fetchall()
    images = {}
    for bucket_id, image in conn.execute('SELECT bucket_id, image FROM bucket_images WHERE uid = ? '
                                         'ORDER BY bucket_id, rowid', (uid,)):
        images.setdefault(bucket_id, []).append(image)
    return [bucket_dict(row, images.get(row['id'], [])) for row in rows]


def get_bucket_row(conn, uid, bucket_id):
    return conn.execute('SELECT %s FROM buckets WHERE uid = ? AND id = ?' % BUCKET_COLS, (uid, bucket_id)).fetchone()


def get_bucket(conn, uid, bucket_id):
    row = get_bucket_row(conn, uid, bucket_id)
    if row is None:
        return None
    images = [r[0] for r in conn.execute('SELECT image FROM bucket_images WHERE uid = ? AND bucket_id = ? '
                                         'ORDER BY rowid', (uid, bucket_id))]
    return bucket_dict(row, images)


def list_states(conn, uid):
    rows = conn.execute('SELECT %s FROM states WHERE uid = ? ORDER BY id' % STATE_META_COLS, (uid,)).fetchall()
    return [state_meta(row) for row in rows]


def get_state_meta(conn, uid, state_id):
    row = conn.execute('SELECT %s FROM states WHERE uid = ? AND id = ?' % STATE_META_COLS, (uid, state_id)).fetchone()
    return state_meta(row) if row is not None else None


def find_state_by_name(conn, uid, name):
    row = conn.execute('SELECT %s FROM states WHERE uid = ? AND name = ? ORDER BY id LIMIT 1' % STATE_META_COLS,
                       (uid, name)).fetchone()
    return state_meta(row) if row is not None else None


def get_state_with_payload(conn, uid, state_id):
    row = conn.execute('SELECT %s, payload FROM states WHERE uid = ? AND id = ?' % STATE_META_COLS,
                       (uid, state_id)).fetchone()
    if row is None:
        return None, None
    return state_meta(row), row['payload']
