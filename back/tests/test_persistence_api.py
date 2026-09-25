"""Tests for the bucket/state persistence API.

Run from back/:  python -m unittest discover -s tests -v
Never imports app.py or utils.py (they load CLIP); every test uses its own temporary database.
"""
import base64
import gzip
import http.client
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from datetime import datetime, timezone
from unittest import mock

BACK_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACK_DIR not in sys.path:
    sys.path.insert(0, BACK_DIR)

USERDATA_DIR = os.path.join(BACK_DIR, 'userdata')
USERDATA_EXISTED = os.path.exists(USERDATA_DIR)

from flask import Flask, request  # noqa: E402

import persistence  # noqa: E402
from persistence import api, db, normalize  # noqa: E402

ORIGIN = 'http://localhost:4200'
UID = 'user_A-1'
BASE = '/api/users/' + UID
RUNTIME_KEYS = {'x', 'y', 'vx', 'vy', 'fx', 'fy', 'index', '__indexColor'}


_module_patches = []


def _refuse_userdata(fn):
    """Fail loudly if a test opens a database under back/userdata instead of its temp dir."""
    root = os.path.normcase(USERDATA_DIR)

    def wrapper(path, *args, **kwargs):
        full = os.path.normcase(os.path.abspath(path))
        if full == root or full.startswith(root + os.sep):
            raise AssertionError('a test opened %s' % path)
        return fn(path, *args, **kwargs)
    return wrapper


def setUpModule():
    for name in ('connect', 'init_db'):
        patcher = mock.patch.object(db, name, _refuse_userdata(getattr(db, name)))
        patcher.start()
        _module_patches.append(patcher)


def tearDownModule():
    for patcher in _module_patches:
        patcher.stop()
    if not USERDATA_EXISTED and os.path.exists(USERDATA_DIR):
        raise AssertionError('the tests created %s' % USERDATA_DIR)


def clean_env():
    """os.environ without REVEAL_* so defaults are deterministic."""
    return mock.patch.dict(os.environ, {k: v for k, v in os.environ.items() if not k.startswith('REVEAL_')},
                           clear=True)


def make_app(db_path, **config):
    """A plain Flask app wired exactly like app.py (persistence + CORS), plus stand-ins for two app.py routes."""
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.config.update(config)
    persistence.init_app(app, db_path=db_path)

    @app.route('/dataset/llm/<folder>/<path:filename>')
    def serve_image(folder, filename):
        return 'image'

    @app.post('/api/search')
    def search():
        return {'received': len(request.get_data())}

    persistence.init_cors(app)
    return app


def canonical(obj):
    return json.dumps(obj, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode('ascii')


def node(node_id, **fields):
    n = {'id': node_id, 'from': 'interface', 'iteractionType': 0, 'queryType': 0, 'similarityValue': 0.7,
         'textsQuery': ['tree'], 'imagesQuery': [], 'imagesIds': [1, 2], 'imagesSimilarities': [0.9, 0.8],
         'textsIds': [3], 'textsSimilarities': [0.5], 'locationsData': [], 'polygons': []}
    n.update(fields)
    return n


def small_graph(name='s', n=2):
    return {'name': name, 'nodes': [node(i) for i in range(n)],
            'links': [{'source': i - 1, 'target': i} for i in range(1, n)]}


class ApiTestCase(unittest.TestCase):
    config = {}

    def setUp(self):
        env = clean_env()
        env.start()
        self.addCleanup(env.stop)
        tmp = tempfile.TemporaryDirectory(prefix='reveal-test-')
        # Runs before env.stop; on Windows it fails if any SQLite handle was left open.
        self.addCleanup(tmp.cleanup)
        self.db_path = os.path.join(tmp.name, 'reveal.db')
        self.app = make_app(self.db_path, **self.config)
        self.client = self.app.test_client()

    # -- helpers --

    def call(self, method, path, body=None, raw=None, content_type='application/json', headers=None,
             client=None, base=BASE):
        kwargs = {'headers': headers or {}}
        if raw is not None:
            kwargs['data'] = raw
        elif body is not None:
            kwargs['data'] = json.dumps(body)
        if 'data' in kwargs and content_type is not None:
            kwargs['content_type'] = content_type
        return (client or self.client).open(base + path, method=method, **kwargs)

    def ok(self, resp, status=200):
        self.assertEqual(resp.status_code, status, resp.get_data(as_text=True)[:500])
        if status == 204:
            self.assertEqual(resp.data, b'')
            return None
        self.assertEqual(resp.mimetype, 'application/json')
        return json.loads(resp.data)

    def err(self, resp, status, code=None):
        self.assertEqual(resp.status_code, status, resp.get_data(as_text=True)[:500])
        self.assertEqual(resp.mimetype, 'application/json')
        body = json.loads(resp.data)
        self.assertIn('error', body)
        self.assertIn('message', body)
        if code is not None:
            self.assertEqual(body['error'], code)
        return body

    def sql(self, query, params=()):
        conn = sqlite3.connect(self.db_path)
        try:
            return conn.execute(query, params).fetchall()
        finally:
            conn.close()

    def sql_write(self, query, params=()):
        conn = sqlite3.connect(self.db_path)
        try:
            with conn:
                conn.execute(query, params)
        finally:
            conn.close()

    def create_bucket(self, name='b', uid_base=BASE):
        return self.ok(self.call('POST', '/buckets', {'name': name}, base=uid_base), 201)

    def buckets(self):
        return self.ok(self.call('GET', '/buckets'))['buckets']

    def create_state(self, name='s', graph=None):
        body = dict(graph or small_graph(name))
        body['name'] = name
        return self.ok(self.call('POST', '/states', body), 201)


class NoHeavyImportsTests(unittest.TestCase):
    def test_no_heavy_imports_in_this_process(self):
        for mod in ('torch', 'clip', 'pandas'):
            self.assertNotIn(mod, sys.modules)

    def test_no_heavy_imports_in_clean_interpreter(self):
        code = ('import sys; import persistence; from flask import Flask; '
                'persistence.init_cors(Flask("x")); '
                'print(",".join(m for m in ("torch", "clip", "pandas", "numpy", "utils", "app") if m in sys.modules))')
        with clean_env():
            out = subprocess.run([sys.executable, '-B', '-c', code], cwd=BACK_DIR, capture_output=True, text=True,
                                 timeout=120)
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertEqual(out.stdout.strip(), '')


class ConfigAndSchemaTests(unittest.TestCase):
    def test_default_config(self):
        app = Flask(__name__)
        with clean_env(), mock.patch.object(db, 'init_db') as init_db:
            persistence.init_app(app)
        expected = os.path.join(BACK_DIR, 'userdata', 'reveal.db')
        self.assertEqual(app.config['REVEAL_DB_PATH'], expected)
        init_db.assert_called_once_with(expected)
        self.assertEqual(app.config['REVEAL_MAX_BODY_BYTES'], 256 * 1024 * 1024)
        self.assertEqual(app.config['REVEAL_ALLOWED_ORIGINS'], ['http://localhost:4200', 'http://127.0.0.1:4200'])
        self.assertEqual(app.config['REVEAL_ALLOWED_HOSTS'], ['localhost', '127.0.0.1', '[::1]'])

    def test_env_overrides(self):
        app = Flask(__name__)
        env = {'REVEAL_DB_PATH': os.path.join('somewhere', 'x.db'), 'REVEAL_MAX_BODY_MB': '2',
               'REVEAL_ALLOWED_ORIGINS': 'http://a.test:1, http://b.test:2', 'REVEAL_ALLOWED_HOSTS': 'example.test'}
        with clean_env(), mock.patch.dict(os.environ, env), mock.patch.object(db, 'init_db') as init_db:
            persistence.init_app(app)
        init_db.assert_called_once_with(env['REVEAL_DB_PATH'])
        self.assertEqual(app.config['REVEAL_MAX_BODY_BYTES'], 2 * 1024 * 1024)
        self.assertEqual(app.config['REVEAL_ALLOWED_ORIGINS'], ['http://a.test:1', 'http://b.test:2'])
        self.assertEqual(app.config['REVEAL_ALLOWED_HOSTS'], ['example.test'])

    def test_schema_and_pragmas(self):
        with tempfile.TemporaryDirectory(prefix='reveal-test-') as tmp:
            path = os.path.join(tmp, 'nested', 'dir', 'reveal.db')
            db.init_db(path)
            db.init_db(path)  # idempotent
            conn = db.connect(path)
            try:
                pragma = lambda name: conn.execute('PRAGMA ' + name).fetchone()[0]  # noqa: E731
                self.assertEqual(pragma('journal_mode'), 'wal')
                self.assertEqual(pragma('auto_vacuum'), 2)  # INCREMENTAL
                self.assertEqual(pragma('user_version'), 1)
                self.assertEqual(pragma('foreign_keys'), 1)
                self.assertEqual(pragma('synchronous'), 2)  # FULL
                self.assertEqual(pragma('journal_size_limit'), 67108864)
                tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
                self.assertEqual(tables, {'users', 'buckets', 'bucket_images', 'states'})
                user_cols = [r[1] for r in conn.execute('PRAGMA table_info(users)')]
                state_cols = [r[1] for r in conn.execute('PRAGMA table_info(states)')]
                self.assertNotIn('legacy_imported_at', user_cols)
                self.assertNotIn('payload_sha256', state_cols)
                self.assertEqual(state_cols[-1], 'payload')
                indexes = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'index'")}
                self.assertIn('states_by_name', indexes)
                self.assertNotIn('states_by_hash', indexes)
            finally:
                conn.close()

    def test_tests_cannot_open_the_real_database(self):
        with self.assertRaises(AssertionError):
            db.connect(os.path.join(USERDATA_DIR, 'reveal.db'))
        with self.assertRaises(AssertionError):
            db.init_db(os.path.join(USERDATA_DIR, 'reveal.db'))

    def test_newer_schema_is_refused(self):
        with tempfile.TemporaryDirectory(prefix='reveal-test-') as tmp:
            path = os.path.join(tmp, 'reveal.db')
            db.init_db(path)
            conn = sqlite3.connect(path)
            conn.execute('PRAGMA user_version=2')
            conn.close()
            with self.assertRaises(RuntimeError):
                db.init_db(path)


class CollectionTests(ApiTestCase):
    def test_unknown_uid_is_empty_and_read_only(self):
        body = self.ok(self.call('GET', '/collection'))
        self.assertEqual(body, {'uid': UID, 'buckets': [], 'states': []})
        self.ok(self.call('GET', '/buckets'))
        self.ok(self.call('GET', '/states'))
        self.assertEqual(self.sql('SELECT COUNT(*) FROM users'), [(0,)])

    def test_collection_has_buckets_and_state_metas_only(self):
        bucket = self.create_bucket('trees')
        meta = self.create_state('chicago')
        body = self.ok(self.call('GET', '/collection'))
        self.assertEqual(body['uid'], UID)
        self.assertEqual(body['buckets'], [bucket])
        self.assertEqual(body['states'], [meta])
        self.assertNotIn('nodes', body['states'][0])
        self.assertNotIn('links', body['states'][0])

    def test_users_are_isolated(self):
        other = '/api/users/other'
        self.create_bucket('a1')
        self.create_bucket('a2')
        b = self.create_bucket('b', uid_base=other)
        self.assertEqual(b['id'], 1)  # ids are per user
        self.err(self.call('PATCH', '/buckets/2', {'name': 'x'}, base=other), 404, 'not_found')
        self.err(self.call('POST', '/buckets/2/images', {'images': ['1.jpg']}, base=other), 404, 'not_found')
        self.ok(self.call('PATCH', '/buckets/1', {'name': 'renamed'}, base=other))
        self.ok(self.call('DELETE', '/buckets/1', base=other), 204)
        self.assertEqual([x['name'] for x in self.buckets()], ['a1', 'a2'])
        self.create_state('s')
        self.err(self.call('GET', '/states/1', base=other), 404, 'not_found')
        self.err(self.call('DELETE', '/states/1', base=other), 404, 'not_found')
        self.assertEqual(self.ok(self.call('GET', '/collection', base=other)),
                         {'uid': 'other', 'buckets': [], 'states': []})


class BucketTests(ApiTestCase):
    def test_create_shape(self):
        b = self.create_bucket('  trees  ')
        self.assertEqual(set(b), {'id', 'name', 'date', 'updatedAt', 'inUse', 'isSaved', 'images'})
        self.assertEqual((b['id'], b['name'], b['inUse'], b['isSaved'], b['images']), (1, 'trees', True, False, []))
        date = datetime.fromisoformat(b['date'])
        self.assertEqual(date.utcoffset(), timezone.utc.utcoffset(None))
        self.assertEqual(b['updatedAt'], b['date'])

    def test_lifecycle_and_id_non_reuse(self):
        self.assertEqual(self.create_bucket('one')['id'], 1)
        self.assertEqual(self.create_bucket('two')['id'], 2)

        saved = self.ok(self.call('PATCH', '/buckets/1', {'isSaved': True}))
        self.assertEqual((saved['inUse'], saved['isSaved']), (True, True))
        closed = self.ok(self.call('PATCH', '/buckets/1', {'inUse': False}))
        self.assertEqual((closed['inUse'], closed['isSaved']), (False, True))
        reopened = self.ok(self.call('PATCH', '/buckets/1', {'inUse': True}))
        self.assertTrue(reopened['inUse'])

        self.err(self.call('PATCH', '/buckets/2', {'inUse': False}), 409, 'would_orphan')
        self.ok(self.call('PATCH', '/buckets/1', {'inUse': False}))
        self.err(self.call('PATCH', '/buckets/1', {'isSaved': False}), 409, 'would_orphan')
        self.assertEqual([(b['inUse'], b['isSaved']) for b in self.buckets()], [(False, True), (True, False)])

        self.ok(self.call('DELETE', '/buckets/2'), 204)
        self.assertEqual([b['id'] for b in self.buckets()], [1])
        self.assertEqual(self.create_bucket('three')['id'], 3)
        # deleting the highest id does not free it either
        self.ok(self.call('DELETE', '/buckets/3'), 204)
        self.assertEqual(self.create_bucket('four')['id'], 4)

    def test_patch_name_and_flags_together(self):
        self.create_bucket('old')
        b = self.ok(self.call('PATCH', '/buckets/1', {'name': ' new ', 'isSaved': True, 'inUse': False}))
        self.assertEqual((b['name'], b['inUse'], b['isSaved']), ('new', False, True))

    def test_patch_validation(self):
        self.create_bucket()
        cases = [({'inUse': 1}, 'invalid_request'), ({'isSaved': 'true'}, 'invalid_request'),
                 ({'inUse': None}, 'invalid_request'), ({'color': 'red'}, 'unknown_fields'),
                 ({'name': 'x', 'images': []}, 'unknown_fields'), ({}, 'invalid_request'),
                 ({'name': ''}, 'invalid_name'), ({'name': '   '}, 'invalid_name'), ({'name': 5}, 'invalid_name'),
                 ({'name': 'x' * 201}, 'invalid_name')]
        for body, code in cases:
            with self.subTest(body=body):
                self.err(self.call('PATCH', '/buckets/1', body), 400, code)
        self.assertEqual(self.buckets()[0]['name'], 'b')
        self.err(self.call('PATCH', '/buckets/99', {'isSaved': True}), 404, 'not_found')
        self.err(self.call('DELETE', '/buckets/99'), 404, 'not_found')

    def test_create_validation(self):
        for body in ({}, {'name': ''}, {'name': '  '}, {'name': None}, {'name': ['a']}, {'name': 'x' * 201}):
            with self.subTest(body=body):
                self.err(self.call('POST', '/buckets', body), 400, 'invalid_name')
        self.assertEqual(self.create_bucket('x' * 200)['name'], 'x' * 200)
        self.assertEqual(self.create_bucket('São Paulo ✓')['name'], 'São Paulo ✓')
        self.err(self.call('POST', '/buckets', raw=b'{"name": "\\ud800"}'), 400, 'invalid_name')
        self.assertEqual(self.sql('SELECT COUNT(*) FROM buckets'), [(2,)])

    def test_delete_cascades_images(self):
        self.create_bucket()
        self.ok(self.call('POST', '/buckets/1/images', {'images': ['1.jpg', '2.jpg']}))
        self.ok(self.call('DELETE', '/buckets/1'), 204)
        self.assertEqual(self.sql('SELECT COUNT(*) FROM bucket_images'), [(0,)])


class ImageTests(ApiTestCase):
    def test_normalization_dedupe_and_order(self):
        self.create_bucket()
        refs = ['http://localhost:8001/dataset/llm/thumbnails/5.jpg', '5.jpg',
                'https://storage.googleapis.com/trabalho_final/dataset/llm/thumbnails/7.jpg',
                'http://localhost:8001/dataset/llm/processed/3.jpg', '  9.jpg ',
                'http://localhost:8001/dataset/llm/thumbnails/a%20b.jpg']
        b = self.ok(self.call('POST', '/buckets/1/images', {'images': refs}))
        self.assertEqual(b['images'], ['5.jpg', '7.jpg', '3.jpg', '9.jpg', 'a b.jpg'])
        b = self.ok(self.call('POST', '/buckets/1/images', {'images': ['1.jpg', '7.jpg']}))
        self.assertEqual(b['images'], ['5.jpg', '7.jpg', '3.jpg', '9.jpg', 'a b.jpg', '1.jpg'])
        self.assertEqual(self.buckets()[0]['images'], b['images'])

    def test_repost_is_idempotent(self):
        self.create_bucket()
        batch = {'images': ['1.jpg', '2.jpg', '3.jpg']}
        first = self.ok(self.call('POST', '/buckets/1/images', batch))
        sentinel = '2000-01-01T00:00:00+00:00'  # timestamps have 1 s resolution; a sentinel makes a touch visible
        self.sql_write('UPDATE buckets SET updated_at = ?', (sentinel,))
        second = self.ok(self.call('POST', '/buckets/1/images', batch))
        self.assertEqual(first['images'], second['images'])
        self.assertEqual(second['updatedAt'], sentinel)
        self.assertEqual(self.sql('SELECT COUNT(*) FROM bucket_images'), [(3,)])

    def test_invalid_batch_inserts_nothing(self):
        self.create_bucket()
        bad_values = [None, '../app.py', 'a/b.jpg', 5, '', '   ', 'a\\b.jpg', 'C:x.jpg', 'x\x01.jpg', True, {},
                      ['1.jpg'], 'x' * 256, 'http://localhost:8001/dataset/llm/thumbnails/..%2Fapp.py',
                      'http://localhost:8001/dataset/llm/thumbnails/', 'http://evil.example/other/1.jpg',
                      'http://localhost:8001/dataset/llm/thumbnails/1.jpg?x=1']
        for bad in bad_values:
            with self.subTest(bad=bad):
                body = self.err(self.call('POST', '/buckets/1/images', {'images': ['8.jpg', bad, '9.jpg']}), 400,
                                'invalid_images')
                self.assertEqual(body['invalid'], [bad])
                self.assertEqual(body['invalidCount'], 1)
        self.err(self.call('POST', '/buckets/1/images', raw=b'{"images": ["\\udc00.jpg"]}'), 400, 'invalid_images')
        for body in ({}, {'images': '1.jpg'}, {'images': None}):
            with self.subTest(body=body):
                self.err(self.call('POST', '/buckets/1/images', body), 400, 'invalid_images')
        self.assertEqual(self.sql('SELECT COUNT(*) FROM bucket_images'), [(0,)])
        self.assertEqual(self.buckets()[0]['images'], [])

    def test_unknown_bucket(self):
        self.err(self.call('POST', '/buckets/1/images', {'images': ['1.jpg']}), 404, 'not_found')
        self.assertEqual(self.sql('SELECT COUNT(*) FROM bucket_images'), [(0,)])

    def test_batch_size_limit(self):
        self.create_bucket()
        images = ['%d.jpg' % i for i in range(normalize.MAX_IMAGES_PER_REQUEST)]
        b = self.ok(self.call('POST', '/buckets/1/images', {'images': images}))
        self.assertEqual(len(b['images']), len(images))
        self.assertEqual(b['images'][:3], ['0.jpg', '1.jpg', '2.jpg'])
        self.err(self.call('POST', '/buckets/1/images', {'images': images + ['x.jpg']}), 400, 'too_many_images')
        self.assertNotIn('x.jpg', self.buckets()[0]['images'])

    def test_failure_mid_transaction_rolls_back(self):
        self.create_bucket()
        with mock.patch.object(api, 'touch_bucket', side_effect=RuntimeError('disk on fire')), \
                self.assertLogs(self.app.logger, 'ERROR'):
            self.err(self.call('POST', '/buckets/1/images', {'images': ['1.jpg', '2.jpg']}), 500, 'internal')
        self.assertEqual(self.sql('SELECT COUNT(*) FROM bucket_images'), [(0,)])
        # the connection is usable again afterwards
        self.assertEqual(self.ok(self.call('POST', '/buckets/1/images', {'images': ['1.jpg']}))['images'], ['1.jpg'])

    def test_image_key(self):
        key = normalize.image_key
        self.assertEqual(key('12345.jpg'), '12345.jpg')
        self.assertEqual(key('https://storage.googleapis.com/x/dataset/llm/processed/1.png'), '1.png')
        self.assertIsNone(key('https://host/thumbnails/a/b.jpg'))
        self.assertIsNone(key('a..b'))
        self.assertIsNone(key('x\x7f'))

    def test_long_crafted_ref_is_rejected_before_the_regex(self):
        start = time.perf_counter()
        self.assertIsNone(normalize.image_key('/thumbnails/' * 8000 + '?'))  # ~5 s if the regex ran on it
        self.assertLess(time.perf_counter() - start, 1.0)
        name = 'a' * 250 + '.jpg'
        self.assertEqual(normalize.image_key('http://localhost:8001/dataset/llm/thumbnails/' + name), name)


class WriteTxTests(unittest.TestCase):
    def test_rollback_on_error_keeps_connection_usable(self):
        tmp = tempfile.TemporaryDirectory(prefix='reveal-test-')
        self.addCleanup(tmp.cleanup)
        path = os.path.join(tmp.name, 'reveal.db')
        db.init_db(path)
        conn = db.connect(path)
        try:
            with self.assertRaises(api.ApiError):
                with db.write_tx(conn):
                    db.ensure_user(conn, 'u')
                    raise api.ApiError(409, 'conflict', 'x')
            self.assertFalse(conn.in_transaction)
            self.assertEqual(conn.execute('SELECT COUNT(*) FROM users').fetchone()[0], 0)
            with db.write_tx(conn):  # BEGIN IMMEDIATE would fail inside a leftover transaction
                db.ensure_user(conn, 'u')
            self.assertEqual(conn.execute('SELECT COUNT(*) FROM users').fetchone()[0], 1)
        finally:
            conn.close()


class ConcurrencyTests(ApiTestCase):
    THREADS = 8

    def run_threads(self, work):
        barrier = threading.Barrier(self.THREADS)
        results = [None] * self.THREADS
        errors = []

        def runner(i):
            try:
                client = self.app.test_client()
                barrier.wait(timeout=30)
                results[i] = work(i, client)
            except BaseException as e:  # noqa: B902 - reported below
                errors.append(e)

        threads = [threading.Thread(target=runner, args=(i,)) for i in range(self.THREADS)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(120)
        self.assertEqual(errors, [])
        return results

    def test_concurrent_image_batches_leave_the_union(self):
        self.create_bucket()

        def work(i, client):
            images = ['%d.jpg' % j for j in range(i * 50, i * 50 + 100)]  # overlaps the next thread's batch
            resp = self.call('POST', '/buckets/1/images', {'images': images}, client=client)
            return resp.status_code

        self.assertEqual(self.run_threads(work), [200] * self.THREADS)
        images = self.buckets()[0]['images']
        self.assertEqual(len(images), len(set(images)))
        self.assertEqual(set(images), {'%d.jpg' % j for j in range((self.THREADS - 1) * 50 + 100)})

    def test_concurrent_creates_get_distinct_ids(self):
        def work(i, client):
            resp = self.call('POST', '/buckets', {'name': 'b%d' % i}, client=client)
            return resp.status_code, json.loads(resp.data)['id']

        results = self.run_threads(work)
        self.assertEqual({status for status, _ in results}, {201})
        self.assertEqual(sorted(i for _, i in results), list(range(1, self.THREADS + 1)))
        self.assertEqual(self.sql('SELECT next_bucket_id FROM users'), [(self.THREADS + 1,)])

    def test_concurrent_same_name_state_creates(self):
        def work(i, client):
            resp = self.call('POST', '/states', small_graph('same'), client=client)
            return resp.status_code, json.loads(resp.data)

        results = self.run_threads(work)
        created = [body for status, body in results if status == 201]
        conflicts = [body for status, body in results if status == 409]
        self.assertEqual(len(created), 1)
        self.assertEqual(len(conflicts), self.THREADS - 1)
        for body in conflicts:
            self.assertEqual(body['error'], 'name_exists')
            self.assertEqual(body['existing']['id'], created[0]['id'])
        self.assertEqual(self.sql('SELECT COUNT(*) FROM states'), [(1,)])

    def test_concurrent_puts_with_expected_version(self):
        self.create_state('s')

        def work(i, client):
            body = small_graph('s', n=i + 1)
            body['expectedVersion'] = 1
            return self.call('PUT', '/states/1', body, client=client).status_code

        statuses = self.run_threads(work)
        self.assertEqual(sorted(statuses), [200] + [409] * (self.THREADS - 1))
        self.assertEqual(self.ok(self.call('GET', '/states'))['states'][0]['version'], 2)


def big_state(n_nodes=20, n_ids=55000):
    """About 15 MB of JSON shaped like a real force-graph export, including runtime noise."""
    ring = [[-87.6 + i * 1e-3, 41.8 + (i % 7) * 1e-3] for i in range(60)]
    polygon = {'type': 'Feature', 'properties': {'name': 'loop'},
               'geometry': {'type': 'Polygon', 'coordinates': [ring, ring[:10]]}}
    photo = 'data:image/jpeg;base64,' + base64.b64encode(bytes(range(256)) * 600).decode('ascii')
    sims = [round(((i * 7919) % 10000) / 10000, 4) for i in range(n_ids)]
    nodes = []
    for k in range(n_nodes):
        nodes.append({
            'id': k, 'from': 'interface' if k == 0 else 'union', 'iteractionType': k % 3, 'queryType': k % 3,
            'similarityValue': [0.7, 0.55] if k % 2 else 0.7,
            'textsQuery': [['chicago', 'río'], ['lake']] if k % 2 else ['chicago'],
            'imagesQuery': [photo] if k < 3 else [],
            'imagesIds': list(range(k, k + n_ids)), 'imagesSimilarities': sims,
            'textsIds': list(range(1000)), 'textsSimilarities': sims[:1000],
            'locationsData': [[], [[]]] if k % 2 else [],
            'polygons': [polygon] if k % 4 == 0 else [],
            'x': 12.5, 'y': -3.25, 'vx': 0.01, 'vy': -0.02, 'fx': None, 'fy': 0, 'index': k,
            '__indexColor': '#0a0b%02x' % k,
        })
    links = []
    for k in range(1, n_nodes):
        if k % 2:  # d3-mutated link: endpoints are node objects
            links.append({'source': {'id': k - 1, 'x': 1}, 'target': {'id': k, 'x': 2}, 'index': k - 1})
        else:
            links.append({'source': k - 1, 'target': k})
    links.append({'source': 0, 'target': 999})  # dangling
    return {'name': 'chicago', 'nodes': nodes, 'links': links}


class StateTests(ApiTestCase):
    def test_large_state_round_trip(self):
        sent = big_state()
        raw = json.dumps(sent).encode('utf-8')
        self.assertGreater(len(raw), 13 * 1024 * 1024)

        meta = self.ok(self.call('POST', '/states', raw=raw), 201)
        self.assertEqual(set(meta), {'id', 'name', 'date', 'updatedAt', 'version', 'nodeCount', 'sizeBytes'})
        self.assertEqual((meta['id'], meta['name'], meta['version'], meta['nodeCount']), (1, 'chicago', 1, 20))

        # the expected stored graph, built independently of the server's normalizer
        expected_nodes = []
        for n in sent['nodes']:
            e = {k: v for k, v in n.items() if k not in RUNTIME_KEYS}
            e['locationsData'] = []
            expected_nodes.append(e)
        expected_links = [{'source': k - 1, 'target': k} for k in range(1, 20)]
        expected_graph = canonical({'links': expected_links, 'nodes': expected_nodes})
        self.assertEqual(meta['sizeBytes'], len(expected_graph))

        listing = self.ok(self.call('GET', '/states'))
        self.assertEqual(listing, {'states': [meta]})

        resp = self.call('GET', '/states/1')
        got = self.ok(resp)
        # spliced, compact, and byte-equal to the canonical graph
        self.assertTrue(resp.data.endswith(expected_graph[1:]))
        self.assertNotIn(b'\n', resp.data)
        self.assertEqual({k: got[k] for k in meta}, meta)
        self.assertEqual(got['links'], expected_links)
        self.assertEqual(len(got['nodes']), 20)
        for sent_node, got_node in zip(sent['nodes'], got['nodes']):
            self.assertEqual(set(got_node), set(sent_node) - RUNTIME_KEYS)
            self.assertEqual(got_node['locationsData'], [])
            for key in set(sent_node) - RUNTIME_KEYS - {'locationsData'}:
                self.assertEqual(canonical(got_node[key]), canonical(sent_node[key]), key)
        coords = got['nodes'][0]['polygons'][0]['geometry']['coordinates']
        self.assertIsInstance(coords[0][0], list)
        self.assertEqual(coords, sent['nodes'][0]['polygons'][0]['geometry']['coordinates'])

        # storage: gzip with mtime 0, payload starting with {"links":
        (payload,) = self.sql('SELECT payload FROM states')[0]
        self.assertEqual(payload[4:8], b'\x00\x00\x00\x00')
        self.assertLess(len(payload), meta['sizeBytes'])
        self.assertEqual(gzip.decompress(payload), expected_graph)

    def test_polygons_and_link_normalization(self):
        polygon = [{'type': 'Feature', 'geometry': {'type': 'Polygon', 'coordinates': [[[1, 2], [3, 4], [1, 2]]]}}]
        body = {'name': 'p', 'nodes': [node(1, polygons=json.dumps(polygon)), node(2, polygons={'a': 1}),
                                       node(3, polygons=None), node(4, polygons='"text"')],
                'links': [{'source': {'id': 1}, 'target': 2}, {'source': 1, 'target': {'id': 5}}]}
        del body['nodes'][3]['locationsData']
        self.create_state('p', body)
        got = self.ok(self.call('GET', '/states/1'))
        self.assertEqual([n['polygons'] for n in got['nodes']], [polygon, [], [], []])
        self.assertEqual([n['locationsData'] for n in got['nodes']], [[], [], [], []])
        self.assertEqual(got['links'], [{'source': 1, 'target': 2}])

    def test_other_fields_kept_as_sent(self):
        n = node(7, extra={'nested': [1, 'two', None]}, similarityValue=[0.1, 0.2], queryType=2, flag=False)
        self.create_state('k', {'nodes': [n], 'links': []})
        got = self.ok(self.call('GET', '/states/1'))['nodes'][0]
        for key in ('extra', 'similarityValue', 'queryType', 'flag', 'from', 'imagesQuery'):
            self.assertEqual(got[key], n[key])

    def test_graph_validation(self):
        base = small_graph('v')
        cases = {
            'nodes missing': {'name': 'v', 'links': []},
            'links missing': {'name': 'v', 'nodes': []},
            'nodes object': {'name': 'v', 'nodes': {}, 'links': []},
            'links string': {'name': 'v', 'nodes': [], 'links': 'x'},
            'node not object': {'name': 'v', 'nodes': [5], 'links': []},
            'id missing': {'name': 'v', 'nodes': [{'from': 'x'}], 'links': []},
            'id string': {'name': 'v', 'nodes': [node('1')], 'links': []},
            'id bool': {'name': 'v', 'nodes': [node(True)], 'links': []},
            'id float': {'name': 'v', 'nodes': [node(1.5)], 'links': []},
            'imagesIds not array': {'name': 'v', 'nodes': [node(1, imagesIds=5)], 'links': []},
            'textsQuery string': {'name': 'v', 'nodes': [node(1, textsQuery='tree')], 'links': []},
            'similarities null': {'name': 'v', 'nodes': [node(1, imagesSimilarities=None)], 'links': []},
            'bad polygons json': {'name': 'v', 'nodes': [node(1, polygons='[{')], 'links': []},
            'link not object': dict(base, links=[5]),
            'link string endpoint': dict(base, links=[{'source': 'a', 'target': 1}]),
            'link bool endpoint': dict(base, links=[{'source': True, 'target': 1}]),
            'link missing endpoint': dict(base, links=[{'source': 0}]),
        }
        self.create_state('target')
        for label, body in cases.items():
            with self.subTest(label):
                self.err(self.call('POST', '/states', body), 400, 'invalid_graph')
                self.err(self.call('PUT', '/states/1', body), 400, 'invalid_graph')
        self.assertEqual(self.ok(self.call('GET', '/states/1'))['version'], 1)
        self.assertEqual(self.sql('SELECT COUNT(*) FROM states'), [(1,)])
        empty = self.create_state('empty', {'nodes': [], 'links': []})
        self.assertEqual(empty['nodeCount'], 0)
        for body in ({'nodes': [], 'links': []}, {'name': '', 'nodes': [], 'links': []},
                     {'name': 7, 'nodes': [], 'links': []}, {'name': 'x' * 201, 'nodes': [], 'links': []}):
            with self.subTest(body=body):
                self.err(self.call('POST', '/states', body), 400, 'invalid_name')

    def test_ids_start_at_1_and_are_never_reused(self):
        self.assertEqual(self.create_state('a')['id'], 1)
        self.assertEqual(self.create_state('b')['id'], 2)
        self.ok(self.call('DELETE', '/states/2'), 204)
        self.assertEqual(self.create_state('c')['id'], 3)
        self.assertEqual(self.create_bucket()['id'], 1)  # separate counters

    def test_delete_runs_incremental_vacuum(self):
        noise = base64.b64encode(os.urandom(2 * 1024 * 1024)).decode('ascii')  # incompressible
        self.create_state('big', {'nodes': [node(1, imagesQuery=[noise])], 'links': []})
        pages_before = self.sql('PRAGMA page_count')[0][0]
        self.ok(self.call('DELETE', '/states/1'), 204)
        self.assertEqual(self.sql('PRAGMA freelist_count'), [(0,)])
        self.assertLess(self.sql('PRAGMA page_count')[0][0], pages_before // 4)
        self.err(self.call('GET', '/states/1'), 404, 'not_found')


class ConflictTests(ApiTestCase):
    def test_name_exists_and_version_conflict(self):
        first = self.create_state('a')
        body = self.err(self.call('POST', '/states', small_graph('a')), 409, 'name_exists')
        self.assertEqual(body['existing'], first)
        self.err(self.call('POST', '/states', small_graph('  a ')), 409, 'name_exists')

        conflict = small_graph('a', n=3)
        conflict['expectedVersion'] = 0
        body = self.err(self.call('PUT', '/states/1', conflict), 409, 'version_conflict')
        self.assertEqual(body['current'], first)

        good = small_graph('a', n=3)
        good['expectedVersion'] = 1
        meta = self.ok(self.call('PUT', '/states/1', good))
        self.assertEqual((meta['id'], meta['version'], meta['nodeCount'], meta['name']), (1, 2, 3, 'a'))
        self.assertEqual(meta['date'], first['date'])

        no_version = {'nodes': [node(1)], 'links': []}  # expectedVersion and name are optional
        meta = self.ok(self.call('PUT', '/states/1', no_version))
        self.assertEqual((meta['version'], meta['nodeCount'], meta['name']), (3, 1, 'a'))
        self.assertEqual(len(self.ok(self.call('GET', '/states/1'))['nodes']), 1)

        for bad in ('1', True, 1.0):
            with self.subTest(expectedVersion=bad):
                self.err(self.call('PUT', '/states/1', dict(no_version, expectedVersion=bad)), 400, 'invalid_request')

        self.err(self.call('PUT', '/states/42', no_version), 404, 'not_found')

        second = self.create_state('b')
        body = self.err(self.call('PUT', '/states/1', dict(no_version, name='b')), 409, 'name_exists')
        self.assertEqual(body['existing'], second)
        renamed = self.ok(self.call('PUT', '/states/1', dict(no_version, name='c')))
        self.assertEqual(renamed['name'], 'c')
        same = self.ok(self.call('PUT', '/states/1', dict(no_version, name='c')))
        self.assertEqual((same['name'], same['version']), ('c', renamed['version'] + 1))

        self.ok(self.call('DELETE', '/states/1'), 204)
        self.err(self.call('GET', '/states/1'), 404, 'not_found')
        self.err(self.call('DELETE', '/states/1'), 404, 'not_found')
        self.err(self.call('PUT', '/states/1', no_version), 404, 'not_found')
        self.assertEqual(self.create_state('c')['id'], 3)  # the freed name can be reused, the id cannot


class BodyLimitTests(ApiTestCase):
    config = {'REVEAL_MAX_BODY_BYTES': 1024}

    def test_413_is_json_and_nothing_is_stored(self):
        body = small_graph('big')
        body['nodes'][0]['imagesIds'] = list(range(1000))
        resp = self.call('POST', '/states', body, headers={'Origin': ORIGIN})
        self.err(resp, 413, 'body_too_large')
        self.assertEqual(resp.headers.get('Access-Control-Allow-Origin'), ORIGIN)
        self.assertEqual(self.ok(self.call('GET', '/states')), {'states': []})

        self.create_bucket()
        self.err(self.call('POST', '/buckets/1/images', {'images': ['%d.jpg' % i for i in range(300)]}), 413,
                 'body_too_large')
        self.ok(self.call('POST', '/buckets/1/images', {'images': ['1.jpg']}))

    def test_413_for_chunked_bodies(self):
        # Needs a real server: only there does Werkzeug cut a chunked body at the limit instead of raising 413.
        from werkzeug.serving import make_server
        server = make_server('127.0.0.1', 0, self.app, threaded=True)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)

        def post_chunked(path, payload):
            conn = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=30)
            try:
                # A generator body without Content-Length makes http.client send Transfer-Encoding: chunked
                conn.request('POST', BASE + path, body=iter([json.dumps(payload).encode()]),
                             headers={'Content-Type': 'application/json'})
                resp = conn.getresponse()
                return resp.status, json.loads(resp.read())
            finally:
                conn.close()

        body = small_graph('big')
        body['nodes'][0]['imagesIds'] = list(range(1000))
        status, data = post_chunked('/states', body)
        self.assertEqual((status, data['error']), (413, 'body_too_large'))
        self.assertEqual(self.ok(self.call('GET', '/states')), {'states': []})
        status, data = post_chunked('/buckets', {'name': 'small'})
        self.assertEqual((status, data['name']), (201, 'small'))

    def test_limit_only_applies_to_persistence_routes(self):
        resp = self.client.post('/api/search', data=b'x' * 4096, content_type='application/json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json(), {'received': 4096})


class ValidationTests(ApiTestCase):
    def test_415_for_non_json_bodies(self):
        payload = json.dumps({'name': 'x'})
        for content_type in ('text/plain', 'application/x-www-form-urlencoded', None):
            with self.subTest(content_type=content_type):
                self.err(self.call('POST', '/buckets', raw=payload, content_type=content_type), 415,
                         'unsupported_media_type')
        self.err(self.call('POST', '/states', raw=payload, content_type='text/plain'), 415)
        self.err(self.call('PATCH', '/buckets/1', raw=payload, content_type='text/plain'), 415)
        self.assertEqual(self.sql('SELECT COUNT(*) FROM buckets'), [(0,)])
        self.ok(self.call('POST', '/buckets', raw=payload, content_type='application/json; charset=utf-8'), 201)

    def test_invalid_json(self):
        for raw in (b'{bad', b'', b'{"name": "x",}', b'\xff\xfe\x00', b'[' * 100000):
            with self.subTest(raw=raw[:10]):
                self.err(self.call('POST', '/buckets', raw=raw), 400, 'invalid_json')

    def test_nan_and_infinity_are_400(self):
        for constant in (b'NaN', b'Infinity', b'-Infinity', b'1e999', b'-1e999'):
            with self.subTest(constant=constant):
                raw = b'{"name":"n","nodes":[{"id":1,"similarityValue":' + constant + b'}],"links":[]}'
                self.err(self.call('POST', '/states', raw=raw), 400, 'invalid_json')
        polygons = json.dumps('[{"coordinates": [NaN]}]')
        raw = ('{"name":"n","nodes":[{"id":1,"polygons":%s}],"links":[]}' % polygons).encode()
        self.err(self.call('POST', '/states', raw=raw), 400, 'invalid_graph')
        self.assertEqual(self.sql('SELECT COUNT(*) FROM states'), [(0,)])

    def test_body_must_be_an_object(self):
        for raw in (b'[]', b'"x"', b'5', b'null'):
            with self.subTest(raw=raw):
                self.err(self.call('POST', '/states', raw=raw), 400, 'invalid_request')

    def test_bad_uid(self):
        for uid in ('a.b', 'a' * 129, 'a%20b', 'abc%0A', '%C3%A4', 'a+b', '..'):
            with self.subTest(uid=uid):
                self.err(self.call('GET', '/collection', base='/api/users/' + uid), 400, 'invalid_uid')
                self.err(self.call('POST', '/buckets', {'name': 'x'}, base='/api/users/' + uid), 400, 'invalid_uid')
        self.assertEqual(self.sql('SELECT COUNT(*) FROM users'), [(0,)])
        for uid in ('a' * 128, '_-', 'Zx9'):
            with self.subTest(uid=uid):
                self.ok(self.call('GET', '/collection', base='/api/users/' + uid))

    def test_huge_ids_are_404_not_500(self):
        self.err(self.call('GET', '/states/99999999999999999999'), 404, 'not_found')
        self.err(self.call('DELETE', '/buckets/9223372036854775808'), 404, 'not_found')
        self.err(self.call('DELETE', '/buckets/9223372036854775807'), 404, 'not_found')
        # beyond Python's 4300-digit int() limit: must still be a JSON 404, not a routing 500
        self.err(self.call('GET', '/states/' + '9' * 5000), 404, 'not_found')
        self.err(self.call('PATCH', '/buckets/' + '9' * 5000, {'name': 'x'}), 404, 'not_found')

    def test_too_deep_graph_is_400(self):
        with mock.patch.object(db, 'encode_graph', side_effect=RecursionError('maximum recursion depth exceeded')):
            self.err(self.call('POST', '/states', small_graph('deep')), 400, 'invalid_graph')
        self.assertEqual(self.sql('SELECT COUNT(*) FROM states'), [(0,)])


class GuardTests(ApiTestCase):
    def test_forbidden_origin(self):
        for origin in ('http://evil.example', 'null', 'http://localhost:4201', 'https://localhost:4200', ''):
            with self.subTest(origin=origin):
                resp = self.call('GET', '/buckets', headers={'Origin': origin})
                self.err(resp, 403, 'forbidden_origin')
                if origin:
                    self.assertNotIn(origin, resp.headers.getlist('Access-Control-Allow-Origin'))

    def test_forbidden_host(self):
        for host in ('evil.example:8001', 'evil.example', 'localhost.evil.example', '192.168.0.10:8001',
                     'localhost.:8001'):
            with self.subTest(host=host):
                self.err(self.call('GET', '/buckets', headers={'Host': host}), 403, 'forbidden_host')

    def test_allowed_hosts_and_origins(self):
        for host in ('localhost:8001', 'localhost', '127.0.0.1:8001', '[::1]:8001', 'LOCALHOST:8001'):
            with self.subTest(host=host):
                self.ok(self.call('GET', '/buckets', headers={'Host': host}))
        for origin in (ORIGIN, 'http://127.0.0.1:4200', 'HTTP://LOCALHOST:4200'):
            with self.subTest(origin=origin):
                resp = self.call('GET', '/buckets', headers={'Origin': origin})
                self.ok(resp)
                self.assertEqual(resp.headers.get('Access-Control-Allow-Origin'), origin)

    def test_guards_block_writes(self):
        self.err(self.call('POST', '/buckets', {'name': 'x'}, headers={'Origin': 'http://evil.example'}), 403)
        self.err(self.call('POST', '/states', small_graph(), headers={'Host': 'evil.example:8001'}), 403)
        self.assertEqual(self.sql('SELECT COUNT(*) FROM users'), [(0,)])

    def test_guards_are_scoped_to_persistence(self):
        resp = self.client.post('/api/search', data=b'{}', content_type='application/json',
                                headers={'Host': 'evil.example:8001'})
        self.assertEqual(resp.status_code, 200)

    def test_custom_allowlists(self):
        self.app.config['REVEAL_ALLOWED_HOSTS'] = ['reveal.lan']
        self.app.config['REVEAL_ALLOWED_ORIGINS'] = ['http://reveal.lan:4200']
        self.ok(self.call('GET', '/buckets', headers={'Host': 'reveal.lan:8001', 'Origin': 'http://reveal.lan:4200'}))
        self.err(self.call('GET', '/buckets'), 403, 'forbidden_host')


class CorsTests(ApiTestCase):
    def preflight(self, path, method, origin=ORIGIN, request_headers='content-type'):
        return self.client.options(BASE + path, headers={
            'Origin': origin, 'Access-Control-Request-Method': method,
            'Access-Control-Request-Headers': request_headers})

    def test_preflight_for_writes(self):
        cases = [('/states/1', 'PUT'), ('/buckets/1', 'PATCH'), ('/buckets/1', 'DELETE'), ('/states/1', 'DELETE'),
                 ('/states', 'POST'), ('/buckets/1/images', 'POST')]
        for origin in (ORIGIN, 'http://127.0.0.1:4200'):
            for path, method in cases:
                with self.subTest(origin=origin, path=path, method=method):
                    resp = self.preflight(path, method, origin)
                    self.assertEqual(resp.status_code, 200)
                    self.assertEqual(resp.headers.get('Access-Control-Allow-Origin'), origin)
                    allowed = [m.strip() for m in resp.headers.get('Access-Control-Allow-Methods', '').split(',')]
                    self.assertIn(method, allowed)
                    self.assertEqual(resp.headers.get('Access-Control-Allow-Headers', '').lower(), 'content-type')
        self.assertEqual(self.sql('SELECT COUNT(*) FROM users'), [(0,)])

    def test_preflight_from_other_origin_gets_no_cors_headers(self):
        resp = self.preflight('/states/1', 'PUT', 'http://evil.example')
        self.assertIsNone(resp.headers.get('Access-Control-Allow-Origin'))
        self.assertIsNone(resp.headers.get('Access-Control-Allow-Methods'))

    def test_error_responses_carry_cors_headers(self):
        resp = self.call('PATCH', '/buckets/9', {'isSaved': True}, headers={'Origin': ORIGIN})
        self.err(resp, 404, 'not_found')
        self.assertEqual(resp.headers.get('Access-Control-Allow-Origin'), ORIGIN)
        self.create_state('a', None)
        resp = self.call('POST', '/states', small_graph('a'), headers={'Origin': ORIGIN})
        self.err(resp, 409, 'name_exists')
        self.assertEqual(resp.headers.get('Access-Control-Allow-Origin'), ORIGIN)

    def test_existing_routes_keep_working(self):
        # api.service.ts sends a custom dataType header to /api/search
        resp = self.client.options('/api/search', headers={
            'Origin': ORIGIN, 'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type,datatype'})
        self.assertEqual(resp.headers.get('Access-Control-Allow-Origin'), ORIGIN)
        self.assertEqual(resp.headers.get('Access-Control-Allow-Headers', '').lower(), 'content-type, datatype')
        resp = self.client.post('/api/search', data=b'{}', content_type='application/json',
                                headers={'Origin': 'http://evil.example'})
        self.assertIsNone(resp.headers.get('Access-Control-Allow-Origin'))
        # images stay open to any origin (flask-cors echoes the origin for '*')
        resp = self.client.get('/dataset/llm/thumbnails/1.jpg', headers={'Origin': 'http://evil.example'})
        self.assertEqual(resp.status_code, 200)
        self.assertIn(resp.headers.get('Access-Control-Allow-Origin'), ('*', 'http://evil.example'))


class ErrorBodyTests(ApiTestCase):
    def test_404_is_json(self):
        for path in ('/nope', '/buckets/abc', '/states/-1', '/buckets/1/images/x', '/'):
            with self.subTest(path=path):
                resp = self.call('GET', path, headers={'Origin': ORIGIN})
                self.err(resp, 404, 'not_found')
                self.assertEqual(resp.headers.get('Access-Control-Allow-Origin'), ORIGIN)
        self.err(self.client.get('/api/users'), 404, 'not_found')

    def test_405_is_json(self):
        for method, path in (('PUT', '/buckets'), ('DELETE', '/collection'), ('POST', '/states/1'),
                             ('PATCH', '/states/1'), ('GET', '/buckets/1/images')):
            with self.subTest(method=method, path=path):
                resp = self.call(method, path)
                self.err(resp, 405, 'method_not_allowed')
                self.assertTrue(resp.headers.get('Allow'))

    def test_500_is_json(self):
        with mock.patch.object(db, 'list_buckets', side_effect=RuntimeError('boom')), \
                self.assertLogs(self.app.logger, 'ERROR'):
            resp = self.call('GET', '/buckets', headers={'Origin': ORIGIN})
        body = self.err(resp, 500, 'internal')
        self.assertIn('boom', body['message'])
        self.assertEqual(resp.headers.get('Access-Control-Allow-Origin'), ORIGIN)

    def test_other_routes_keep_default_errors(self):
        resp = self.client.get('/nothing-here')
        self.assertEqual(resp.status_code, 404)
        self.assertNotEqual(resp.mimetype, 'application/json')
        resp = self.client.get('/api/search')
        self.assertEqual(resp.status_code, 405)
        self.assertNotEqual(resp.mimetype, 'application/json')

    def test_responses_are_compact(self):
        self.create_bucket()
        resp = self.call('GET', '/collection')
        self.assertNotIn(b'\n', resp.data)
        self.assertNotIn(b': ', resp.data)
        self.assertEqual(resp.headers.get('Cache-Control'), 'no-store')


if __name__ == '__main__':
    unittest.main()
