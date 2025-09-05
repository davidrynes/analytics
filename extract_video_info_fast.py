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
    def __init__(self, csv_file, output_file, max_concurrent=3, retry_failed=True, batch_size=50):  # Přidán batch_size
        self.csv_file = csv_file
        self.output_file = output_file
        self.data = None
        self.results = []
        self.max_concurrent = max_concurrent
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.progress_file = "progress.json"
        self.retry_failed = retry_failed
        self.failed_videos = []  # Seznam videí, která selhala
        self.batch_size = batch_size  # Velikost dávky pro batch processing
        
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
            video_title = row['Název článku/videa']
            print(f"[{index+1}] Zpracovávám: {video_title[:50]}...")
            
            extracted_info = None
            novinky_url = ""
            extraction_status = "success"
            
            try:
                # Vyhledání
                if not await self.search_on_seznam(page, video_title):
                    print(f"⚠️ [{index+1}] Vyhledávání selhalo")
                    extraction_status = "search_failed"
                else:
                    # Hledání odkazu
                    novinky_url = await self.find_novinky_link_on_seznam(page, video_title)
                    if not novinky_url:
                        print(f"⚠️ [{index+1}] Odkaz nenalezen")
                        extraction_status = "link_not_found"
                    else:
                        # Extrakce
                        extracted_info = await self.extract_video_info(page, novinky_url)
                        if not extracted_info:
                            print(f"⚠️ [{index+1}] Zdroj se nepodařilo extrahovat")
                            extraction_status = "extraction_failed"
                        else:
                            print(f"✅ [{index+1}] Zdroj úspěšně extrahován")
                            extraction_status = "success"
                            
            except Exception as e:
                print(f"❌ [{index+1}] Chyba při zpracování: {e}")
                extraction_status = "error"
            
            # Určení finálního zdroje na základě statusu
            if extraction_status == "success" and extracted_info:
                clean_extracted_info = extracted_info
            elif extraction_status == "search_failed":
                clean_extracted_info = "Zdroj nenalezen - vyhledávání selhalo"
                if self.retry_failed:
                    self.failed_videos.append((index, row))
            elif extraction_status == "link_not_found":
                clean_extracted_info = "Zdroj nenalezen - odkaz nenalezen"
                if self.retry_failed:
                    self.failed_videos.append((index, row))
            elif extraction_status == "extraction_failed":
                clean_extracted_info = "Zdroj nenalezen - extrakce selhala"
                if self.retry_failed:
                    self.failed_videos.append((index, row))
            else:
                clean_extracted_info = "Zdroj nenalezen - neznámá chyba"
                if self.retry_failed:
                    self.failed_videos.append((index, row))
            
            # VALIDACE a čištění extrahovaného info
            if len(clean_extracted_info) > 200:  # Příliš dlouhé = možná HTML kontaminace
                clean_extracted_info = clean_extracted_info[:100] + "..."
                
            # Odstranění HTML tagů a newlines
            import re
            clean_extracted_info = re.sub(r'<[^>]+>', '', clean_extracted_info)
            clean_extracted_info = clean_extracted_info.replace('\n', ' ').replace('\t', ' ').strip()
            
            # VŽDY vytvoříme záznam - i pro neúspěšné extrakce
            result = {
                'Jméno rubriky': str(row['Jméno rubriky']).strip(),
                'Název článku/videa': str(row['Název článku/videa']).strip(),
                'Views': int(row['Views']),
                'Dokoukanost do 25 %': float(row['Dokoukanost do 25 %']) if pd.notna(row['Dokoukanost do 25 %']) else 0.0,
                'Dokoukanost do 50 %': float(row['Dokoukanost do 50 %']) if pd.notna(row['Dokoukanost do 50 %']) else 0.0,
                'Dokoukanost do 75 %': float(row['Dokoukanost do 75 %']) if pd.notna(row['Dokoukanost do 75 %']) else 0.0,
                'Dokoukanost do 100 %': float(row['Dokoukanost do 100 %']) if pd.notna(row['Dokoukanost do 100 %']) else 0.0,
                'Extrahované info': clean_extracted_info,
                'Novinky URL': str(novinky_url).strip() if novinky_url else ""
            }
            
            self.results.append(result)
            
            # Logování podle statusu
            if extraction_status == "success":
                print(f"✅ [{index+1}] Hotovo: {extracted_info[:30] if extracted_info else 'N/A'}...")
            else:
                print(f"⚠️ [{index+1}] Uloženo s chybou: {clean_extracted_info[:50]}...")
            
            # Aktualizace progress
            self.update_progress(len(self.results), len(self.data), "processing")
            
            # Průběžné ukládání každých 10 videí
            if len(self.results) % 10 == 0:
                await self.save_results()
                print(f"💾 Průběžné uložení - {len(self.results)} videí")
            
            # Anti-bot čekání - zrychleno pro efektivitu
            await asyncio.sleep(random.uniform(1, 3))  # Zrychleno na 1-3s
            
            return result
    
    async def retry_failed_videos(self):
        """Zkusí znovu zpracovat videa, která selhala a aktualizuje jejich záznamy."""
        if not self.failed_videos:
            print("✅ Žádná videa k retry")
            return True
            
        print(f"🔄 Zkouším znovu zpracovat {len(self.failed_videos)} selhaných videí...")
        
        async with async_playwright() as p:
            # Detekce prostředí pro retry - vždy headless na Railway
            is_cloud = (
                os.environ.get('RAILWAY_ENVIRONMENT') or 
                os.environ.get('NODE_ENV') == 'production' or
                os.environ.get('PORT') or
                os.environ.get('RAILWAY_STATIC_URL') or
                os.environ.get('DYNO') or
                os.environ.get('RAILWAY_DEPLOYMENT_ID') or
                os.environ.get('RAILWAY_PROJECT_ID')
            )
            print(f"🌐 Retry Environment variables: RAILWAY_ENVIRONMENT={os.environ.get('RAILWAY_ENVIRONMENT')}, NODE_ENV={os.environ.get('NODE_ENV')}, PORT={os.environ.get('PORT')}")
            
            if is_cloud:
                print("☁️ Retry v CLOUD režimu (headless=True)")
                browser = await p.chromium.launch(headless=True)
            else:
                print("💻 Retry v LOKÁLNÍM režimu (headless=False)")
                browser = await p.chromium.launch(headless=False)
            page = await browser.new_page()
            
            # Nastavení User-Agent
            await page.set_extra_http_headers({
                'User-Agent': self.get_next_user_agent()
            })
            
            retry_success_count = 0
            
            # Zpracování selhaných videí
            for index, row in self.failed_videos:
                try:
                    video_title = row['Název článku/videa']
                    print(f"🔄 Retry [{index+1}]: {video_title[:50]}...")
                    
                    extracted_info = None
                    novinky_url = ""
                    retry_success = False
                    
                    # Vyhledání
                    if await self.search_on_seznam(page, video_title):
                        # Hledání odkazu
                        novinky_url = await self.find_novinky_link_on_seznam(page, video_title)
                        if novinky_url:
                            # Extrakce
                            extracted_info = await self.extract_video_info(page, novinky_url)
                            if extracted_info:
                                retry_success = True
                    
                    # Najdeme existující záznam v results a aktualizujeme ho
                    for i, result in enumerate(self.results):
                        if (result['Název článku/videa'] == video_title and 
                            result['Jméno rubriky'] == row['Jméno rubriky']):
                            
                            if retry_success:
                                # Úspěšný retry - aktualizujeme zdroj
                                clean_extracted_info = extracted_info
                                if len(clean_extracted_info) > 200:
                                    clean_extracted_info = clean_extracted_info[:100] + "..."
                                
                                import re
                                clean_extracted_info = re.sub(r'<[^>]+>', '', clean_extracted_info)
                                clean_extracted_info = clean_extracted_info.replace('\n', ' ').replace('\t', ' ').strip()
                                
                                self.results[i]['Extrahované info'] = clean_extracted_info
                                self.results[i]['Novinky URL'] = str(novinky_url).strip()
                                
                                print(f"✅ Retry [{index+1}] Úspěšný! Aktualizován zdroj: {extracted_info[:30]}...")
                                retry_success_count += 1
                            else:
                                # Retry selhal - ponecháme původní chybový záznam
                                print(f"⚠️ Retry [{index+1}] Selhal - ponechávám původní chybový záznam")
                            break
                    
                    # Anti-bot čekání pro retry
                    await asyncio.sleep(random.uniform(1.5, 3))
                    
                except Exception as e:
                    print(f"❌ Retry [{index+1}] Chyba: {e}")
                    continue
            
            await browser.close()
        
        print(f"✅ Retry dokončen. Úspěšně aktualizováno {retry_success_count}/{len(self.failed_videos)} videí")
        return True
    
    async def process_batch(self, browser, batch_data, batch_number, total_batches):
        """Zpracuje jednu dávku videí."""
        print(f"📦 Zpracovávám dávku {batch_number}/{total_batches} ({len(batch_data)} videí)")
        
        # Vytvoření více pages pro concurrent processing v dávce
        pages = []
        for i in range(self.max_concurrent):
            context = await browser.new_context(user_agent=self.get_next_user_agent())
            page = await context.new_page()
            pages.append(page)
        
        try:
            # Rozdělení práce mezi pages v dávce
            tasks = []
            for idx, (index, row) in enumerate(batch_data.iterrows()):
                page_index = idx % len(pages)
                page = pages[page_index]
                task = self.process_video_worker(page, index, row)
                tasks.append(task)
            
            # Spuštění tasků v dávce s timeout
            try:
                batch_timeout = min(15*60, 25*60 // total_batches)  # Max 15 minut na dávku nebo rovnoměrně rozděleno
                results = await asyncio.wait_for(
                    asyncio.gather(*tasks, return_exceptions=True),
                    timeout=batch_timeout
                )
            except asyncio.TimeoutError:
                print(f"⏰ Timeout dávky {batch_number} po {batch_timeout//60} minutách")
                results = []
            
            completed_count = len([r for r in results if r is not None and not isinstance(r, Exception)])
            print(f"✅ Dávka {batch_number}/{total_batches} dokončena! Zpracováno {completed_count}/{len(batch_data)} videí")
            
            # Uložení po každé dávce
            await self.save_results()
            
            return completed_count
            
        finally:
            # Uzavření pages v dávce
            for page in pages:
                try:
                    await page.close()
                except:
                    pass

    async def run_concurrent(self, max_videos=None):
        """Spustí BATCH zpracování po dávkách."""
        if not await self.load_data():
            return False
        
        data_to_process = self.data
        if max_videos:
            data_to_process = self.data.head(max_videos)
        
        # Rozdělení na dávky
        total_videos = len(data_to_process)
        total_batches = (total_videos + self.batch_size - 1) // self.batch_size  # Ceiling division
        
        print(f"🚀 Spouštím BATCH zpracování {total_videos} videí")
        print(f"📦 Rozděleno na {total_batches} dávek po {self.batch_size} videích")
        print(f"⚙️  {self.max_concurrent} concurrent workers na dávku")
        
        # Inicializace progress
        self.update_progress(0, total_videos, "starting", "Spouštím batch zpracování...")
        
        async with async_playwright() as p:
            # Detekce prostředí - cloud vs lokální
            is_cloud = (
                os.environ.get('RAILWAY_ENVIRONMENT') or 
                os.environ.get('NODE_ENV') == 'production' or
                os.environ.get('PORT') or  # Railway vždy nastaví PORT
                os.environ.get('RAILWAY_STATIC_URL') or  # Railway specific
                os.environ.get('RAILWAY_DEPLOYMENT_ID') or  # Railway specific
                os.environ.get('RAILWAY_PROJECT_ID') or  # Railway specific
                os.environ.get('DYNO')  # Heroku fallback
            )
            
            print(f"🌐 Detekce prostředí: is_cloud={is_cloud}")
            print(f"🌐 Environment variables: RAILWAY_ENVIRONMENT={os.environ.get('RAILWAY_ENVIRONMENT')}, NODE_ENV={os.environ.get('NODE_ENV')}, PORT={os.environ.get('PORT')}")
            print(f"🌐 Railway specific: RAILWAY_DEPLOYMENT_ID={os.environ.get('RAILWAY_DEPLOYMENT_ID')}, RAILWAY_PROJECT_ID={os.environ.get('RAILWAY_PROJECT_ID')}")
            
            if is_cloud:
                print("☁️ Spouštím v CLOUD režimu (headless=True)")
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
                print("💻 Spouštím v LOKÁLNÍM režimu (headless=False)")
                # Lokální prostředí - non-headless pro debugging
                browser = await p.chromium.launch(headless=False, slow_mo=500)
            
            try:
                total_processed = 0
                
                # Zpracování po dávkách
                for batch_num in range(total_batches):
                    start_idx = batch_num * self.batch_size
                    end_idx = min(start_idx + self.batch_size, total_videos)
                    
                    # Získání dávky dat
                    batch_data = data_to_process.iloc[start_idx:end_idx]
                    
                    print(f"\n📦 === DÁVKA {batch_num + 1}/{total_batches} ===")
                    print(f"📊 Videí v dávce: {len(batch_data)} (indexy {start_idx}-{end_idx-1})")
                    print(f"📈 Celkový pokrok: {len(self.results)}/{total_videos} videí")
                    
                    # Zpracování dávky
                    batch_processed = await self.process_batch(browser, batch_data, batch_num + 1, total_batches)
                    total_processed += batch_processed
                    
                    # Aktualizace celkového progressu
                    self.update_progress(
                        len(self.results), 
                        total_videos, 
                        "processing", 
                        f"Dokončena dávka {batch_num + 1}/{total_batches}. Zpracováno {len(self.results)} videí."
                    )
                    
                    # Krátká pauza mezi dávkami pro stabilitu
                    if batch_num < total_batches - 1:  # Ne po poslední dávce
                        print(f"⏸️  Pauza 3s mezi dávkami...")
                        await asyncio.sleep(3)
                
                print(f"\n✅ VŠECHNY DÁVKY DOKONČENY!")
                print(f"📊 Celkem zpracováno: {len(self.results)}/{total_videos} videí")
                
                # Finální progress update
                self.update_progress(len(self.results), total_videos, "completed", f"Dokončeno! Zpracováno {len(self.results)} videí")
                
                # Finální uložení
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
    # Čtení argumentů z command line
    if len(sys.argv) >= 3:
        csv_file = sys.argv[1]
        output_file = sys.argv[2]
    else:
        # Fallback pro lokální testování
        csv_file = "/Users/david.rynes/Desktop/_DESKTOP/_CODE/statistiky/datasets/20250904T202854_cc5944cd/clean.csv"
        output_file = "/Users/david.rynes/Desktop/_DESKTOP/_CODE/statistiky/datasets/20250904T202854_cc5944cd/extracted.csv"
        print("⚠️ Používám hardcoded cesty - pro produkci předejte argumenty!")
    
    print(f"📂 CSV soubor: {csv_file}")
    print(f"📂 Výstupní soubor: {output_file}")
    
    if not os.path.exists(csv_file):
        print(f"❌ Vstupní soubor {csv_file} neexistuje.")
        return
    
    print("🚀" + "=" * 60)
    print("RYCHLÝ SKRIPT PRO EXTRAKCI Z NOVINKY.CZ")
    print("🚀" + "=" * 60)
    
    # Možnost limitovat počet videí pro testování
    max_videos = None
    if len(sys.argv) >= 4 and sys.argv[3].strip():  # Kontrola, že argument není prázdný
        try:
            max_videos = int(sys.argv[3])
            print(f"🔢 Limit videí: {max_videos}")
        except ValueError:
            print("⚠️ Neplatný limit videí, zpracovávám všechna")
    else:
        print("📊 Zpracovávám všechna videa (bez limitu)")
    
    # Možnost nastavit velikost dávky
    batch_size = 50  # Default batch size
    if len(sys.argv) >= 5:
        try:
            batch_size = int(sys.argv[4])
            print(f"📦 Velikost dávky: {batch_size}")
        except ValueError:
            print("⚠️ Neplatná velikost dávky, používám default 50")
    
    # Vytvoření extraktoru s batch processing
    extractor = FastVideoInfoExtractor(
        csv_file, 
        output_file, 
        max_concurrent=3, 
        retry_failed=True, 
        batch_size=batch_size
    )
    
    # Spuštění rychlé extrakce
    start_time = time.time()
    success = await extractor.run_concurrent(max_videos=max_videos)
    end_time = time.time()
    
    if success:
        print(f"\n⚡ BATCH EXTRAKCE DOKONČENA za {end_time - start_time:.1f} sekund! ⚡")
        
        # Spočítáme statistiky úspěšných a neúspěšných extrakcí
        successful_extractions = 0
        failed_extractions = 0
        
        for result in extractor.results:
            if result['Extrahované info'].startswith('Zdroj nenalezen'):
                failed_extractions += 1
            else:
                successful_extractions += 1
        
        total_videos = len(extractor.results)
        success_rate = (successful_extractions / total_videos * 100) if total_videos > 0 else 0
        
        print(f"📊 Statistiky:")
        print(f"   • Celkem zpracováno: {total_videos} videí")
        print(f"   • ✅ Úspěšné extrakce: {successful_extractions} ({success_rate:.1f}%)")
        print(f"   • ⚠️  Neúspěšné extrakce: {failed_extractions} ({100-success_rate:.1f}%)")
        print(f"   • 🔄 Retry pokusů: {len(extractor.failed_videos) if hasattr(extractor, 'failed_videos') else 0}")
        print(f"   • 🌐 Prostředí: {'CLOUD' if os.environ.get('PORT') else 'LOKÁLNÍ'}")
        print(f"   • 📦 Batch velikost: {extractor.batch_size}")
        
        if failed_extractions > 0:
            print(f"\n💡 Tip: Videa s 'Zdroj nenalezen' můžete dodatečně upravit v Dataset Editoru")
    else:
        print(f"\n❌ EXTRAKCE SELHALA")

if __name__ == "__main__":
    try:
        asyncio.run(main())
        print("🏁 Skript dokončen úspěšně")
    except Exception as e:
        print(f"❌ Kritická chyba: {e}")
        raise
    finally:
        print("🧹 Cleanup dokončen")
        import sys
        sys.exit(0)