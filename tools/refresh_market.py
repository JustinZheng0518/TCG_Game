#!/usr/bin/env python3
"""Refresh official Simplified-Chinese MSRP/news. Preserve dated values on failure.
Never treats official MSRP as card resale price or translates English card quotes.
"""
import argparse,html,json,re,subprocess,sys
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
UA='TCG_Game/1.0 (official product/news research; https://github.com/JustinZheng0518/TCG_Game)'

def plain(value):
    return re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]+>',' ',value))).strip()

def parse_news(body):
    items=[];seen=set()
    for url,content in re.findall(r'<a\b[^>]*href="([^"]+)"[^>]*>(.*?)</a>',body,re.S):
        if not re.fullmatch(r'https://www\.pokemon\.cn/tcg/(?:product/|event/|campaign/)?\d+\.html',url) or url in seen:continue
        text=plain(content);match=re.search(r'\b(20\d{2}-\d{2}-\d{2})\b',text)
        if not match:continue
        title=re.sub(r'\s+(?:Product|Event|Campaign|Other|Column)\s+.*$','',text).strip()
        if not title:continue
        items.append({'title':title[:240],'date':match[1],'source_url':url})
        seen.add(url)
    return items[:16]

def fetch(url):
    # urllib's socket timeout is not a wall-clock limit (DNS, redirects, slow
    # chunked bodies can exceed it). Bound each public-source request end to end.
    code="import sys,urllib.request; req=urllib.request.Request(sys.argv[1],headers={'User-Agent':sys.argv[2]}); response=urllib.request.urlopen(req,timeout=12); sys.stdout.buffer.write(response.read(4194305))"
    try:
        result=subprocess.run([sys.executable,'-c',code,url,UA],capture_output=True,timeout=25,check=False)
    except subprocess.TimeoutExpired as exc:
        raise TimeoutError('source exceeded 25-second wall-clock limit') from exc
    if result.returncode:
        detail=result.stderr.decode('utf-8',errors='replace').strip().splitlines()
        raise RuntimeError(detail[-1][:240] if detail else 'source request failed')
    if len(result.stdout)>4*1024*1024:raise ValueError('source response exceeds 4 MiB')
    return result.stdout.decode('utf-8')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--offline-news',type=Path);args=parser.parse_args()
    path=ROOT/'data/shop/market-feed.json'
    feed=json.loads(path.read_text()) if path.exists() else {'schema_version':1,'currency':'CNY','language':'zh-CN','products':{},'cards':{},'news':[]}
    now=datetime.now(timezone.utc).isoformat(timespec='seconds')
    changed=False;errors=[]
    try:
        body=args.offline_news.read_text() if args.offline_news else fetch('https://www.pokemon.cn/tcg/')
        news=parse_news(body)
        if not news:raise ValueError('no official news found; refusing to erase existing news')
        feed['news']=news;feed['news_observed_at']=now;changed=True
    except Exception as exc:errors.append('news: '+str(exc))
    if not args.offline_news:
        # Match exact declarations, not arbitrary currency amounts elsewhere on the page.
        sources=[('https://www.pokemon.cn/tcg/product/16268.html',[
          (['CS1aC','CS1bC'],r'5张装[：:]\s*(10)元/包',1000),
          (['CS1DC'],r'售价均由40元/盒调整至(30)元/盒',3000)]),
          ('https://www.pokemon.cn/tcg/product/23939.html',[
          (['CSVH6C'],r'建议零售价\s*(20)元',2000)])]
        for url,rules in sources:
            try:
                body=fetch(url);text=plain(body)
                for ids,pattern,expected in rules:
                    match=re.search(pattern,text)
                    if not match or int(match[1])*100!=expected:raise ValueError('official wording changed; needs review')
                    for code in ids:feed['products'][code]={'cents':expected,'kind':'official_msrp','source_url':url,'observed_at':now,'reference_date':'2023-04-30' if '16268' in url else '2026-09-21'}
                    changed=True
            except Exception as exc:errors.append(url+': '+str(exc))
    if changed:
        feed['updated_at']=now
        feed['refresh_errors']=errors
        path.write_text(json.dumps(feed,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'updated':changed,'news':len(feed['news']),'official_product_prices':len(feed['products']),'card_market_quotes':len(feed.get('cards',{})),'errors':errors},ensure_ascii=False))
    if not changed:raise SystemExit(1)
if __name__=='__main__':main()
