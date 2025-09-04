#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OPTIMIZED Playwright skript pro rychlé vyhledávání videí na Google a extrakci informací z Novinky.cz.
- Zkrácené čekací doby
- Concurrent processing (více videí současně)
- Optimalizované vyhledávání
"""

import asyncio
import pandas as pd
import time
import random
from playwright.async_api import async_playwright
import csv
import sys
import os
import urllib.parse
import json
from concurrent.futures import ThreadPoolExecutor

class FastVideoInfoExtractor:
    def __init__(self, csv_file, output_file, max_concurrent=2, retry_failed=True):  # Sníženo na 2 kvůli anti-bot
        self.csv_file = csv_file
        self.output_file = output_file
        self.data = None
        self.results = []
        self.max_concurrent = max_concurrent
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.progress_file = "progress.json"
        self.retry_failed = retry_failed
        self.failed_videos = []  # Seznam videí, která selhala
        
        # Seznam různých User-Agent pro rotaci
        self.user_agents = [
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ]
        
        # Index pro rotaci User-Agent
        self.current_user_agent_index = 0
        
    def update_progress(self, current, total, status="processing", message=None):
        """Aktualizuje progress soubor."""
        try:
            progress_data = {
                "current": current,
                "total": total,
                "status": status,
                "message": message or f"Zpracováno {current} z {total} videí",
                "percentage": round((current / total * 100), 1) if total > 0 else 0
            }
            with open(self.progress_file, 'w', encoding='utf-8') as f:
                json.dump(progress_data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Chyba při aktualizaci progress: {e}")
        
    def get_next_user_agent(self):
        """Vrátí další User-Agent z rotace."""
        user_agent = self.user_agents[self.current_user_agent_index]
        self.current_user_agent_index = (self.current_user_agent_index + 1) % len(self.user_agents)
        return user_agent
    
    async def load_data(self):
        """Načte data z CSV souboru."""
        try:
            df = pd.read_csv(self.csv_file, encoding='utf-8', sep=';', quotechar='"', on_bad_lines='skip')
            print(f"Načteno {len(df)} videí z {self.csv_file}")
            
            # Filtrování videí s Views >= 1000
            df_filtered = df[df['Views'] >= 1000].copy()
            print(f"Po filtrování (Views >= 1000): {len(df_filtered)} videí")
            
            if len(df_filtered) == 0:
                print("❌ Žádná videa nesplňují kritérium Views >= 1000")
                return False
            
            self.data = df_filtered
            return True
            
        except Exception as e:
            print(f"Chyba při načítání dat: {e}")
            return False
    
    async def search_on_seznam(self, page, query, max_retries=3):
        """RYCHLÉ vyhledávání na Seznam.cz s retry mechanismem."""
        for attempt in range(max_retries):
            try:
                search_query = f"{query} site:novinky.cz"
                encoded_query = urllib.parse.quote(search_query)
                search_url = f"https://search.seznam.cz/?q={encoded_query}"
                
                await page.goto(search_url, wait_until="domcontentloaded", timeout=8000)  # Zkráceno na 8s
                await page.wait_for_timeout(300)  # ZKRÁCENO na 300ms
                return True
                
            except Exception as e:
                print(f"Pokus {attempt + 1}/{max_retries} selhal: {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(0.5)  # Krátké čekání před retry
                    continue
                print(f"Vyhledávání selhalo po {max_retries} pokusech")
                return False
    
    async def find_novinky_link_on_seznam(self, page, video_title):
        """RYCHLÉ hledání odkazu na Novinky.cz."""
        try:
            novinky_links = page.locator("a[href*='novinky.cz']")
            
            if await novinky_links.count() > 0:
                best_link = None
                best_score = 0
                
                # Omezíme na prvních 10 odkazů pro rychlost
                for i in range(min(await novinky_links.count(), 10)):
                    link = novinky_links.nth(i)
                    href = await link.get_attribute("href")
                    
                    if href and 'novinky.cz' in href and ('/clanek/' in href or '/video/' in href):
                        link_text = await link.text_content()
                        if link_text:
                            score = self.calculate_similarity(video_title.lower(), link_text.lower())
                            if score > best_score:
                                best_score = score
                                best_link = href
                
                if best_link and best_score > 0.1:  # Nižší práh pro rychlost
                    return best_link
                    
            return None
                
        except Exception as e:
            print(f"Chyba při hledání odkazu: {e}")
            return None
    
    def calculate_similarity(self, text1, text2):
        """Rychlý výpočet podobnosti."""
        words1 = set(text1.split()[:10])  # Pouze prvních 10 slov
        words2 = set(text2.split()[:10])
        
        if not words1 or not words2:
            return 0
        
        intersection = words1.intersection(words2)
        union = words1.union(words2)
        
        return len(intersection) / len(union) if union else 0
    
    async def extract_video_info(self, page, novinky_url, max_retries=3):
        """RYCHLÁ extrakce informací z Novinky.cz s retry mechanismem."""
        for attempt in range(max_retries):
            try:
                print(f"🌐 Načítám stránku: {novinky_url}")
                await page.goto(novinky_url, wait_until="domcontentloaded", timeout=15000)  # Zvýšeno na 15s
                await page.wait_for_timeout(1000)  # Zvýšeno na 1s pro lepší načtení
                print(f"✅ Stránka načtena úspěšně")
                
                # Rychlé přijetí cookies (pouze první pokus)
                if attempt == 0:
                    try:
                        cookie_button = page.locator("button[data-testid='cw-button-agree-with-ads'], button:has-text('Souhlasím')")
                        if await cookie_button.count() > 0:
                            await cookie_button.click()
                            await page.wait_for_timeout(300)  # ZKRÁCENO na 300ms
                    except:
                        pass
                
                # ROZŠÍŘENÉ hledání zdrojů - více strategií
                video_info = None
                
                # 1. Hledání pomocí různých selektorů pro zdroj
                selectors_to_try = [
                    "span.f_bJ",  # Původní selektor - hlavní cíl
                    "div.ogm-container span.f_bJ",  # V ogm-container
                    "div.ogm-main-media__container span.f_bJ",  # V media kontejneru
                    "p.c_br span.f_bJ",  # V odstavci s třídou c_br
                    "span.f_bJ",  # Obecně span.f_bJ
                    "div.ogm-main-media__container span",  # Obecnější v media kontejneru
                    "*:has-text('Zdroj:')",  # České "Zdroj:"
                    "*:has-text('Video:')",  # České "Video:"
                    "*:has-text('Foto:')",   # České "Foto:"
                    "*:has-text('Autor:')",  # České "Autor:"
                    "[class*='source']",     # CSS třída obsahující "source"
                    "[class*='author']",     # CSS třída obsahující "author"
                    "[class*='credit']",     # CSS třída obsahující "credit"
                    "figcaption",            # Často obsahuje autorstvo
                    ".media-source",         # Obvyklá třída pro zdroj
                    ".video-source",         # Specificky pro video
                    ".article-source",       # Pro články
                ]
                
                for selector in selectors_to_try:
                    try:
                        elements = page.locator(selector)
                        count = await elements.count()
                        print(f"🔍 Zkouším selektor '{selector}': nalezeno {count} elementů")
                        
                        if count > 0:
                            for i in range(min(count, 3)):  # Max 3 elementy
                                element = elements.nth(i)
                                text = await element.text_content()
                                print(f"   Element {i}: '{text}'")
                                
                                if text and len(text.strip()) > 0:
                                    # Vyčisti a validuj text
                                    clean_text = text.strip()
                                    
                                    # Proveř, jestli je to rozumná délka pro zdroj
                                    if 3 <= len(clean_text) <= 200:
                                        # Odstranění prefixů
                                        for prefix in ['Video:', 'Foto:', 'Zdroj:', 'Autor:']:
                                            if clean_text.startswith(prefix):
                                                clean_text = clean_text[len(prefix):].strip()
                                        
                                        if clean_text and len(clean_text) > 2:
                                            video_info = clean_text
                                            print(f"🎯 Nalezen zdroj pomocí '{selector}': {clean_text[:50]}...")
                                            break
                            
                            if video_info:
                                break
                                
                    except Exception as e:
                        print(f"❌ Chyba při zkoušení selektoru '{selector}': {e}")
                        continue  # Zkus další selektor
                
                # 2. Pokud stále nic, zkusme najít text obsahující klíčová slova
                if not video_info:
                    try:
                        # Hledej text obsahující známé zdroje
                        common_sources = ['ČT24', 'ČTK', 'Reuters', 'AP', 'DPA', 'AFP', 'iStock', 'Shutterstock', 'Getty', 'Profimedia']
                        for source in common_sources:
                            elements = page.locator(f"*:has-text('{source}')")
                            if await elements.count() > 0:
                                element = elements.first
                                text = await element.text_content()
                                if text and source in text:
                                    # Extrahuj jen relevantní část
                                    lines = text.split('\n')
                                    for line in lines:
                                        if source in line and len(line.strip()) < 100:
                                            video_info = line.strip()
                                            print(f"🎯 Nalezen zdroj podle klíčového slova '{source}': {video_info}")
                                            break
                                    if video_info:
                                        break
                            if video_info:
                                break
                    except Exception as e:
                        pass
                
                if video_info and video_info.startswith("Video:"):
                    video_info = video_info[6:].strip()
                
                # Pokud máme validní info, vrátíme ho
                if video_info and len(video_info) > 3:
                    return video_info
                    
            except Exception as e:
                print(f"Pokus {attempt + 1}/{max_retries} extrakce selhal: {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(0.3)  # Krátké čekání před retry
                    continue
                    
        print(f"Extrakce selhala po {max_retries} pokusech")
        return None
    
    async def process_video_worker(self, page, index, row):
        """Worker pro zpracování jednoho videa s semaforem."""
        async with self.semaphore:
            try:
                video_title = row['Název článku/videa']
                print(f"[{index+1}] Zpracovávám: {video_title[:50]}...")
                
                # Vyhledání
                if not await self.search_on_seznam(page, video_title):
                    if self.retry_failed:
                        self.failed_videos.append((index, row))
                    return None
                
                # Hledání odkazu
                novinky_url = await self.find_novinky_link_on_seznam(page, video_title)
                if not novinky_url:
                    if self.retry_failed:
                        self.failed_videos.append((index, row))
                    return None
                
                # Extrakce
                extracted_info = await self.extract_video_info(page, novinky_url)
                
                # VALIDACE před uložením - zabrání HTML kontaminaci
                clean_extracted_info = extracted_info or "N/A"
                if len(clean_extracted_info) > 200:  # Příliš dlouhé = možná HTML kontaminace
                    clean_extracted_info = clean_extracted_info[:100] + "..."
                    
                # Odstranění HTML tagů a newlines
                import re
                clean_extracted_info = re.sub(r'<[^>]+>', '', clean_extracted_info)
                clean_extracted_info = clean_extracted_info.replace('\n', ' ').replace('\t', ' ').strip()
                
                result = {
                    'Jméno rubriky': str(row['Jméno rubriky']).strip(),
                    'Název článku/videa': str(row['Název článku/videa']).strip(),
                    'Views': int(row['Views']),
                    'Dokoukanost do 25 %': float(row['Dokoukanost do 25 %']) if pd.notna(row['Dokoukanost do 25 %']) else 0.0,
                    'Dokoukanost do 50 %': float(row['Dokoukanost do 50 %']) if pd.notna(row['Dokoukanost do 50 %']) else 0.0,
                    'Dokoukanost do 75 %': float(row['Dokoukanost do 75 %']) if pd.notna(row['Dokoukanost do 75 %']) else 0.0,
                    'Dokoukanost do 100 %': float(row['Dokoukanost do 100 %']) if pd.notna(row['Dokoukanost do 100 %']) else 0.0,
                    'Extrahované info': clean_extracted_info,
                    'Novinky URL': str(novinky_url).strip()
                }
                
                self.results.append(result)
                print(f"✅ [{index+1}] Hotovo: {extracted_info[:30] if extracted_info else 'N/A'}...")
                
                # Aktualizace progress
                self.update_progress(len(self.results), len(self.data), "processing")
                
                # Anti-bot čekání - musíme být pomalejší
                await asyncio.sleep(random.uniform(2, 5))  # Pomalejší 2-5s kvůli anti-bot ochraně
                
                return result
                
            except Exception as e:
                print(f"❌ [{index+1}] Chyba: {e}")
                if self.retry_failed:
                    self.failed_videos.append((index, row))
                return None
    
    async def retry_failed_videos(self):
        """Zkusí znovu zpracovat videa, která selhala."""
        if not self.failed_videos:
            print("✅ Žádná videa k retry")
            return True
            
        print(f"🔄 Zkouším znovu zpracovat {len(self.failed_videos)} selhaných videí...")
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            
            # Nastavení User-Agent
            await page.set_extra_http_headers({
                'User-Agent': self.get_next_user_agent()
            })
            
            # Zpracování selhaných videí
            for index, row in self.failed_videos:
                try:
                    print(f"🔄 Retry [{index+1}]: {row['Název článku/videa'][:50]}...")
                    
                    # Vyhledání
                    if not await self.search_on_seznam(page, row['Název článku/videa']):
                        continue
                    
                    # Hledání odkazu
                    novinky_url = await self.find_novinky_link_on_seznam(page, row['Název článku/videa'])
                    if not novinky_url:
                        continue
                    
                    # Extrakce
                    extracted_info = await self.extract_video_info(page, novinky_url)
                    
                    # Uložení výsledku
                    clean_extracted_info = extracted_info or "N/A"
                    if len(clean_extracted_info) > 200:
                        clean_extracted_info = clean_extracted_info[:100] + "..."
                    
                    import re
                    clean_extracted_info = re.sub(r'<[^>]+>', '', clean_extracted_info)
                    clean_extracted_info = clean_extracted_info.replace('\n', ' ').replace('\t', ' ').strip()
                    
                    result = {
                        'Jméno rubriky': str(row['Jméno rubriky']).strip(),
                        'Název článku/videa': str(row['Název článku/videa']).strip(),
                        'Views': int(row['Views']),
                        'Dokoukanost do 25 %': float(row['Dokoukanost do 25 %']) if pd.notna(row['Dokoukanost do 25 %']) else 0.0,
                        'Dokoukanost do 50 %': float(row['Dokoukanost do 50 %']) if pd.notna(row['Dokoukanost do 50 %']) else 0.0,
                        'Dokoukanost do 75 %': float(row['Dokoukanost do 75 %']) if pd.notna(row['Dokoukanost do 75 %']) else 0.0,
                        'Dokoukanost do 100 %': float(row['Dokoukanost do 100 %']) if pd.notna(row['Dokoukanost do 100 %']) else 0.0,
                        'Extrahované info': clean_extracted_info,
                        'Novinky URL': str(novinky_url).strip()
                    }
                    
                    self.results.append(result)
                    print(f"✅ Retry [{index+1}] Hotovo: {extracted_info[:30] if extracted_info else 'N/A'}...")
                    
                    # Anti-bot čekání
                    await asyncio.sleep(random.uniform(3, 6))
                    
                except Exception as e:
                    print(f"❌ Retry [{index+1}] Chyba: {e}")
                    continue
            
            await browser.close()
        
        print(f"✅ Retry dokončen. Celkem výsledků: {len(self.results)}")
        return True
    
    async def run_concurrent(self, max_videos=None):
        """Spustí RYCHLÉ concurrent zpracování."""
        if not await self.load_data():
            return False
        
        data_to_process = self.data
        if max_videos:
            data_to_process = self.data.head(max_videos)
        
        print(f"🚀 Spouštím rychlé zpracování {len(data_to_process)} videí s {self.max_concurrent} concurrent workers")
        
        # Inicializace progress
        self.update_progress(0, len(data_to_process), "starting", "Spouštím zpracování...")
        
        async with async_playwright() as p:
            # Detekce prostředí - cloud vs lokální
            is_cloud = os.environ.get('RAILWAY_ENVIRONMENT') or os.environ.get('NODE_ENV') == 'production'
            
            if is_cloud:
                # Cloud prostředí - headless s optimalizacemi pro Novinky.cz
                browser = await p.chromium.launch(
                    headless=True, 
                    slow_mo=200,  # Pomalejší pro stabilitu
                    args=[
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--no-first-run',
                        '--no-zygote',
                        '--disable-gpu',
                        '--disable-web-security',
                        '--disable-features=VizDisplayCompositor',
                        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    ]
                )
            else:
                # Lokální prostředí - non-headless pro debugging
                browser = await p.chromium.launch(headless=False, slow_mo=500)
            
            # Vytvoření více pages pro concurrent processing
            pages = []
            for i in range(self.max_concurrent):
                context = await browser.new_context(user_agent=self.get_next_user_agent())
                page = await context.new_page()
                pages.append(page)
            
            try:
                # Rozdělení práce mezi pages
                tasks = []
                for idx, (index, row) in enumerate(data_to_process.iterrows()):
                    page_index = idx % len(pages)
                    page = pages[page_index]
                    task = self.process_video_worker(page, index, row)
                    tasks.append(task)
                
                # Spuštění všech tasků současně
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                completed_count = len([r for r in results if r is not None and not isinstance(r, Exception)])
                print(f"✅ Dokončeno! Zpracováno {completed_count} videí")
                
                # Finální progress update
                self.update_progress(completed_count, len(data_to_process), "completed", f"Dokončeno! Zpracováno {completed_count} videí")
                
                # Průběžné ukládání
                await self.save_results()
                
                # Retry selhaných videí
                if self.retry_failed and self.failed_videos:
                    print(f"🔄 Spouštím retry pro {len(self.failed_videos)} selhaných videí...")
                    await self.retry_failed_videos()
                    await self.save_results()
                
            finally:
                await browser.close()
        
        return True
    
    async def save_results(self):
        """Uloží výsledky do CSV."""
        try:
            if self.results:
                df_results = pd.DataFrame(self.results)
                df_results.to_csv(self.output_file, index=False, encoding='utf-8', sep=';')
                print(f"💾 Výsledky uloženy: {len(self.results)} záznamů -> {self.output_file}")
        except Exception as e:
            print(f"Chyba při ukládání: {e}")

async def main():
    """Hlavní funkce."""
    csv_file = "/Users/david.rynes/Desktop/_DESKTOP/_CODE/statistiky/datasets/20250904T141416_c4f7a567/clean.csv"
    output_file = "/Users/david.rynes/Desktop/_DESKTOP/_CODE/statistiky/datasets/20250904T141416_c4f7a567/extracted.csv"
    
    if not os.path.exists(csv_file):
        print(f"❌ Vstupní soubor {csv_file} neexistuje.")
        return
    
    print("🚀" + "=" * 60)
    print("RYCHLÝ SKRIPT PRO EXTRAKCI Z NOVINKY.CZ")
    print("🚀" + "=" * 60)
    
    # Vytvoření extraktoru s anti-bot ochranou a retry mechanismem
    extractor = FastVideoInfoExtractor(csv_file, output_file, max_concurrent=2, retry_failed=True)  # 2 workers + retry
    
    # Spuštění rychlé extrakce - všechna videa
    start_time = time.time()
    success = await extractor.run_concurrent()  # Zpracovat všechna videa
    end_time = time.time()
    
    if success:
        print(f"\n⚡ RYCHLÁ EXTRAKCE DOKONČENA za {end_time - start_time:.1f} sekund! ⚡")
    else:
        print(f"\n❌ EXTRAKCE SELHALA")

if __name__ == "__main__":
    asyncio.run(main())