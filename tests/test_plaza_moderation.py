import runpy
import sqlite3
import unittest
from pathlib import Path

sql_for = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'worker/scripts/plaza-moderation-sql.py'))['generate_sql']

class PlazaModerationTests(unittest.TestCase):
    def test_bounded_inspect_hide_restore_leave_other_rows_and_private_data_intact(self):
        db = sqlite3.connect(':memory:')
        db.executescript('''CREATE TABLE plaza_posts (id INTEGER PRIMARY KEY, payload TEXT, mode TEXT, created TEXT, hidden INTEGER DEFAULT 0);
          CREATE TABLE usage_reports (payload TEXT, state TEXT);
          INSERT INTO usage_reports VALUES ('private fixture', 'pending_review');
          INSERT INTO plaza_posts VALUES (1,'parent','test','2026-10-19',0),(2,'reply referring to 1','test','2026-10-19',0),(3,'separate','visit','2026-10-19',0);''')
        self.assertEqual(db.execute(sql_for(1,'test')).fetchall(), [(1,'test','2026-10-19',0,'parent')])
        self.assertEqual(db.execute(sql_for(1,'visit','hide')).fetchall(), [])
        self.assertEqual(db.execute(sql_for(1,'test','hide')).fetchall(), [(1,'test',1)])
        self.assertEqual(db.execute(sql_for(1,'test','hide')).fetchall(), [])
        self.assertEqual(db.execute('SELECT id FROM plaza_posts WHERE hidden=0 ORDER BY id').fetchall(), [(2,),(3,)])
        self.assertEqual(db.execute('SELECT payload FROM plaza_posts WHERE id=2').fetchone()[0], 'reply referring to 1')
        self.assertEqual(db.execute(sql_for(1,'test','restore')).fetchall(), [(1,'test',0)])
        self.assertEqual(db.execute('SELECT COUNT(*) FROM plaza_posts').fetchone()[0],3)
        self.assertEqual(db.execute('SELECT * FROM usage_reports').fetchall(), [('private fixture','pending_review')])

    def test_rejects_unbounded_ids_and_sql_injection(self):
        for value in [0,-1,True,1.5,'1 OR 1=1',9007199254740992]:
            with self.assertRaises(ValueError): sql_for(value,'test','hide')
        for mode,action in [("test'; DROP TABLE plaza_posts;--",'hide'),('test','delete'),('test','hide; DELETE')]:
            with self.assertRaises(ValueError): sql_for(1,mode,action)
