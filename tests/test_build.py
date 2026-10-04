"""Checks for the generated site. Run: python3 -m unittest discover tests"""

import json
import re
import subprocess
import sys
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"

# Words that must never appear in published pages: the experiments' real locality,
# shop names, the operator's nickname and local machine paths.
FORBIDDEN = [
    "三鷹", "Mitaka", "ボス", "日高屋", "壱角家", "味噌一", "ココカラ", "トモズ",
    "/mnt/", "/tmp/", "/home/", "C:\\", "air9",
]


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hrefs = []
        self.ld = []
        self._in_ld = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("a", "link") and a.get("href"):
            self.hrefs.append(a["href"])
        if tag == "img" and a.get("src"):
            self.hrefs.append(a["src"])
        if tag == "source" and a.get("srcset"):
            self.hrefs.extend(part.strip().split()[0] for part in a["srcset"].split(","))
        if tag == "script" and a.get("type") == "application/ld+json":
            self._in_ld = True

    def handle_endtag(self, tag):
        if tag == "script":
            self._in_ld = False

    def handle_data(self, data):
        if self._in_ld:
            self.ld.append(data)


class BuildTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        subprocess.run([sys.executable, str(ROOT / "build.py")], check=True, capture_output=True)
        cls.pages = sorted(SITE.rglob("index.html"))
        cls.experiences = json.loads((SITE / "experiences.json").read_text(encoding="utf-8"))
        cls.agents = json.loads((SITE / "agents.json").read_text(encoding="utf-8"))

    def test_internal_links_resolve(self):
        for p in self.pages:
            parser = Links()
            parser.feed(p.read_text(encoding="utf-8"))
            for href in parser.hrefs:
                if not href.startswith("/"):
                    continue
                from urllib.parse import urlsplit
                pathname = urlsplit(href).path
                target = SITE / pathname.lstrip("/")
                if pathname.endswith("/"):
                    target = target / "index.html"
                self.assertTrue(target.exists(), f"{p}: broken link {href}")

    def test_jsonld_parses(self):
        for p in self.pages:
            parser = Links()
            parser.feed(p.read_text(encoding="utf-8"))
            for block in parser.ld:
                json.loads(block)

    def test_every_experience_has_a_page_with_its_text(self):
        for e in self.experiences:
            page = (SITE / "experiences" / e["id"] / "index.html").read_text(encoding="utf-8")
            import html as h
            for text in [e["title"], e["short_summary"], e["problem"], e["outcome"], *e["reusable_lessons"]]:
                self.assertIn(h.escape(text), page, f"{e['id']}: HTML is missing JSON text")

    def test_references_exist(self):
        ids = {e["id"] for e in self.experiences}
        agent_ids = {a["id"] for a in self.agents}
        for e in self.experiences:
            self.assertTrue(set(e["agents"]) <= agent_ids, e["id"])
            self.assertTrue(set(e["related_experiences"]) <= ids, e["id"])
            self.assertIn(e["evidence_kind"], {"observed_run", "controlled_deception", "retrospective", "controlled_experiment", "synthetic"})

    def test_deception_experiment_is_labelled(self):
        for e in self.experiences:
            if e["evidence_kind"] == "controlled_deception":
                page = (SITE / "experiences" / e["id"] / "index.html").read_text(encoding="utf-8")
                self.assertIn("controlled deception experiment", page)
                self.assertIn("Nobody phoned any shop", page)

    def test_no_private_details(self):
        for p in SITE.rglob("*"):
            if p.is_file() and p.suffix in {".html", ".json", ".xml", ".txt", ".css"}:
                text = p.read_text(encoding="utf-8")
                for word in FORBIDDEN:
                    self.assertNotIn(word, text, f"{p} contains {word!r}")

    def test_no_agent_card(self):
        self.assertFalse((SITE / ".well-known" / "agent-card.json").exists())

    def test_sitemap_lists_every_page(self):
        sitemap = (SITE / "sitemap.xml").read_text(encoding="utf-8")
        locs = set(re.findall(r"<loc>(.*?)</loc>", sitemap))
        self.assertEqual(len(locs), len([p for p in self.pages if p.parent.name != '404']))

    def test_llms_txt_links_resolve(self):
        text = (SITE / "llms.txt").read_text(encoding="utf-8")
        self.assertTrue(text.startswith("# AICQSOHOO!"))
        for url in re.findall(r"\]\((http[^)]+)\)", text):
            path = url.split("://", 1)[1].split("/", 1)[1] if "/" in url.split("://", 1)[1] else ""
            target = SITE / path
            if url.endswith("/"):
                target = target / "index.html"
            self.assertTrue(target.exists(), f"llms.txt: broken link {url}")

    def test_issue_form_matches_schema(self):
        schema = json.loads((SITE / "submission-schema.json").read_text(encoding="utf-8"))
        form = (ROOT / ".github" / "ISSUE_TEMPLATE" / "experience.yml").read_text(encoding="utf-8")
        form_ids = set(re.findall(r"^\s+id: (\w+)$", form, re.M))
        for field in schema["required"]:
            self.assertIn(field, form_ids, f"issue form is missing required field {field}")
        self.assertTrue(set(schema["properties"]) <= form_ids | {"provenance"}, form_ids)

    def test_counter_only_on_home_with_fallback(self):
        home = (SITE / "index.html").read_text(encoding="utf-8")
        self.assertIn('<span id="hits" data-counter-url="', home)
        self.assertIn(">???????</span>", home)
        self.assertIn('<script src="/counter.js" defer></script>', home)
        self.assertNotIn("counter is fake", home)
        about = (SITE / "about" / "index.html").read_text(encoding="utf-8")
        self.assertNotIn('id="hits"', about)

    def test_counter_script_keeps_no_visitor_data(self):
        js = (SITE / "counter.js").read_text(encoding="utf-8")
        for word in ["document.cookie", "localStorage", "sessionStorage", "navigator.userAgent", "indexedDB"]:
            self.assertNotIn(word, js)
        self.assertIn('credentials: "omit"', js)
        worker = (ROOT / "worker" / "src" / "index.js").read_text(encoding="utf-8")
        self.assertNotIn("CF-Connecting-IP", worker)


if __name__ == "__main__":
    unittest.main()
