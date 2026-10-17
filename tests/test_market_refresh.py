import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC=importlib.util.spec_from_file_location('refresh_market',Path(__file__).resolve().parents[1]/'tools/refresh_market.py')
market=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(market)
ARTICLE='<a href="https://www.pokemon.cn/tcg/event/24186.html"><h3>官方赛事 &amp; 特典</h3><span>Event</span><time>2026-10-15</time></a>'

class MarketRefreshTests(unittest.TestCase):
    def test_news_parsing_keeps_official_dated_articles_and_deduplicates(self):
        parsed=market.parse_news(ARTICLE+ARTICLE+'<a href="javascript:alert(1)">bad 2026-10-15</a>')
        self.assertEqual(len(parsed),1)
        self.assertEqual(parsed[0]['title'],'官方赛事 & 特典')
        self.assertEqual(parsed[0]['date'],'2026-10-15')

    def test_request_has_a_wall_clock_deadline_and_rejects_oversized_responses(self):
        with patch.object(market.subprocess,'run',side_effect=subprocess.TimeoutExpired('fetch',25)) as run:
            with self.assertRaises(TimeoutError):market.fetch('https://www.pokemon.cn/tcg/')
            self.assertEqual(run.call_args.kwargs['timeout'],25)
        with patch.object(market.subprocess,'run',return_value=subprocess.CompletedProcess([],0,b'x'*(4194305),b'')):
            with self.assertRaises(ValueError):market.fetch('https://www.pokemon.cn/tcg/')

    def test_partial_refresh_retains_failed_quote_values_and_original_observation_times(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);file=root/'data/shop/market-feed.json';file.parent.mkdir(parents=True)
            quote={'cents':1000,'source_url':'https://www.pokemon.cn/tcg/product/16268.html','observed_at':'2026-01-01T00:00:00Z'}
            old={'schema_version':1,'currency':'CNY','language':'zh-CN','updated_at':'2026-01-01T00:00:00Z','products':{'CS1aC':quote},'cards':{},'news':[]}
            file.write_text(json.dumps(old))
            def fetch(url):
                if url=='https://www.pokemon.cn/tcg/':return ARTICLE
                raise TimeoutError('upstream unavailable')
            with patch.object(market,'ROOT',root),patch.object(market,'fetch',side_effect=fetch),patch('sys.argv',['refresh_market.py']),contextlib.redirect_stdout(io.StringIO()):
                market.main()
            new=json.loads(file.read_text())
            self.assertEqual(new['products'],old['products'])
            self.assertEqual(len(new['news']),1)
            self.assertEqual(len(new['refresh_errors']),2)

    def test_all_sources_failing_does_not_rewrite_snapshot_or_claim_freshness(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);file=root/'data/shop/market-feed.json';file.parent.mkdir(parents=True)
            original='{"products":{},"news":[],"updated_at":"2026-01-01T00:00:00Z"}'
            file.write_text(original)
            with patch.object(market,'ROOT',root),patch.object(market,'fetch',side_effect=TimeoutError('unavailable')),patch('sys.argv',['refresh_market.py']),contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaises(SystemExit):market.main()
            self.assertEqual(file.read_text(),original)

if __name__=='__main__':unittest.main()
